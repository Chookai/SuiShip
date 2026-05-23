import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FieldComparison, ShipmentMemoryFact } from "./agents/field-comparisons";
import type { RecalledMemory } from "./agents/memory-agent";
import { normalizeNamespaceKey, partyNamespace } from "./agents/memory-agent";
import type { AgentStep } from "./agent-runs";
import { listAgentSteps, recordAgentStep, updateAgentRun } from "./agent-runs";
import type { ArtifactRef } from "./artifacts";
import { listArtifacts, registerArtifact, upsertWalrusArtifact } from "./artifacts";
import { getDb } from "./db";
import type { ShipmentRecord } from "./shipments-store";
import { getShipmentById } from "./shipments-server";
import { storeBlobServer, WALRUS_MINT_EPOCHS } from "./walrus";

export type FinalDecision = "ready_for_customs" | "blocked_for_review" | "needs_human_review";
export type CaseRiskLevel = "low" | "medium" | "high" | "critical";

export type MemoryRecallSummary = {
  memwalConfigured: boolean;
  exporterNamespace: string | null;
  importerNamespace: string | null;
  recalledExporterMemories: number;
  recalledImporterMemories: number;
  recalledDocumentFingerprints: number;
  baselineStatus: "baseline_established" | "prior_memory_found";
};

export type MemoryProvenance = {
  field: string;
  rememberedValue: string | number | null;
  sourceShipmentId: string | null;
  sourceCaseFileId?: string | null;
  memwalNamespace: string;
  memwalMemoryId?: string | null;
  memwalBlobId?: string | null;
  walrusBlobId?: string | null;
  suiObjectId?: string | null;
  suiTxDigest?: string | null;
  confidence: number;
  recalledAt: string;
  explanation: string;
};

export type EvidenceChain = {
  walrusBlobIds: string[];
  memwalNamespaces: string[];
  suiPassportId?: string | null;
  suiTxDigest?: string | null;
  manifestHash?: string | null;
};

export type AgentStepSummary = {
  agentName: string;
  stepName: string;
  status: string;
  message?: string | null;
  walrusBlobIds: string[];
  suiTxDigests: string[];
};

export type ShipmentCaseFileArtifact = {
  caseFileId: string;
  shipmentId: string;
  exporterKey: string | null;
  importerKey?: string | null;
  agentRunId: string;
  generatedAt: string;
  finalDecision: FinalDecision;
  riskLevel: CaseRiskLevel;
  customsReadinessScore: number;
  recommendedAction: string;
  extractedFactsSummary: Record<string, unknown>;
  fieldComparisons: FieldComparison[];
  memoryRecallSummary: MemoryRecallSummary;
  memoryProvenance: MemoryProvenance[];
  evidenceChain: EvidenceChain;
  agentSteps: AgentStepSummary[];
  artifacts: {
    uploadedDocuments: ArtifactRef[];
    extractionResults: ArtifactRef[];
    validationReport: ArtifactRef | null;
    walrusPackage: ArtifactRef | null;
    suiPassport: ArtifactRef | null;
    memwalMemory: ArtifactRef | null;
  };
  developerTrace?: {
    memoryReads: unknown[];
    memoryWrites: unknown[];
    walrusWrites: unknown[];
    suiWrites: unknown[];
  };
};

type CaseFileRow = {
  case_file_id: string;
  shipment_id: string;
  exporter_key: string | null;
  importer_key: string | null;
  agent_run_id: string | null;
  final_decision: FinalDecision;
  risk_level: CaseRiskLevel;
  customs_readiness_score: number;
  recommended_action: string;
  artifact_json: string;
  markdown: string | null;
  walrus_json_blob_id: string | null;
  walrus_markdown_blob_id: string | null;
  status: string;
  failure_reason: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
};

