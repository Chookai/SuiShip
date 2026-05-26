import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import type Database from "better-sqlite3";
import { buildCompactManifest } from "./compact-manifest";
import { retrieveRelevantChunks } from "./chunk-retriever";
import { llmCrossValidateCompact } from "@/src/agent/llm-cross-validator";
import type { ValidationIssue } from "@/src/agent/schemas/aggregate-result";
import { getShipmentById } from "./shipments-server";
import {
  buildCrossShipmentContext,
  buildShipmentMemoryFacts,
  detectAnomalies,
  readCrossShipmentMemory,
  type MemoryAnomalyFinding,
} from "./agents/memory-agent";
import {
  buildRememberedFactsFromCanonicalProfiles,
  detectProfileDrift,
  recallCanonicalProfilesForShipment,
} from "./profile-memwal";
import { runValidationMemoryAgent, type ValidationAgentResult } from "./agents/validation-agent";
import type { ToolEvent } from "./agents/agent-loop";
import {
  buildFieldComparisons,
  type AgentMemoryTraceStep,
  type FieldComparison,
} from "./agents/field-comparisons";
import { ensureAgentRun, recordAgentStep, updateAgentRun, recordWaitingForDocuments } from "./agent-runs";
import { registerArtifact } from "./artifacts";
import { generateShipmentCaseFile, type ShipmentCaseFileArtifact } from "./case-files";
import { isMemWalConfigured } from "./memwal/client";

const logger = pino({ name: "validate-shipment" });

export type ValidationFinding = {
  id: string;
  severity: "error" | "warning" | "info";
  field_path: string;
  message: string;
  affected_doc_ids: string[];
  values: Record<string, unknown>;
  status: "unresolved" | "waived";
  finding_type?: "consistency" | "anomaly";
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
  fieldComparisons: FieldComparison[];
  memoryTrace: AgentMemoryTraceStep[];
  baselineStatus: "baseline_established" | "prior_memory_found";
  agentToolEvents: ToolEvent[];
  agentRunId?: string;
  caseFile?: ShipmentCaseFileArtifact | null;
};

type ExtractionRunRow = { aggregate_json: string; created_at: string };

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
  const errorCount = findings.filter(f => f.severity === "error").length;
  const warnCount = findings.filter(f => f.severity === "warning").length;
  if (overallVerdict === "mismatched" && errorCount > 0) return 50;
  return Math.max(0, Math.min(100, 95 - errorCount * 15 - warnCount * 3));
}

