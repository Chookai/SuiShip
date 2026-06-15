import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { runAgentLoop, type ToolEvent } from "./agent-loop";
import {
  documentNamespace,
  partyNamespace,
  readDocumentFingerprints,
  readPartyMemory,
  type MemoryAnomalyFinding,
  type ShipmentMemoryFacts,
} from "./memory-agent";

const logger = pino({ name: "validation-agent" });

export const HAIKU_45_MODEL = "claude-haiku-4-5-20251001";

const validationTools: Anthropic.Tool[] = [
  {
    name: "recall_party_memory",
    description: "Retrieve historical verified data for a shipping party from long-term MemWal memory. If this returns found=false, treat the party as clean/new.",
    input_schema: {
      type: "object",
      properties: {
        namespace_key: { type: "string", description: "Party tax ID or normalized company namespace key." },
        query: { type: "string", description: "What to look for, such as legal name tax ID registered address bank account origin history." },
      },
      required: ["namespace_key", "query"],
    },
  },
  {
    name: "recall_document_fingerprints",
    description: "Only call this after party memory reveals a discrepancy. Checks invoice or BOL number against prior verified shipments.",
    input_schema: {
      type: "object",
      properties: {
        invoice_number: { type: "string" },
        bol_number: { type: "string" },
        coo_number: { type: "string" },
      },
    },
  },
  {
    name: "flag_anomaly",
    description: "Flag a discrepancy between current shipment data and historical memory. Only call when a recalled fact contradicts a current document field.",
    input_schema: {
      type: "object",
      properties: {
        anomaly_type: {
          type: "string",
          enum: ["bank_account_changed", "duplicate_document", "address_changed", "country_of_origin_changed", "document_issuer_changed", "party_mismatch"],
        },
        description: { type: "string" },
        severity: { type: "string", enum: ["error", "warning"] },
        recalled_value: { type: "string" },
        current_value: { type: "string" },
        prior_shipment_reference: { type: "string" },
      },
      required: ["anomaly_type", "description", "severity"],
    },
  },
  {
    name: "done",
    description: "Call when finished checking all parties and documents.",
    input_schema: {
      type: "object",
      properties: {
        anomaly_summary: { type: "string" },
      },
      required: ["anomaly_summary"],
    },
  },
];

const systemPrompt = `You are a cross-shipment anomaly detector for a shipping verification system.
You use long-term MemWal memory of prior verified shipments via tools.

WORKFLOW:
1. Call recall_party_memory for the exporter.
   - If found=false, this is a new party. Do not fabricate history.
   - If found=true, compare only identity and document-integrity memory: legal name, tax ID, registered address, bank beneficiary/account/IBAN/SWIFT, country of origin, and document issuer.
   - Do NOT compare declared value, HS code, payment terms, cargo description, quantity, weight, ports, or destination across shipments. Those legitimately vary.
   - If any recalled fact contradicts the current shipment, call flag_anomaly, then call recall_document_fingerprints.
2. Do not flag importer changes as fraud solely because the buyer is different; different buyers are normal. Use importer memory only as supporting context if a document identity contradiction is explicit.
3. Call done.

Rules:
- Never flag an anomaly without a specific recalled fact and current value.
- found=false means clean/new, not suspicious.
- Call recall_document_fingerprints only after a party discrepancy.
- Keep within 8 total tool calls.`;

export type ValidationAgentResult = {
  anomalies: MemoryAnomalyFinding[];
  toolEvents: ToolEvent[];
};

export async function runValidationMemoryAgent(input: {
  facts: ShipmentMemoryFacts;
  deterministicAnomalies: MemoryAnomalyFinding[];
  crossShipmentContext: string;
}): Promise<ValidationAgentResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { anomalies: [], toolEvents: [] };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    return await runAgentLoop<ValidationAgentResult>({
      client,
      model: HAIKU_45_MODEL,
      system: systemPrompt,
      tools: validationTools,
      maxToolCalls: 8,
      timeoutMs: 20_000,
      messages: [
        {
          role: "user",
          content: `Current shipment facts:\n${JSON.stringify(input.facts, null, 2)}\n\nExisting deterministic anomaly context:\n${input.crossShipmentContext}`,
        },
      ],
      toolExecutors: {
        recall_party_memory: async (raw) => {
          const parsed = raw as { namespace_key?: string; query?: string };
          const namespaceKey = parsed.namespace_key ?? "";
          const records = await readPartyMemory(namespaceKey, parsed.query ?? "party profile history", 3);
          if (records.length === 0) {
            return {
              found: false,
              namespace: partyNamespace(namespaceKey),
              message: "No prior record found for this party. This appears to be their first shipment.",
            };
          }
          return {
            found: true,
            namespace: partyNamespace(namespaceKey),
            records: records.map((record) => ({
              text: record.text,
              blobId: record.blobId,
              distance: record.distance,
            })),
          };
        },
        recall_document_fingerprints: async (raw) => {
          const parsed = raw as { invoice_number?: string; bol_number?: string; coo_number?: string };
          const records = await readDocumentFingerprints(parsed.invoice_number, parsed.bol_number, parsed.coo_number, 5);
          return {
            found: records.length > 0,
            namespace: documentNamespace(),
            records: records.map((record) => ({
              text: record.text,
              blobId: record.blobId,
              distance: record.distance,
            })),
          };
        },
        flag_anomaly: async (raw) => ({ accepted: true, anomaly: raw }),
        done: async (raw) => ({ done: true, summary: raw }),
      },
      extractFinal: (_messages, events) => ({
        anomalies: mergeAgentFindings(input.deterministicAnomalies, events),
        toolEvents: events,
      }),
    });
  } catch (err) {
    logger.warn({ err }, "Validation memory agent failed");
    return { anomalies: [], toolEvents: [] };
  }
}

function mergeAgentFindings(base: MemoryAnomalyFinding[], events: ToolEvent[]): MemoryAnomalyFinding[] {
  const agentFindings = events
    .filter((event) => event.name === "flag_anomaly")
    .map((event) => event.input as Record<string, unknown>)
    .map((input): MemoryAnomalyFinding | null => {
      const anomalyType = String(input.anomaly_type ?? "");
      if (!isAnomalyType(anomalyType)) return null;
      const severity = input.severity === "error" ? "error" : "warning";
      return {
        anomalyType,
        severity,
        fieldPath: `memory.${anomalyType}`,
        message: String(input.description ?? "Historical MemWal anomaly detected."),
        recalledValue: String(input.recalled_value ?? ""),
        currentValue: String(input.current_value ?? ""),
        priorShipmentReference: typeof input.prior_shipment_reference === "string" ? input.prior_shipment_reference : undefined,
      };
    })
    .filter((finding): finding is MemoryAnomalyFinding => Boolean(finding));

  const byKey = new Map<string, MemoryAnomalyFinding>();
  for (const finding of [...base, ...agentFindings]) {
    byKey.set(`${finding.anomalyType}:${finding.recalledValue}:${finding.currentValue}:${finding.priorShipmentReference ?? ""}`, finding);
  }
  return [...byKey.values()];
}

function isAnomalyType(value: string): value is MemoryAnomalyFinding["anomalyType"] {
  return ["bank_account_changed", "duplicate_document", "address_changed", "country_of_origin_changed", "document_issuer_changed", "party_mismatch"].includes(value);
}
