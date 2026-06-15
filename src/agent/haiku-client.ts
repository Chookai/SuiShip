import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { ExtractionResultSchema } from "./schemas/extraction-result";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompts/extraction-prompt";
import type { ExtractedDoc } from "./schemas/extraction-result";
import type { PdfFile } from "../types";

const logger = pino({ name: "haiku-client" });

const MODEL = "claude-haiku-4-5";

/** Strip ```json ... ``` or ``` ... ``` code fences that Haiku sometimes adds. */
function stripCodeFences(text: string): string {
  const match = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return match ? match[1].trim() : text.trim();
}
const MAX_TOKENS = 8192;
const MAX_API_RETRIES = 3;
const JSON_RETRY_LIMIT = 1;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function extractFromPdf(
  file: PdfFile,
  client: Anthropic,
  groundingContext?: string | null
): Promise<ExtractedDoc> {
  const startMs = Date.now();
  const base64 = file.buffer.toString("base64");

  // Build the user message. Grounding context is injected BEFORE the PDF so Haiku
  // can cross-check extracted fields against prior documents in the same shipment.
  // It goes in the user message (not the cached system prompt) to preserve the cache hit.
  const userContent: Anthropic.MessageParam["content"] = [
    ...(groundingContext
      ? [{
          type: "text" as const,
          text: `## Prior documents already uploaded for this shipment\nUse the following to cross-check consistency. If you find a conflict with any extracted field, add a note like "CONFLICT: field=X extracted=Y expected=Z" in extraction_notes.\n\n${groundingContext}`,
        }]
      : []),
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64,
      },
    } as unknown as Anthropic.ContentBlockParam,
    { type: "text", text: "Extract this document." },
  ];

  let retries = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.pow(2, attempt - 1) * 500;
      await sleep(delayMs);
    }

    try {
      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          // Prompt caching: system prompt is ~3500 tokens; cache after first call
          system: [
            {
              type: "text",
              text: EXTRACTION_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
          ],
          messages: [{ role: "user", content: userContent }],
        },
        {
          headers: { "anthropic-beta": "pdfs-2024-09-25,prompt-caching-2024-07-31" },
        }
      );

      const latencyMs = Date.now() - startMs;
      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");

      retries = attempt;

      // Strip markdown code fences Haiku sometimes adds, then parse JSON
      const cleanText = stripCodeFences(rawText);

      let parsed: unknown;
      let jsonRetries = 0;
      while (true) {
        try {
          parsed = JSON.parse(cleanText);
          break;
        } catch {
          if (jsonRetries >= JSON_RETRY_LIMIT) {
            throw new Error(`JSON parse failed after ${jsonRetries + 1} attempt(s): ${cleanText.slice(0, 200)}`);
          }
          jsonRetries++;
          logger.warn({ fileId: file.id }, "JSON parse error — retrying with follow-up");

          const followUp = await client.messages.create(
            {
              model: MODEL,
              max_tokens: MAX_TOKENS,
              system: [
                {
                  type: "text",
                  text: EXTRACTION_SYSTEM_PROMPT,
                  cache_control: { type: "ephemeral" },
                } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
              ],
              messages: [
                { role: "user", content: userContent },
                { role: "assistant", content: rawText },
                { role: "user", content: "Return only valid JSON, no other text. Do not use code fences." },
              ],
            },
            {
              headers: { "anthropic-beta": "pdfs-2024-09-25,prompt-caching-2024-07-31" },
            }
          );
          const followRaw = followUp.content
            .filter((b) => b.type === "text")
            .map((b) => (b as Anthropic.TextBlock).text)
            .join("");
          const followClean = stripCodeFences(followRaw);
          try {
            parsed = JSON.parse(followClean);
            break;
          } catch {
            throw new Error(`JSON parse failed after follow-up: ${followClean.slice(0, 200)}`);
          }
        }
      }

      const validationResult = ExtractionResultSchema.safeParse(parsed);
      if (!validationResult.success) {
        throw new Error(`Zod validation failed: ${validationResult.error.message}`);
      }

      const result = validationResult.data;

      logger.info({
        fileId: file.id,
        latencyMs,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        docType: result.document_type,
        confidence: result.confidence,
        retries,
      }, "Haiku extraction complete");

      return {
        file_id: file.id,
        file_name: file.name,
        file_size_bytes: file.sizeBytes,
        extraction_result: result,
        haiku_latency_ms: latencyMs,
        haiku_input_tokens: response.usage.input_tokens,
        haiku_output_tokens: response.usage.output_tokens,
        retries,
        error: null,
      };
    } catch (err) {
      lastError = err;
      const isApiError = err instanceof Anthropic.APIError;
      if (isApiError && attempt < MAX_API_RETRIES) {
        logger.warn({ fileId: file.id, attempt, status: err.status }, "API error — retrying");
        continue;
      }
      // Non-retriable or exhausted retries
      break;
    }
  }

  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  logger.error({ fileId: file.id, error: errorMsg }, "Extraction failed after retries");

  // Return an error doc so the aggregator can still process it
  return {
    file_id: file.id,
    file_name: file.name,
    file_size_bytes: file.sizeBytes,
    extraction_result: {
      document_type: "unknown",
      confidence: 0,
      extraction_notes: [`Extraction failed: ${errorMsg}`],
      data: null,
    },
    haiku_latency_ms: Date.now() - startMs,
    haiku_input_tokens: 0,
    haiku_output_tokens: 0,
    retries: MAX_API_RETRIES,
    error: errorMsg,
  };
}
