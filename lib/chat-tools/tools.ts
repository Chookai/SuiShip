// Modeled on lib/agents/validation-agent.ts (tool schema + executor pattern)
import type Database from "better-sqlite3";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentToolExecutor } from "@/lib/agents/agent-loop";
import { isMemWalConfigured, memwalRecall } from "@/lib/memwal/client";
import { runRiskScanForShipment } from "@/lib/agents/risk-agent";
import {
  getNextRequiredStep,
  validateDemoEndorsementAttempt,
  type DemoEndorsementRecord,
  type DemoEndorsementRole,
} from "@/lib/endorsement-flow";
import { getShipmentById } from "@/lib/shipments-server";
import { getDb } from "@/lib/db";

// ── Tool Definitions ─────────────────────────────────────────────────────────

export const CHAT_AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_shipment_status",
    description:
      "Get the current status of this shipment: validation verdict, endorsement chain progress, passport ID, and risk level. Call this when the user asks about the overall state or progress of the shipment.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "compare_documents",
    description:
      "Get field-level comparisons between what was entered, what was extracted from documents, and what MemWal remembers from prior shipments. Use this when the user asks about discrepancies, anomalies, or 'did anything change?'",
    input_schema: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of field names to filter (e.g. ['bankAccountNumber', 'address']). Omit to return all.",
        },
      },
    },
  },
  {
    name: "query_memwal",
    description:
      "Search MemWal long-term memory for historical records about this shipment's parties, documents, or risk events. Use when the user asks about history, prior shipments, or whether something has changed before.",
    input_schema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: "MemWal namespace to search. Common values: party namespace (e.g. 'suiship:party:acme-corp'), 'suiship:risk-events', 'suiship:risk-observations', 'suiship:documents'.",
        },
        query: {
          type: "string",
          description: "Natural language query describing what to look for.",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 5).",
        },
      },
      required: ["namespace", "query"],
    },
  },
  {
    name: "search_similar_shipments",
    description:
      "Search for other shipments by the same exporter, importer, or route. Use when the user asks about patterns, history, or comparison with prior shipments.",
    input_schema: {
      type: "object",
      properties: {
        exporter: { type: "string", description: "Exporter company name to search for." },
        importer: { type: "string", description: "Importer company name to search for." },
        route: { type: "string", description: "Origin or destination keyword to match." },
        limit: { type: "number", description: "Max results (default 5)." },
      },
    },
  },
  {
    name: "run_risk_scan",
    description:
      "Run or retrieve a risk scan for this shipment, checking MemWal historical risk events and live news (if SERP API is configured). Use when the user asks about risks, delays, or disruptions.",
    input_schema: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "If false (default), returns a cached scan if one exists from the last 5 minutes. Set to true to force a fresh scan.",
        },
      },
    },
  },
  {
    name: "generate_case_summary",
    description:
      "Return the latest case file summary for this shipment (final decision, risk level, customs readiness score, Walrus blob links). If no case file exists yet, reports that validation must be run first.",
    input_schema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "markdown"],
          description: "Preferred format for the summary (default: json).",
        },
      },
    },
  },
  {
    name: "propose_endorsement",
    description:
      "Propose the next endorsement action for this shipment. Returns a draft proposal that the user must confirm — this tool NEVER signs on-chain automatically. Use when the user asks what to endorse next, or wants to advance the custody chain.",
    input_schema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          enum: ["freight_forwarder", "importer"],
          description: "Role that should perform the endorsement (FF handles logistics and customs steps; importer signs receipt).",
        },
        action: {
          type: "string",
          description: "Endorsement action: picked_up, handed_off, reviewed, cleared_customs, or received.",
        },
        reasoning: {
          type: "string",
          description: "Brief explanation of why this endorsement should happen now.",
        },
      },
      required: ["role", "action", "reasoning"],
    },
  },
];

// ── Tool Executor Factory ─────────────────────────────────────────────────────

