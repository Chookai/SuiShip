import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import pino from "pino";
import { crossValidate } from "./cross-validator";
import type { ExtractedDoc } from "./schemas/extraction-result";
import type { ValidationIssue } from "./schemas/aggregate-result";

const logger = pino({ name: "llm-cross-validator" });

type DetectedDocs = {
  commercial_invoice: ExtractedDoc[];
  packing_list: ExtractedDoc[];
  bill_of_lading: ExtractedDoc[];
  certificate_of_origin: ExtractedDoc[];
};

const CROSS_VALIDATION_SYSTEM_PROMPT = `You are a shipping document cross-validation agent. You receive extracted key fields from multiple shipping documents and must verify they are internally consistent with each other.

Check for mismatches across documents in these fields:
- Invoice reference numbers (should match across commercial invoice, packing list, BOL invoice_reference, and COO goods invoice_reference)
- Shipper / exporter name (should be the same entity across all docs — allow reasonable abbreviations)
- Consignee / importer name (should be the same entity across all docs — allow reasonable abbreviations)
- BL number (BOL bl_number) vs invoice sender_reference (should match when both present)
- Country of origin (should match across invoice line items and COO country_of_origin)
- HS codes (should be consistent across invoice and COO)
- Total quantities and weights (packing list totals should broadly match invoice totals)

Severity rules:
- "error": Definitive factual mismatch — different invoice numbers, clearly different company names, different HS codes, different countries of origin. These indicate documents belong to DIFFERENT shipments.
- "warning": Soft mismatch — minor formatting differences, date format ambiguity, abbreviated vs full names that could refer to the same entity.
- "info": Observation only — a field is present in some docs but null in others (not necessarily a problem).

Allow for reasonable abbreviations and aliases. For example "Java Highlands Co." and "Java Highlands Cooperative Sdn Bhd" are the SAME company — do NOT flag. Be strict on reference numbers and HS codes.

If a field is null in one or more documents, that alone is NOT an error — only flag when two non-null values clearly conflict.

Return ONLY valid JSON — no markdown, no code fences, no commentary. First character must be { and last must be }:
{
  "overall_verdict": "aligned",
  "verdict_reason": "one sentence summary",
  "issues": []
}

overall_verdict must be one of: "aligned", "mismatched", "insufficient_data"
- "aligned": all checked fields are consistent
- "mismatched": at least one "error" severity issue found
- "insufficient_data": fewer than 2 document types present to compare`;

// Resilient issue schema: accepts alternative field names Haiku may produce,
// then normalises them into the canonical shape.
const IssueSchema = z
  .object({
    field: z.string().optional(),
    check: z.string().optional(),            // alternative for "field"
    severity: z.enum(["error", "warning", "info"]).optional(),
    message: z.string().optional(),
    description: z.string().optional(),      // alternative for "message"
    explanation: z.string().optional(),      // alternative for "message"
    documents_affected: z.array(z.string()).optional(),
    affected_documents: z.array(z.string()).optional(), // alternative
    docs: z.array(z.string()).optional(),               // alternative
    values: z.record(z.string(), z.unknown()).optional(),
    mismatch: z.record(z.string(), z.unknown()).optional(), // alternative for "values"
  })
  .passthrough()
  .transform((v) => ({
    field: v.field ?? v.check ?? "unknown_field",
    severity: v.severity ?? "warning",
    message: v.message ?? v.description ?? v.explanation ?? `${v.field ?? "Field"} mismatch`,
    documents_affected: v.documents_affected ?? v.affected_documents ?? v.docs ?? [],
    values: (v.values ?? v.mismatch ?? {}) as Record<string, unknown>,
  }));

const LLMValidationResponseSchema = z.object({
  overall_verdict: z.enum(["aligned", "mismatched", "insufficient_data"]).optional().default("aligned"),
  verdict_reason: z.string().optional().default(""),
  issues: z.array(IssueSchema).optional().default([]),
});