export async function runShipmentValidation(
  shipmentId: string,
  db: Database.Database,
  opts?: { uploadedCount?: number }
): Promise<ValidateResult | null> {
  const agentRun = ensureAgentRun(shipmentId, "validating", "Validating shipment documents", db);
  updateAgentRun(agentRun.id, { status: "validating", currentStep: "Cross-validating extracted shipment facts" }, db);
  recordAgentStep({
    runId: agentRun.id,
    shipmentId,
    agentName: "Orchestrator",
    stepName: "Validation requested",
    message: "Shipment compliance workflow resumed for validation.",
  }, db);

  // Mock mode: return a clean passing result
  if (process.env.MOCK_DOC_AI === "true") {
    const docSetHash = computeDocSetHash(shipmentId, db);
    const runId = randomUUID();

    // Mark previous runs superseded and resolve stale findings
    db.prepare("UPDATE validation_runs SET is_superseded = 1 WHERE shipment_id = ?").run(shipmentId);
    db.prepare("UPDATE validation_findings SET status = 'superseded' WHERE shipment_id = ? AND status = 'unresolved'").run(shipmentId);

    const runDocCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM shipment_files WHERE shipment_id = ?"
    ).get(shipmentId) as { cnt: number })?.cnt ?? 0;

    db.prepare(`
      INSERT INTO validation_runs
        (id, shipment_id, issues_json, overall_verdict, verdict_reason,
         input_manifest_json, token_count_in, token_count_out, doc_set_hash, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId, shipmentId, "[]", "aligned",
      "Mock validation: all documents aligned",
      JSON.stringify({ doc_count: runDocCount, uploaded_count: opts?.uploadedCount ?? runDocCount }), 0, 0, docSetHash, "mock"
    );

    // Promote verified → validated
    db.prepare(
      "UPDATE shipment_files SET state = 'validated' WHERE shipment_id = ? AND state = 'verified'"
    ).run(shipmentId);

    recordAgentStep({
      runId: agentRun.id,
      shipmentId,
      agentName: "Risk Agent",
      stepName: "Mock validation completed",
      message: "Demo Mode validation returned aligned documents.",
    }, db);
    const mockResult: ValidateResult = {
      issues: [],
      findings: [],
      overallVerdict: "aligned",
      verdictReason: "Mock validation: all documents aligned",
      docSetHash,
      model: "mock",
      inputTokens: 0,
      outputTokens: 0,
      fieldComparisons: [],
      memoryTrace: [],
      baselineStatus: "baseline_established",
      agentToolEvents: [],
      agentRunId: agentRun.id,
      caseFile: null,
    };
    updateAgentRun(agentRun.id, { status: "completed", currentStep: "Mock validation complete", riskLevel: "low", completed: true }, db);

    const validatedFiles = (db.prepare(
      "SELECT file_name, doc_type FROM shipment_files WHERE shipment_id = ?"
    ).all(shipmentId) as Array<{ file_name: string; doc_type: string }>)
      .map(f => ({ name: f.file_name, type: f.doc_type }));

    import("./memwal").then(({ writeProgressMemory }) => {
      writeProgressMemory(shipmentId, {
        kind: "ai_validation_complete",
        overall_verdict: "aligned",
        verdict_reason: "Mock validation: all documents aligned",
        finding_count: 0,
        error_count: 0,
        warning_count: 0,
        score: 95,
        model: "mock",
        documents_validated: validatedFiles.map(f => f.name),
        document_count: validatedFiles.length,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }).catch(() => {});

    return mockResult;
  }

  // Build compact manifest from latest extraction
  const compactManifest = buildCompactManifest(shipmentId, db);
  if (!compactManifest) {
    const missing = getMissingRequiredDocuments(shipmentId);
    if (missing.length > 0) {
      recordWaitingForDocuments(shipmentId, missing, db);
    }
    return null;
  }

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

  recordAgentStep({
    runId: agentRun.id,
    shipmentId,
    agentName: "Document Agent",
    stepName: "Documents normalized",
    message: "Built compact manifest and retrieved relevant extraction chunks.",
    inputArtifacts: [{ type: "compact_manifest", docSetHash: computeDocSetHash(shipmentId, db) }],
  }, db);

  const result = await llmCrossValidateCompact(
    compactManifest,
    newExtractionsJson,
    retrievedChunks,
    client,
    model
  );

  const shipment = getShipmentById(shipmentId);
  const facts = shipment ? buildShipmentMemoryFacts(shipment, compactManifest) : null;
  updateAgentRun(agentRun.id, { status: "recalling_memory", currentStep: "Recalling MemWal company profiles and document fingerprints" }, db);
  const memory = facts ? await readCrossShipmentMemory(facts) : { exporterHistory: [], importerHistory: [], documentFingerprints: [] };
  const canonicalProfiles = facts ? await recallCanonicalProfilesForShipment(facts) : { exporter: null, importer: null };
  const rememberedFacts = buildRememberedFactsFromCanonicalProfiles(canonicalProfiles, shipmentId);
  const profileDriftAnomalies = facts ? detectProfileDrift(facts, canonicalProfiles) : [];
  const profileSummary = [
    canonicalProfiles.exporter ? `Exporter profile v${canonicalProfiles.exporter.profileVersion} (${canonicalProfiles.exporter.company})` : null,
    canonicalProfiles.importer ? `Importer profile v${canonicalProfiles.importer.profileVersion} (${canonicalProfiles.importer.company})` : null,
  ].filter(Boolean);
  recordAgentStep({
    runId: agentRun.id,
    shipmentId,
    agentName: "Memory Agent",
    stepName: "Recall MemWal company profiles",
    message: profileSummary.length > 0
      ? `Recalled ${profileSummary.join(" and ")} from MemWal. ${memory.documentFingerprints.length} document fingerprint(s) found.`
      : `No company profiles found in MemWal. ${memory.documentFingerprints.length} document fingerprint(s) found.`,
    memoryReads: [...memory.exporterHistory, ...memory.documentFingerprints].map((item) => ({
      namespace: item.namespace,
      blobId: item.blobId,
      distance: item.distance,
    })),
  }, db);
  const comparisonBundle = shipment
    ? buildFieldComparisons({
        shipment,
        compactManifest,
        rememberedFacts,
        documentFingerprints: memory.documentFingerprints,
      })
    : { comparisons: [], trace: [], baselineStatus: "baseline_established" as const };
  const documentOnlyMemory = {
    exporterHistory: [],
    importerHistory: [],
    documentFingerprints: memory.documentFingerprints,
  };
  const deterministicAnomalies = facts
    ? [...profileDriftAnomalies, ...detectAnomalies(facts, documentOnlyMemory)]
    : [];
  const crossShipmentContext = facts ? buildCrossShipmentContext(facts, memory, deterministicAnomalies) : "";
  const hasRecalledMemory =
    rememberedFacts.length > 0 ||
    memory.documentFingerprints.length > 0;
  let agentResult: ValidationAgentResult = { anomalies: deterministicAnomalies, toolEvents: [] };
  updateAgentRun(agentRun.id, { status: "detecting_anomalies", currentStep: "Comparing entered, extracted, and remembered facts" }, db);
  if (facts && hasRecalledMemory) {
    agentResult = await runValidationMemoryAgent({ facts, deterministicAnomalies, crossShipmentContext });
  }
  const agentAnomalies = agentResult.anomalies;
  const anomalyIssues = mapAnomaliesToIssues(agentAnomalies);
  const comparisonIssues = mapComparisonsToIssues(comparisonBundle.comparisons);
  const allIssues = [...result.issues, ...anomalyIssues, ...comparisonIssues];
  const hasError = allIssues.some((issue) => issue.severity === "error");
  const overallVerdict = hasError ? "mismatched" : result.overallVerdict;
  const verdictReason = anomalyIssues.length > 0
    ? `${result.verdictReason} Historical MemWal anomaly check found ${anomalyIssues.length} issue(s).`.trim()
    : result.verdictReason;

  const docSetHash = computeDocSetHash(shipmentId, db);
  const runId = randomUUID();
  const realDocCount = (db.prepare(
    "SELECT COUNT(*) as cnt FROM shipment_files WHERE shipment_id = ?"
  ).get(shipmentId) as { cnt: number })?.cnt ?? 0;

  // Inject doc_count into the manifest for the activity log
  let manifestWithCount = compactManifest;
  try {
    const parsed = JSON.parse(compactManifest);
    parsed.doc_count = realDocCount;
    parsed.uploaded_count = opts?.uploadedCount ?? realDocCount;
    manifestWithCount = JSON.stringify(parsed);
  } catch {
    manifestWithCount = JSON.stringify({ doc_count: realDocCount, uploaded_count: opts?.uploadedCount ?? realDocCount });
  }

  // Mark previous runs superseded and resolve stale findings
  db.prepare("UPDATE validation_runs SET is_superseded = 1 WHERE shipment_id = ?").run(shipmentId);
  db.prepare("UPDATE validation_findings SET status = 'superseded' WHERE shipment_id = ? AND status = 'unresolved'").run(shipmentId);

  db.prepare(`
    INSERT INTO validation_runs
      (id, shipment_id, issues_json, overall_verdict, verdict_reason,
       input_manifest_json, token_count_in, token_count_out, doc_set_hash, model,
       field_comparisons_json, baseline_status, memory_trace_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    shipmentId,
    JSON.stringify(allIssues),
    overallVerdict,
    verdictReason,
    manifestWithCount,
    result.inputTokens,
    result.outputTokens,
    docSetHash,
    model,
    JSON.stringify(comparisonBundle.comparisons),
    comparisonBundle.baselineStatus,
    JSON.stringify(comparisonBundle.trace)
  );

  // Write structured findings
  const consistencyFindings: ValidationFinding[] = result.issues.map(issue => ({
    id: randomUUID(),
    severity: issue.severity as "error" | "warning" | "info",
    field_path: issue.field,
    message: issue.message,
    affected_doc_ids: issue.affected_files ?? [],
    values: (issue.values ?? {}) as Record<string, unknown>,
    status: "unresolved",
    finding_type: "consistency",
  }));
  const anomalyFindings = mapAnomaliesToFindings(agentAnomalies);
  const comparisonFindings = mapComparisonsToFindings(comparisonBundle.comparisons);
  const findings: ValidationFinding[] = [...consistencyFindings, ...anomalyFindings, ...comparisonFindings];

  for (const f of findings) {
    db.prepare(`
      INSERT INTO validation_findings
        (id, validation_run_id, shipment_id, severity, field_path, message,
         affected_doc_ids_json, values_json, status, finding_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      f.id, runId, shipmentId, f.severity, f.field_path, f.message,
      JSON.stringify(f.affected_doc_ids), JSON.stringify(f.values), f.status, f.finding_type ?? "consistency"
    );
  }

  // Promote verified → validated on clean run
  if (overallVerdict !== "mismatched") {
    db.prepare(
      "UPDATE shipment_files SET state = 'validated' WHERE shipment_id = ? AND state = 'verified'"
    ).run(shipmentId);
  }

  const score = scoreFromVerdict(overallVerdict, findings);
  const riskLevel = score >= 85 ? "Low" : score >= 65 ? "Medium" : "High";
  const aiSummary = findings.length > 0
    ? `Validation found ${findings.length} finding${findings.length === 1 ? "" : "s"}, including ${findings.filter((f) => f.finding_type === "anomaly").length} memory anomaly finding${findings.filter((f) => f.finding_type === "anomaly").length === 1 ? "" : "s"}.`
    : "AI validation found no blocking issues.";
  const aiChecks = findings.map((finding) => ({
    field: finding.field_path,
    status: finding.severity === "error" ? "mismatch" : finding.severity === "warning" ? "info" : "matched",
    detail: finding.message,
    documents: finding.affected_doc_ids,
  }));

  db.prepare(
    `UPDATE shipments SET ai_json = ?
     WHERE id = ?`
  ).run(
    JSON.stringify({
      score,
      riskLevel,
      ranAt: new Date().toISOString(),
      summary: aiSummary,
      checks: aiChecks,
    }),
    shipmentId
  );

  const validationArtifact = registerArtifact({
    shipmentId,
    type: "validation_report",
    label: "Validation Report",
    status: "local",
    localPathOrId: runId,
    relatedAgentRunId: agentRun.id,
    metadata: {
      overallVerdict,
      docSetHash,
      findingCount: findings.length,
      model,
    },
  }, db);
  recordAgentStep({
    runId: agentRun.id,
    shipmentId,
    agentName: "Risk Agent",
    stepName: "Risk assessment completed",
    message: aiSummary,
    outputArtifacts: [validationArtifact],
    memoryReads: comparisonBundle.comparisons
      .filter((comparison) => comparison.rememberedValue !== null && comparison.rememberedValue !== undefined)
      .map((comparison) => ({ field: comparison.field, rememberedValue: comparison.rememberedValue })),
  }, db);

  const caseFile = await generateShipmentCaseFile({
    shipmentId,
    agentRunId: agentRun.id,
    compactManifest,
    fieldComparisons: comparisonBundle.comparisons,
    baselineStatus: comparisonBundle.baselineStatus,
    overallVerdict,
    verdictReason,
    findings,
    memory,
    rememberedFacts,
    memwalConfigured: isMemWalConfigured(),
    db,
  });

  updateAgentRun(agentRun.id, {
    status: overallVerdict === "mismatched" ? "blocked_for_review" : "ready_for_customs",
    currentStep: overallVerdict === "mismatched" ? "Blocked for human review" : "Ready for customs evidence review",
    riskLevel,
    completed: true,
  }, db);

  logger.info({ shipmentId, overallVerdict: result.overallVerdict, findingCount: findings.length, score }, "Validation complete");

  // Write validation result to MemWal
  const validatedFileNames = (db.prepare(
    "SELECT file_name FROM shipment_files WHERE shipment_id = ?"
  ).all(shipmentId) as Array<{ file_name: string }>).map(f => f.file_name);

  import("./memwal").then(({ writeProgressMemory }) => {
    writeProgressMemory(shipmentId, {
      kind: "ai_validation_complete",
      overall_verdict: overallVerdict,
      verdict_reason: verdictReason,
      finding_count: findings.length,
      error_count: findings.filter(f => f.severity === "error").length,
      warning_count: findings.filter(f => f.severity === "warning").length,
      score,
      model,
      documents_validated: validatedFileNames,
      document_count: validatedFileNames.length,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }).catch(() => {});

  return {
    issues: allIssues,
    findings,
    overallVerdict,
    verdictReason,
    docSetHash,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    fieldComparisons: comparisonBundle.comparisons,
    memoryTrace: comparisonBundle.trace,
    baselineStatus: comparisonBundle.baselineStatus,
    agentToolEvents: agentResult.toolEvents,
    agentRunId: agentRun.id,
    caseFile,
  };
}

function getMissingRequiredDocuments(shipmentId: string): string[] {
  const shipment = getShipmentById(shipmentId);
  if (!shipment) return [];
  return shipment.documents
    .filter((doc) => doc.required && !doc.uploaded)
    .map((doc) => doc.name);
}

function actionableComparisons(comparisons: FieldComparison[]): FieldComparison[] {
  return comparisons.filter((comparison) =>
    comparison.findingType !== "consistency" &&
    !(comparison.findingType === "missing_data" && comparison.severity === "info")
  );
}

function comparisonSeverityToValidation(severity: FieldComparison["severity"]): "error" | "warning" | "info" {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

function mapComparisonsToIssues(comparisons: FieldComparison[]): ValidationIssue[] {
  return actionableComparisons(comparisons).map((comparison) => ({
    severity: comparisonSeverityToValidation(comparison.severity),
    field: comparison.field,
    message: comparison.explanation,
    affected_files: comparison.sourceDocuments,
    values: { field_comparison: comparison },
  }));
}

function mapComparisonsToFindings(comparisons: FieldComparison[]): ValidationFinding[] {
  return actionableComparisons(comparisons).map((comparison) => ({
    id: randomUUID(),
    severity: comparisonSeverityToValidation(comparison.severity),
    field_path: comparison.field,
    message: comparison.explanation,
    affected_doc_ids: comparison.sourceDocuments,
    values: { field_comparison: comparison },
    status: "unresolved",
    finding_type: comparison.findingType === "entered_vs_extracted" ? "consistency" : "anomaly",
  }));
}

function mapAnomaliesToIssues(anomalies: MemoryAnomalyFinding[]): ValidationIssue[] {
  return anomalies.map((anomaly) => ({
    severity: anomaly.severity,
    field: anomaly.fieldPath,
    message: anomaly.message,
    affected_files: [],
    values: {
      anomaly_type: anomaly.anomalyType,
      recalled_value: anomaly.recalledValue,
      current_value: anomaly.currentValue,
      prior_shipment_reference: anomaly.priorShipmentReference,
      memory_blob_id: anomaly.memoryBlobId,
    },
  }));
}

function mapAnomaliesToFindings(anomalies: MemoryAnomalyFinding[]): ValidationFinding[] {
  return anomalies.map((anomaly) => ({
    id: randomUUID(),
    severity: anomaly.severity,
    field_path: anomaly.fieldPath,
    message: anomaly.message,
    affected_doc_ids: [],
    values: {
      anomaly_type: anomaly.anomalyType,
      recalled_value: anomaly.recalledValue,
      current_value: anomaly.currentValue,
      prior_shipment_reference: anomaly.priorShipmentReference,
      memory_blob_id: anomaly.memoryBlobId,
    },
    status: "unresolved",
    finding_type: "anomaly",
  }));
}