export async function generateShipmentCaseFile(input: {
  shipmentId: string;
  agentRunId: string;
  compactManifest: string | null;
  fieldComparisons: FieldComparison[];
  baselineStatus: "baseline_established" | "prior_memory_found";
  overallVerdict: string;
  verdictReason: string;
  findings: Array<{ severity: string; field_path: string; message: string; finding_type?: string }>;
  memory: {
    exporterHistory: RecalledMemory[];
    importerHistory: RecalledMemory[];
    documentFingerprints: RecalledMemory[];
  };
  rememberedFacts: ShipmentMemoryFact[];
  memwalConfigured: boolean;
  db?: Database.Database;
}): Promise<ShipmentCaseFileArtifact> {
  const db = input.db ?? getDb();
  const shipment = getShipmentById(input.shipmentId);
  if (!shipment) throw new Error(`Shipment ${input.shipmentId} not found`);

  updateAgentRun(input.agentRunId, {
    status: "generating_case_file",
    currentStep: "Generating AI Shipment Case File",
  }, db);
  const generationStep = recordAgentStep({
    runId: input.agentRunId,
    shipmentId: input.shipmentId,
    agentName: "Orchestrator",
    stepName: "Generate AI Shipment Case File",
    message: "Compiled extraction, validation, memory, Walrus, and Sui evidence into one durable artifact.",
  }, db);

  const generatedAt = new Date().toISOString();
  const caseFileId = randomUUID();
  const exporterKey = normalizeNamespaceKey(shipment.exporter.taxId, shipment.exporter.company);
  const importerKey = normalizeNamespaceKey(shipment.importer.taxId, shipment.importer.company);
  const finalDecision = decideFinal(input.overallVerdict, input.findings);
  const riskLevel = riskFromFindings(input.findings, shipment.ai?.riskLevel);
  const customsReadinessScore = scoreFromRisk(riskLevel, input.overallVerdict);
  const recommendedAction = recommendedActionFor(finalDecision, riskLevel);
  const artifacts = listArtifacts(input.shipmentId, db);
  const agentSteps = listAgentSteps(input.shipmentId, input.agentRunId, db);
  const memoryProvenance = buildMemoryProvenance({
    shipment,
    comparisons: input.fieldComparisons,
    memories: [...input.memory.exporterHistory, ...input.memory.importerHistory],
    rememberedFacts: input.rememberedFacts,
    recalledAt: generatedAt,
  });

  const artifact: ShipmentCaseFileArtifact = {
    caseFileId,
    shipmentId: input.shipmentId,
    exporterKey,
    importerKey,
    agentRunId: input.agentRunId,
    generatedAt,
    finalDecision,
    riskLevel,
    customsReadinessScore,
    recommendedAction,
    extractedFactsSummary: parseManifest(input.compactManifest),
    fieldComparisons: input.fieldComparisons,
    memoryRecallSummary: {
      memwalConfigured: input.memwalConfigured,
      exporterNamespace: partyNamespace(exporterKey),
      importerNamespace: partyNamespace(importerKey),
      recalledExporterMemories: input.memory.exporterHistory.length,
      recalledImporterMemories: input.memory.importerHistory.length,
      recalledDocumentFingerprints: input.memory.documentFingerprints.length,
      baselineStatus: input.baselineStatus,
    },
    memoryProvenance,
    evidenceChain: {
      walrusBlobIds: collectWalrusBlobIds(shipment, artifacts),
      memwalNamespaces: [partyNamespace(exporterKey), `${input.shipmentId}:docs`, `${input.shipmentId}:progress`],
      suiPassportId: shipment.passportId ?? null,
      suiTxDigest: shipment.txDigest ?? null,
      manifestHash: shipment.manifestHash ?? null,
    },
    agentSteps: agentSteps.map(stepToSummary),
    artifacts: groupArtifacts(artifacts),
    developerTrace: {
      memoryReads: [...input.memory.exporterHistory, ...input.memory.importerHistory, ...input.memory.documentFingerprints],
      memoryWrites: [],
      walrusWrites: artifacts.filter((item) => item.walrusBlobId),
      suiWrites: [shipment.txDigest, ...agentSteps.flatMap((step) => step.suiTxDigests)].filter(Boolean),
    },
  };

  const markdown = renderCaseFileMarkdown(artifact, shipment);
  db.prepare(`
    INSERT OR REPLACE INTO shipment_case_files
      (case_file_id, shipment_id, exporter_key, importer_key, agent_run_id, final_decision,
       risk_level, customs_readiness_score, recommended_action, artifact_json, markdown,
       status, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?)
  `).run(
    caseFileId,
    input.shipmentId,
    exporterKey,
    importerKey,
    input.agentRunId,
    finalDecision,
    riskLevel,
    customsReadinessScore,
    recommendedAction,
    JSON.stringify(artifact, null, 2),
    markdown,
    generatedAt
  );

  await uploadCaseFileArtifacts({
    shipmentId: input.shipmentId,
    caseFileId,
    artifact,
    markdown,
    agentRunId: input.agentRunId,
    generationStepId: generationStep.id,
    db,
  });

  return getLatestCaseFile(input.shipmentId, db)?.artifact ?? artifact;
}

