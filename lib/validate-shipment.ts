import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import type Database from "better-sqlite3";
import { buildCompactManifest } from "./compact-manifest";
import { retrieveRelevantChunks } from "./chunk-retriever";
import { llmCrossValidateCompact } from "@/src/agent/llm-cross-validator";
import type { ValidationIssue } from "@/src/agent/schemas/aggregate-result";

const logger = pino({ name: "validate-shipment" });

export type ValidationFinding = {
  id: string;
  severity: "error" | "warning" | "info";
  field_path: string;
  message: string;
  affected_doc_ids: string[];
  values: Record<string, unknown>;
  status: "unresolved" | "waived";
};

export type ValidateResult = {
  issues: ValidationIssue[];
  findings: ValidationFinding[];
  overallVerdict: string;
  verdictReason: string;
  docSetHash: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

type ExtractionRunRow = { aggregate_json: string; created_at: string };
type ShipmentFileRow = { sha256: string; slot_key: string | null; doc_type: string | null };

export function computeDocSetHash(shipmentId: string, db: Database.Database): string {
  const rows = db.prepare(
    `SELECT sha256, COALESCE(slot_key, doc_type) AS slot_key
     FROM shipment_files
     WHERE shipment_id = ? AND state IN ('verified','validated','committed')
     ORDER BY slot_key ASC`
  ).all(shipmentId) as { sha256: string; slot_key: string }[];
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function scoreFromVerdict(
  overallVerdict: string,
  findings: ValidationFinding[]
): number {
  if (overallVerdict === "mismatched") return 50;
  if (overallVerdict === "insufficient_data") return 70;
  const errorCount = findings.filter(f => f.severity === "error").length;
  const warnCount = findings.filter(f => f.severity === "warning").length;
  return Math.max(0, Math.min(100, 95 - errorCount * 15 - warnCount * 3));
}

export async function runShipmentValidation(
  shipmentId: string,
  db: Database.Database
): Promise<ValidateResult | null> {
  // Mock mode: return a clean passing result
  if (process.env.MOCK_DOC_AI === "true") {
    const docSetHash = computeDocSetHash(shipmentId, db);
    const runId = randomUUID();

    // Mark previous runs superseded
    db.prepare("UPDATE validation_runs SET is_superseded = 1 WHERE shipment_id = ?").run(shipmentId);

    db.prepare(`
      INSERT INTO validation_runs
        (id, shipment_id, issues_json, overall_verdict, verdict_reason,
         input_manifest_json, token_count_in, token_count_out, doc_set_hash, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId, shipmentId, "[]", "aligned",
      "Mock validation: all documents aligned", "{}", 0, 0, docSetHash, "mock"
    );

    // Promote verified → validated
    db.prepare(
      "UPDATE shipment_files SET state = 'validated' WHERE shipment_id = ? AND state = 'verified'"
    ).run(shipmentId);

    return {
      issues: [],
      findings: [],
      overallVerdict: "aligned",
      verdictReason: "Mock validation: all documents aligned",
      docSetHash,
      model: "mock",
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  // Build compact manifest from latest extraction
  const compactManifest = buildCompactManifest(shipmentId, db);
  if (!compactManifest) return null;

  // Latest extraction JSON for new docs
  const latestRun = db.prepare(
    `SELECT aggregate_json, created_at FROM extraction_runs
     WHERE shipment_id = ? AND is_superseded = 0
     ORDER BY created_at DESC LIMIT 1`
  ).get(shipmentId) as ExtractionRunRow | undefined;

  const newExtractionsJson = latestRun
    ? JSON.stringify(JSON.parse(latestRun.aggregate_json).detected, null, 2).slice(0, 6000)
    : "";

  // Retrieved semantic chunks
  const retrievedChunks = retrieveRelevantChunks(
    shipmentId,
    "invoice consignee shipper hs_code country_of_origin weight",
    db,
    6
  );

  // Choose model: escalate to Sonnet if prior run had errors
  const priorErrors = (db.prepare(
    `SELECT COUNT(*) as n FROM validation_findings
     WHERE shipment_id = ? AND severity = 'error' AND status = 'unresolved'`
  ).get(shipmentId) as { n: number } | undefined)?.n ?? 0;

  const model = priorErrors > 0 ? "claude-sonnet-4-6" : "claude-haiku-4-5";
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  logger.info({ shipmentId, model, priorErrors }, "Running shipment validation");

  const result = await llmCrossValidateCompact(
    compactManifest,
    newExtractionsJson,
    retrievedChunks,
    client,
    model
  );

  const docSetHash = computeDocSetHash(shipmentId, db);
  const runId = randomUUID();

  // Mark previous runs superseded
  db.prepare("UPDATE validation_runs SET is_superseded = 1 WHERE shipment_id = ?").run(shipmentId);

  db.prepare(`
    INSERT INTO validation_runs
      (id, shipment_id, issues_json, overall_verdict, verdict_reason,
       input_manifest_json, token_count_in, token_count_out, doc_set_hash, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    shipmentId,
    JSON.stringify(result.issues),
    result.overallVerdict,
    result.verdictReason,
    compactManifest,
    result.inputTokens,
    result.outputTokens,
    docSetHash,
    model
  );

  // Write structured findings
  const findings: ValidationFinding[] = result.issues.map(issue => ({
    id: randomUUID(),
    severity: issue.severity as "error" | "warning" | "info",
    field_path: issue.field,
    message: issue.message,
    affected_doc_ids: issue.affected_files ?? [],
    values: (issue.values ?? {}) as Record<string, unknown>,
    status: "unresolved",
  }));

  for (const f of findings) {
    db.prepare(`
      INSERT INTO validation_findings
        (id, validation_run_id, shipment_id, severity, field_path, message,
         affected_doc_ids_json, values_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      f.id, runId, shipmentId, f.severity, f.field_path, f.message,
      JSON.stringify(f.affected_doc_ids), JSON.stringify(f.values), f.status
    );
  }

  // Promote verified → validated on clean run
  if (result.overallVerdict !== "mismatched") {
    db.prepare(
      "UPDATE shipment_files SET state = 'validated' WHERE shipment_id = ? AND state = 'verified'"
    ).run(shipmentId);
  }

  const score = scoreFromVerdict(result.overallVerdict, findings);
  // Update shipment ai score
  db.prepare(
    `UPDATE shipments SET ai_json = json_patch(COALESCE(ai_json,'{}'),
      json_object('score', ?, 'riskLevel', ?, 'ranAt', datetime('now')))
     WHERE id = ?`
  ).run(
    score,
    score >= 85 ? "Low" : score >= 65 ? "Medium" : "High",
    shipmentId
  );

  logger.info({ shipmentId, overallVerdict: result.overallVerdict, findingCount: findings.length, score }, "Validation complete");

  return {
    issues: result.issues,
    findings,
    overallVerdict: result.overallVerdict,
    verdictReason: result.verdictReason,
    docSetHash,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