export function buildChatToolExecutors(
  shipmentId: string,
  db: Database.Database = getDb()
): Record<string, AgentToolExecutor> {
  return {
    get_shipment_status: async () => {
      try {
        const shipment = getShipmentById(shipmentId);
        if (!shipment) return { error: "Shipment not found" };

        const validation = db.prepare(`
          SELECT overall_verdict, verdict_reason, baseline_status, created_at
          FROM validation_runs
          WHERE shipment_id = ? AND is_superseded = 0
          ORDER BY created_at DESC LIMIT 1
        `).get(shipmentId) as { overall_verdict: string; verdict_reason: string | null; baseline_status: string | null; created_at: string } | undefined;

        const endorsements = db.prepare(`
          SELECT role, action, signer_address, signed_at_ms, tx_digest
          FROM passport_endorsements
          WHERE shipment_id = ?
          ORDER BY signed_at_ms ASC
        `).all(shipmentId) as DemoEndorsementRecord[];

        const nextStep = getNextRequiredStep(endorsements);

        return {
          shipmentId: shipment.id,
          status: shipment.status,
          passportId: shipment.passportId ?? null,
          riskLevel: shipment.ai?.riskLevel ?? null,
          validation: validation
            ? {
                verdict: validation.overall_verdict,
                reason: validation.verdict_reason,
                baselineStatus: validation.baseline_status,
                runAt: validation.created_at,
              }
            : null,
          endorsements: {
            completed: endorsements.map((e) => `${e.role} → ${e.action}`),
            nextRequired: nextStep ? `${nextStep.role} → ${nextStep.action}` : "custody flow complete",
            completedCount: endorsements.length,
            totalSteps: 6,
          },
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },

    compare_documents: async (raw) => {
      try {
        const input = raw as { fields?: string[] };
        const row = db.prepare(`
          SELECT field_comparisons_json, overall_verdict, verdict_reason, baseline_status, created_at
          FROM validation_runs
          WHERE shipment_id = ? AND is_superseded = 0
          ORDER BY created_at DESC LIMIT 1
        `).get(shipmentId) as {
          field_comparisons_json: string | null;
          overall_verdict: string;
          verdict_reason: string | null;
          baseline_status: string | null;
          created_at: string;
        } | undefined;

        if (!row) {
          return { available: false, message: "No validation run found. Run validation first to see field comparisons." };
        }

        const comparisons: unknown[] = row.field_comparisons_json
          ? JSON.parse(row.field_comparisons_json)
          : [];

        const filtered =
          input.fields && input.fields.length > 0
            ? (comparisons as Array<{ fieldName?: string; field?: string }>).filter((c) => {
                const name = c.fieldName ?? c.field ?? "";
                return input.fields!.some((f) => name.toLowerCase().includes(f.toLowerCase()));
              })
            : comparisons;

        return {
          available: true,
          verdict: row.overall_verdict,
          verdictReason: row.verdict_reason,
          baselineStatus: row.baseline_status,
          runAt: row.created_at,
          totalComparisons: comparisons.length,
          comparisons: filtered,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },

    query_memwal: async (raw) => {
      try {
        const input = raw as { namespace: string; query: string; limit?: number };
        if (!isMemWalConfigured()) {
          return {
            configured: false,
            message: "MemWal is not configured. Set MEMWAL_ED25519_KEY and MEMWAL_ACCOUNT_ID to enable memory recall.",
          };
        }
        const results = await memwalRecall(input.query, input.namespace, input.limit ?? 5);
        return {
          configured: true,
          namespace: input.namespace,
          query: input.query,
          count: results.length,
          memories: results.map((r) => ({
            blobId: r.blobId,
            text: r.text.slice(0, 600),
            distance: r.distance,
          })),
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },

    search_similar_shipments: async (raw) => {
      try {
        const input = raw as { exporter?: string; importer?: string; route?: string; limit?: number };
        const limit = Math.min(input.limit ?? 5, 10);

        const clauses: string[] = ["id != ?"];
        const params: unknown[] = [shipmentId];

        if (input.exporter) {
          clauses.push("exporter_json LIKE ?");
          params.push(`%${input.exporter}%`);
        }
        if (input.importer) {
          clauses.push("importer_json LIKE ?");
          params.push(`%${input.importer}%`);
        }
        if (input.route) {
          clauses.push("shipment_json LIKE ?");
          params.push(`%${input.route}%`);
        }

        if (clauses.length === 1) {
          return { error: "Provide at least one search filter: exporter, importer, or route." };
        }

        params.push(limit);
        const rows = db.prepare(`
          SELECT id, status, exporter_json, importer_json, shipment_json, created_at
          FROM shipments
          WHERE ${clauses.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT ?
        `).all(...params) as Array<{
          id: string;
          status: string;
          exporter_json: string;
          importer_json: string;
          shipment_json: string;
          created_at: string;
        }>;

        return {
          count: rows.length,
          shipments: rows.map((r) => {
            const exporter = JSON.parse(r.exporter_json) as { company?: string };
            const importer = JSON.parse(r.importer_json) as { company?: string };
            const shipmentInfo = JSON.parse(r.shipment_json) as { origin?: string; destination?: string };
            return {
              id: r.id,
              status: r.status,
              exporter: exporter.company ?? "Unknown",
              importer: importer.company ?? "Unknown",
              origin: shipmentInfo.origin ?? null,
              destination: shipmentInfo.destination ?? null,
              createdAt: r.created_at,
            };
          }),
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },

    run_risk_scan: async (raw) => {
      try {
        const input = raw as { force?: boolean };
        const force = input.force === true;

        if (!force) {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const cached = db.prepare(`
            SELECT id, status, findings_json, source_messages_json,
                   memwal_configured, serpapi_configured, created_at
            FROM risk_scans
            WHERE shipment_id = ? AND created_at > ?
            ORDER BY created_at DESC LIMIT 1
          `).get(shipmentId, fiveMinutesAgo) as {
            id: string;
            status: string;
            findings_json: string;
            source_messages_json: string;
            memwal_configured: number;
            serpapi_configured: number;
            created_at: string;
          } | undefined;

          if (cached) {
            const findings = JSON.parse(cached.findings_json) as unknown[];
            return {
              cached: true,
              scanId: cached.id,
              status: cached.status,
              generatedAt: cached.created_at,
              findingsCount: findings.length,
              findings,
              sourceMessages: JSON.parse(cached.source_messages_json) as string[],
              memwalConfigured: cached.memwal_configured === 1,
              serpApiConfigured: cached.serpapi_configured === 1,
            };
          }
        }

        const result = await runRiskScanForShipment(shipmentId, db);
        return {
          cached: false,
          scanId: result.id,
          status: result.status,
          generatedAt: result.generatedAt,
          findingsCount: result.findings.length,
          findings: result.findings,
          sourceMessages: result.sourceMessages,
          memwalConfigured: result.memwalConfigured,
          serpApiConfigured: result.serpApiConfigured,
          error: result.error,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },

    generate_case_summary: async (raw) => {
      try {
        const input = raw as { format?: "json" | "markdown" };
        const useMarkdown = input.format === "markdown";

        const row = db.prepare(`
          SELECT case_file_id, final_decision, risk_level, customs_readiness_score,
                 recommended_action, walrus_json_blob_id, walrus_markdown_blob_id,
                 status, generated_at
          FROM shipment_case_files
          WHERE shipment_id = ?
          ORDER BY generated_at DESC LIMIT 1
        `).get(shipmentId) as {
          case_file_id: string;
          final_decision: string;
          risk_level: string;
          customs_readiness_score: number;
          recommended_action: string;
          walrus_json_blob_id: string | null;
          walrus_markdown_blob_id: string | null;
          status: string;
          generated_at: string;
        } | undefined;

        if (!row) {
          return {
            available: false,
            message: "No case file generated yet. Run a full validation to generate one.",
          };
        }

        const blobId = useMarkdown
          ? (row.walrus_markdown_blob_id ?? row.walrus_json_blob_id)
          : (row.walrus_json_blob_id ?? row.walrus_markdown_blob_id);

        return {
          available: true,
          caseFileId: row.case_file_id,
          finalDecision: row.final_decision,
          riskLevel: row.risk_level,
          customsReadinessScore: row.customs_readiness_score,
          recommendedAction: row.recommended_action,
          walrusBlobId: blobId,
          walrusJsonBlobId: row.walrus_json_blob_id,
          walrusMarkdownBlobId: row.walrus_markdown_blob_id,
          status: row.status,
          generatedAt: row.generated_at,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },

    propose_endorsement: async (raw) => {
      try {
        const input = raw as { role: DemoEndorsementRole; action: string; reasoning: string };

        const endorsements = db.prepare(`
          SELECT role, action, signer_address, signed_at_ms, tx_digest
          FROM passport_endorsements
          WHERE shipment_id = ?
          ORDER BY signed_at_ms ASC
        `).all(shipmentId) as DemoEndorsementRecord[];

        const nextStep = getNextRequiredStep(endorsements);

        const validation = validateDemoEndorsementAttempt({
          role: input.role,
          action: input.action,
          endorsements,
          signerAddress: "0xproposal-check-only",
          importerAddress: null,
          exporterAddress: null,
        });

        const prerequisitesMet = validation.ok || (
          !validation.ok && !validation.error.includes("Waiting for")
        );

        const blockingReasons: string[] = [];
        if (!validation.ok) {
          blockingReasons.push(validation.error);
        }

        return {
          kind: "endorsement_proposal",
          role: input.role,
          action: input.action,
          reasoning: input.reasoning,
          nextRequiredStep: nextStep
            ? { role: nextStep.role, action: nextStep.action, label: nextStep.label }
            : null,
          prerequisitesMet,
          blockingReasons: blockingReasons.length > 0 ? blockingReasons : undefined,
          note: "This is a proposal only. Use the Endorsement Panel to confirm and sign on-chain.",
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