export function getLatestCaseFile(
  shipmentId: string,
  db: Database.Database = getDb()
): { artifact: ShipmentCaseFileArtifact; row: CaseFileRow } | null {
  const row = db.prepare(`
    SELECT * FROM shipment_case_files WHERE shipment_id = ? ORDER BY generated_at DESC LIMIT 1
  `).get(shipmentId) as CaseFileRow | undefined;
  if (!row) return null;
  const artifact = JSON.parse(row.artifact_json) as ShipmentCaseFileArtifact;
  return {
    row,
    artifact: {
      ...artifact,
      evidenceChain: {
        ...artifact.evidenceChain,
        walrusBlobIds: [
          ...new Set([
            ...artifact.evidenceChain.walrusBlobIds,
            row.walrus_json_blob_id,
            row.walrus_markdown_blob_id,
          ].filter((id): id is string => Boolean(id))),
        ],
      },
    },
  };
}

async function uploadCaseFileArtifacts(input: {
  shipmentId: string;
  caseFileId: string;
  artifact: ShipmentCaseFileArtifact;
  markdown: string;
  agentRunId: string;
  generationStepId: string;
  db: Database.Database;
}): Promise<void> {
  updateAgentRun(input.agentRunId, {
    status: "storing_artifacts",
    currentStep: "Uploading AI Shipment Case File to Walrus",
  }, input.db);
  try {
    const jsonBytes = Buffer.from(JSON.stringify(input.artifact, null, 2), "utf-8");
    const jsonUpload = await storeBlobServer({
      data: jsonBytes,
      fileName: `${input.shipmentId}/case-file/${input.caseFileId}.json`,
      mimeType: "application/json",
      epochs: WALRUS_MINT_EPOCHS,
    });
    const jsonArtifact = upsertWalrusArtifact({
      shipmentId: input.shipmentId,
      type: "ai_case_file_json",
      label: "AI Shipment Case File JSON",
      walrusBlobId: jsonUpload.blobId,
      relatedAgentRunId: input.agentRunId,
      relatedAgentStepId: input.generationStepId,
      metadata: { caseFileId: input.caseFileId, sizeBytes: jsonUpload.sizeBytes },
    }, input.db);

    const mdUpload = await storeBlobServer({
      data: Buffer.from(input.markdown, "utf-8"),
      fileName: `${input.shipmentId}/case-file/${input.caseFileId}.md`,
      mimeType: "text/markdown",
      epochs: WALRUS_MINT_EPOCHS,
    });
    const mdArtifact = upsertWalrusArtifact({
      shipmentId: input.shipmentId,
      type: "ai_case_file_markdown",
      label: "AI Shipment Case File Markdown",
      walrusBlobId: mdUpload.blobId,
      relatedAgentRunId: input.agentRunId,
      relatedAgentStepId: input.generationStepId,
      metadata: { caseFileId: input.caseFileId, sizeBytes: mdUpload.sizeBytes },
    }, input.db);

    input.db.prepare(`
      UPDATE shipment_case_files SET
        walrus_json_blob_id = ?,
        walrus_markdown_blob_id = ?,
        status = 'stored_on_walrus',
        artifact_json = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE case_file_id = ?
    `).run(
      jsonUpload.blobId,
      mdUpload.blobId,
      JSON.stringify({
        ...input.artifact,
        artifacts: {
          ...input.artifact.artifacts,
          validationReport: input.artifact.artifacts.validationReport ?? jsonArtifact,
        },
        evidenceChain: {
          ...input.artifact.evidenceChain,
          walrusBlobIds: [...new Set([...input.artifact.evidenceChain.walrusBlobIds, jsonUpload.blobId, mdUpload.blobId])],
        },
      }, null, 2),
      input.caseFileId
    );

    recordAgentStep({
      runId: input.agentRunId,
      shipmentId: input.shipmentId,
      agentName: "Proof Agent",
      stepName: "Store case file artifacts on Walrus",
      message: "Stored JSON and Markdown AI Shipment Case File artifacts on Walrus.",
      outputArtifacts: [jsonArtifact, mdArtifact],
      walrusBlobIds: [jsonUpload.blobId, mdUpload.blobId],
    }, input.db);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    input.db.prepare(`
      UPDATE shipment_case_files SET
        status = 'failed',
        failure_reason = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE case_file_id = ?
    `).run(message, input.caseFileId);
    registerArtifact({
      shipmentId: input.shipmentId,
      type: "ai_case_file_json",
      label: "AI Shipment Case File JSON",
      status: "failed",
      localPathOrId: input.caseFileId,
      relatedAgentRunId: input.agentRunId,
      relatedAgentStepId: input.generationStepId,
      metadata: { error: message },
    }, input.db);
    recordAgentStep({
      runId: input.agentRunId,
      shipmentId: input.shipmentId,
      agentName: "Proof Agent",
      stepName: "Store case file artifacts on Walrus",
      status: "failed",
      message,
    }, input.db);
  }
}