function buildDocSummary(detected: DetectedDocs): string {
  const summary: Record<string, unknown> = {};

  const inv = detected.commercial_invoice[0];
  if (inv?.extraction_result.document_type === "commercial_invoice") {
    const d = inv.extraction_result.data;
    summary.commercial_invoice = {
      file: inv.file_name,
      invoice_number: d.invoice_number,
      invoice_date: d.invoice_date,
      sender_reference: d.sender_reference,
      shipper_name: d.sender?.name,
      recipient_name: d.recipient?.name,
      incoterms: d.incoterms,
      currency: d.currency,
      total_invoice_amount: d.totals?.total_invoice_amount,
      total_net_weight: d.totals?.total_net_weight,
      line_items: d.line_items?.map((li) => ({
        description: li.description,
        hs_code: li.hs_code,
        country_of_origin: li.country_of_origin,
        quantity: li.quantity,
        subtotal: li.subtotal,
      })),
    };
  }

  const pl = detected.packing_list[0];
  if (pl?.extraction_result.document_type === "packing_list") {
    const d = pl.extraction_result.data;
    summary.packing_list = {
      file: pl.file_name,
      packing_list_number: d.packing_list_number,
      invoice_number: d.invoice_number,
      ship_date: d.ship_date,
      shipper_name: d.shipper?.name,
      consignee_name: d.consignee?.name,
      total_packages: d.totals?.total_packages,
      total_gross_weight: d.totals?.total_gross_weight,
      total_net_weight: d.totals?.total_net_weight,
    };
  }

  const bol = detected.bill_of_lading[0];
  if (bol?.extraction_result.document_type === "bill_of_lading") {
    const d = bol.extraction_result.data;
    summary.bill_of_lading = {
      file: bol.file_name,
      bl_number: d.bl_number,
      invoice_reference: d.invoice_reference,
      shipper_name: d.shipper?.name,
      consignee_name: d.consignee?.name,
      carrier: d.carrier,
      port_of_loading: d.port_of_loading,
      port_of_discharge: d.port_of_discharge,
      shipment_date: d.shipment_date,
    };
  }

  const coo = detected.certificate_of_origin[0];
  if (coo?.extraction_result.document_type === "certificate_of_origin") {
    const d = coo.extraction_result.data;
    summary.certificate_of_origin = {
      file: coo.file_name,
      certificate_number: d.certificate_number,
      country_of_origin: d.country_of_origin,
      exporter_name: d.exporter?.name,
      importer_name: d.importer?.name,
      goods: d.goods?.map((g) => ({
        hs_code: g.hs_code,
        description: g.description,
        invoice_reference: g.invoice_reference,
        quantity: g.quantity,
      })),
    };
  }

  return JSON.stringify(summary, null, 2);
}

type NormalisedIssue = z.infer<typeof IssueSchema>;

function mapToValidationIssues(
  issues: NormalisedIssue[],
  detected: DetectedDocs
): ValidationIssue[] {
  // Build a map from doc type name → file_id for the primary doc
  const fileIdMap: Record<string, string> = {};
  if (detected.commercial_invoice[0]) fileIdMap["commercial_invoice"] = detected.commercial_invoice[0].file_id;
  if (detected.packing_list[0]) fileIdMap["packing_list"] = detected.packing_list[0].file_id;
  if (detected.bill_of_lading[0]) fileIdMap["bill_of_lading"] = detected.bill_of_lading[0].file_id;
  if (detected.certificate_of_origin[0]) fileIdMap["certificate_of_origin"] = detected.certificate_of_origin[0].file_id;

  return issues.map((issue) => ({
    severity: issue.severity,
    field: issue.field,
    message: issue.message,
    affected_files: issue.documents_affected
      .map((docType) => fileIdMap[docType])
      .filter(Boolean) as string[],
    values: issue.values,
  }));
}

export async function llmCrossValidate(
  detected: DetectedDocs,
  client: Anthropic
): Promise<ValidationIssue[]> {
  const detectedCount = [
    detected.commercial_invoice,
    detected.packing_list,
    detected.bill_of_lading,
    detected.certificate_of_origin,
  ].filter((arr) => arr.length > 0).length;

  // Need at least 2 document types to cross-validate
  if (detectedCount < 2) {
    return [];
  }

  const docSummary = buildDocSummary(detected);

  try {
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: CROSS_VALIDATION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: `Cross-validate the following extracted shipping documents:\n\n${docSummary}`,
          },
        ],
      },
      {
        headers: { "anthropic-beta": "prompt-caching-2024-07-31" },
      }
    );

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    // Strip code fences if present
    const cleanText = rawText.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/, "$1").trim();
    logger.debug({ rawResponse: cleanText }, "LLM cross-validation raw response");

    const parsed = JSON.parse(cleanText);
    const validated = LLMValidationResponseSchema.parse(parsed);

    logger.info({
      overall_verdict: validated.overall_verdict,
      issue_count: validated.issues.length,
    }, "LLM cross-validation complete");

    return mapToValidationIssues(validated.issues, detected);
  } catch (err) {
    logger.warn({ err }, "LLM cross-validation failed — falling back to rule-based validator");
    return crossValidate(detected);
  }
}