function buildMemoryProvenance(input: {
  shipment: ShipmentRecord;
  comparisons: FieldComparison[];
  memories: RecalledMemory[];
  rememberedFacts: ShipmentMemoryFact[];
  recalledAt: string;
}): MemoryProvenance[] {
  const byField = new Map(input.rememberedFacts.map((fact) => [fact.field, fact]));
  const memoriesByShipment = new Map<string, RecalledMemory>();
  for (const memory of input.memories) {
    const shipmentId = extractField(memory.text, "shipmentId") ?? extractField(memory.text, "shipment_id");
    if (shipmentId && !memoriesByShipment.has(shipmentId)) memoriesByShipment.set(shipmentId, memory);
  }

  return input.comparisons
    .filter((comparison) => comparison.rememberedValue !== null && comparison.rememberedValue !== undefined)
    .map((comparison) => {
      const fact = byField.get(comparison.field);
      const sourceShipmentId = fact?.shipmentId ?? null;
      const memory = sourceShipmentId ? memoriesByShipment.get(sourceShipmentId) : input.memories[0];
      const walrusEvidence = fact?.evidence.walrusBlobId ?? comparison.evidence?.find((item) => item.kind === "walrus")?.value ?? null;
      return {
        field: comparison.field,
        rememberedValue: comparison.rememberedValue,
        sourceShipmentId,
        sourceCaseFileId: null,
        memwalNamespace: memory?.namespace ?? partyNamespace(normalizeNamespaceKey(input.shipment.exporter.taxId, input.shipment.exporter.company)),
        memwalMemoryId: memory?.blobId ?? null,
        memwalBlobId: memory?.blobId ?? null,
        walrusBlobId: walrusEvidence,
        suiObjectId: fact?.evidence.suiPassport ?? input.shipment.passportId ?? null,
        suiTxDigest: fact?.evidence.suiTxDigest ?? input.shipment.txDigest ?? null,
        confidence: comparison.confidence,
        recalledAt: input.recalledAt,
        explanation: comparison.explanation,
      };
    });
}

function groupArtifacts(artifacts: ArtifactRef[]): ShipmentCaseFileArtifact["artifacts"] {
  return {
    uploadedDocuments: artifacts.filter((artifact) => artifact.type === "uploaded_document" || artifact.type === "document"),
    extractionResults: artifacts.filter((artifact) => artifact.type === "extracted_facts"),
    validationReport: artifacts.find((artifact) => artifact.type === "validation_report") ?? null,
    walrusPackage: artifacts.find((artifact) => artifact.type === "walrus_package_zip" || artifact.type === "document_package") ?? null,
    suiPassport: artifacts.find((artifact) => artifact.type === "sui_passport_reference") ?? null,
    memwalMemory: artifacts.find((artifact) => artifact.type === "memwal_memory_reference") ?? null,
  };
}

function stepToSummary(step: AgentStep): AgentStepSummary {
  return {
    agentName: step.agentName,
    stepName: step.stepName,
    status: step.status,
    message: step.message,
    walrusBlobIds: step.walrusBlobIds,
    suiTxDigests: step.suiTxDigests,
  };
}

function parseManifest(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function collectWalrusBlobIds(shipment: ShipmentRecord, artifacts: ArtifactRef[]): string[] {
  return [...new Set([
    ...(shipment.walrusBlobIds ?? []),
    shipment.walrusManifestBlobId,
    shipment.walrus?.blobId,
    ...artifacts.map((artifact) => artifact.walrusBlobId),
  ].filter((id): id is string => Boolean(id)))];
}

function decideFinal(overallVerdict: string, findings: Array<{ severity: string }>): FinalDecision {
  if (findings.some((finding) => finding.severity === "error")) return "blocked_for_review";
  if (overallVerdict === "aligned" && findings.length === 0) return "ready_for_customs";
  return "needs_human_review";
}

function riskFromFindings(findings: Array<{ severity: string }>, fallback?: string): CaseRiskLevel {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  if (errors >= 2) return "critical";
  if (errors === 1) return "high";
  if (warnings > 0) return "medium";
  return fallback?.toLowerCase() === "high" ? "high" : fallback?.toLowerCase() === "medium" ? "medium" : "low";
}

function scoreFromRisk(risk: CaseRiskLevel, verdict: string): number {
  if (risk === "critical") return 35;
  if (risk === "high") return 55;
  if (risk === "medium") return 75;
  return verdict === "aligned" ? 95 : 85;
}

function recommendedActionFor(decision: FinalDecision, risk: CaseRiskLevel): string {
  if (decision === "ready_for_customs") return "Proceed to customs review with the generated evidence chain.";
  if (risk === "critical" || risk === "high") return "Block release and route to human compliance review before payment or customs submission.";
  return "Review highlighted differences, resolve missing evidence, then re-run validation.";
}

function renderCaseFileMarkdown(artifact: ShipmentCaseFileArtifact, shipment: ShipmentRecord): string {
  const lines = [
    `# AI Shipment Case File: ${artifact.shipmentId}`,
    "",
    `Generated: ${artifact.generatedAt}`,
    `Exporter: ${shipment.exporter.company}`,
    `Importer: ${shipment.importer.company}`,
    `Decision: ${artifact.finalDecision}`,
    `Risk: ${artifact.riskLevel}`,
    `Readiness score: ${artifact.customsReadinessScore}`,
    "",
    "## Recommended Action",
    artifact.recommendedAction,
    "",
    "## Memory Provenance",
    ...(
      artifact.memoryProvenance.length > 0
        ? artifact.memoryProvenance.map((item) => `- ${item.field}: remembered ${String(item.rememberedValue)} from ${item.sourceShipmentId ?? "unknown shipment"} via ${item.memwalNamespace}`)
        : ["- No prior memory was recalled. This shipment establishes a baseline after mint and memory sync."]
    ),
    "",
    "## Evidence Chain",
    `- Walrus artifacts: ${artifact.evidenceChain.walrusBlobIds.join(", ") || "pending"}`,
    `- Sui passport: ${artifact.evidenceChain.suiPassportId ?? "pending"}`,
    `- Sui transaction: ${artifact.evidenceChain.suiTxDigest ?? "pending"}`,
    "",
    "## Agent Steps",
    ...artifact.agentSteps.map((step) => `- ${step.agentName}: ${step.stepName} (${step.status})`),
  ];
  return lines.join("\n");
}

function extractField(text: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*[:=]\\s*([^;\\n,}]+)`, "i"));
  return match?.[1]?.trim().replace(/^"|"$/g, "") ?? null;
}
