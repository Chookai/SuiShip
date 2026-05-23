import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "./db";

export type AgentRunStatus =
  | "created"
  | "waiting_for_documents"
  | "extracting"
  | "validating"
  | "recalling_memory"
  | "detecting_anomalies"
  | "generating_case_file"
  | "storing_artifacts"
  | "writing_memory"
  | "ready_for_customs"
  | "blocked_for_review"
  | "completed"
  | "failed";

export type AgentStepStatus = "pending" | "running" | "waiting" | "completed" | "failed";
export type AgentName = "Document Agent" | "Memory Agent" | "Risk Agent" | "Proof Agent" | "Orchestrator";

export type AgentRun = {
  id: string;
  shipmentId: string;
  runType: "shipment_compliance";
  status: AgentRunStatus;
  currentStep?: string | null;
  riskLevel?: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  failureReason?: string | null;
};

export type AgentStep = {
  id: string;
  runId: string;
  shipmentId: string;
  agentName: AgentName;
  stepName: string;
  status: AgentStepStatus;
  message?: string | null;
  inputArtifacts: unknown[];
  outputArtifacts: unknown[];
  memoryReads: unknown[];
  memoryWrites: unknown[];
  walrusBlobIds: string[];
  suiTxDigests: string[];
  startedAt: string;
  completedAt?: string | null;
};

type RunRow = {
  id: string;
  shipment_id: string;
  run_type: string;
  status: AgentRunStatus;
  current_step: string | null;
  risk_level: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  failure_reason: string | null;
};

type StepRow = {
  id: string;
  run_id: string;
  shipment_id: string;
  agent_name: AgentName;
  step_name: string;
  status: AgentStepStatus;
  message: string | null;
  input_artifacts: string;
  output_artifacts: string;
  memory_reads: string;
  memory_writes: string;
  walrus_blob_ids: string;
  sui_tx_digests: string;
  started_at: string;
  completed_at: string | null;
};

export function ensureAgentRun(
  shipmentId: string,
  status: AgentRunStatus = "created",
  currentStep = "Shipment compliance workflow created",
  db: Database.Database = getDb()
): AgentRun {
  const existing = getLatestAgentRun(shipmentId, db);
  if (existing && !["completed", "failed"].includes(existing.status)) return existing;

  const id = randomUUID();
  db.prepare(`
    INSERT INTO agent_runs (id, shipment_id, run_type, status, current_step)
    VALUES (?, ?, 'shipment_compliance', ?, ?)
  `).run(id, shipmentId, status, currentStep);
  return getAgentRun(id, db)!;
}

export function updateAgentRun(
  runId: string,
  patch: {
    status?: AgentRunStatus;
    currentStep?: string | null;
    riskLevel?: string | null;
    failureReason?: string | null;
    completed?: boolean;
  },
  db: Database.Database = getDb()
): AgentRun | null {
  const completedAt = patch.completed ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE agent_runs SET
      status = COALESCE(@status, status),
      current_step = COALESCE(@currentStep, current_step),
      risk_level = COALESCE(@riskLevel, risk_level),
      failure_reason = @failureReason,
      completed_at = COALESCE(@completedAt, completed_at),
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = @runId
  `).run({
    runId,
    status: patch.status ?? null,
    currentStep: patch.currentStep ?? null,
    riskLevel: patch.riskLevel ?? null,
    failureReason: patch.failureReason ?? null,
    completedAt,
  });
  return getAgentRun(runId, db);
}

export function recordAgentStep(
  input: {
    runId: string;
    shipmentId: string;
    agentName: AgentName;
    stepName: string;
    status?: AgentStepStatus;
    message?: string | null;
    inputArtifacts?: unknown[];
    outputArtifacts?: unknown[];
    memoryReads?: unknown[];
    memoryWrites?: unknown[];
    walrusBlobIds?: string[];
    suiTxDigests?: string[];
  },
  db: Database.Database = getDb()
): AgentStep {
  const id = randomUUID();
  const status = input.status ?? "completed";
  db.prepare(`
    INSERT INTO agent_steps
      (id, run_id, shipment_id, agent_name, step_name, status, message,
       input_artifacts, output_artifacts, memory_reads, memory_writes, walrus_blob_ids, sui_tx_digests, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.runId,
    input.shipmentId,
    input.agentName,
    input.stepName,
    status,
    input.message ?? null,
    JSON.stringify(input.inputArtifacts ?? []),
    JSON.stringify(input.outputArtifacts ?? []),
    JSON.stringify(input.memoryReads ?? []),
    JSON.stringify(input.memoryWrites ?? []),
    JSON.stringify(input.walrusBlobIds ?? []),
    JSON.stringify(input.suiTxDigests ?? []),
    status === "completed" || status === "failed" ? new Date().toISOString() : null
  );
  return getAgentStep(id, db)!;
}

export function recordWaitingForDocuments(
  shipmentId: string,
  missingDocuments: string[],
  db: Database.Database = getDb()
): AgentRun {
  const run = ensureAgentRun(shipmentId, "waiting_for_documents", "Waiting for missing shipment documents", db);
  updateAgentRun(run.id, {
    status: "waiting_for_documents",
    currentStep: `Waiting for ${missingDocuments.join(", ")}`,
  }, db);
  recordAgentStep({
    runId: run.id,
    shipmentId,
    agentName: "Orchestrator",
    stepName: "Waiting for required documents",
    status: "waiting",
    message: `Agent paused: waiting for ${missingDocuments.join(", ")}.`,
    outputArtifacts: missingDocuments.map((name) => ({ type: "missing_document", name })),
  }, db);
  return getAgentRun(run.id, db)!;
}

export function getLatestAgentRun(shipmentId: string, db: Database.Database = getDb()): AgentRun | null {
  const row = db.prepare(`
    SELECT * FROM agent_runs WHERE shipment_id = ? ORDER BY updated_at DESC, started_at DESC LIMIT 1
  `).get(shipmentId) as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

export function listAgentRuns(shipmentId: string, db: Database.Database = getDb()): AgentRun[] {
  const rows = db.prepare(`
    SELECT * FROM agent_runs WHERE shipment_id = ? ORDER BY started_at ASC
  `).all(shipmentId) as RunRow[];
  return rows.map(rowToRun);
}

export function listAgentSteps(shipmentId: string, runId?: string, db: Database.Database = getDb()): AgentStep[] {
  const rows = runId
    ? db.prepare("SELECT * FROM agent_steps WHERE shipment_id = ? AND run_id = ? ORDER BY started_at ASC").all(shipmentId, runId)
    : db.prepare("SELECT * FROM agent_steps WHERE shipment_id = ? ORDER BY started_at ASC").all(shipmentId);
  return (rows as StepRow[]).map(rowToStep);
}

export function getAgentRun(id: string, db: Database.Database = getDb()): AgentRun | null {
  const row = db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

function getAgentStep(id: string, db: Database.Database): AgentStep | null {
  const row = db.prepare("SELECT * FROM agent_steps WHERE id = ?").get(id) as StepRow | undefined;
  return row ? rowToStep(row) : null;
}

function rowToRun(row: RunRow): AgentRun {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    runType: row.run_type as "shipment_compliance",
    status: row.status,
    currentStep: row.current_step,
    riskLevel: row.risk_level,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
  };
}

function rowToStep(row: StepRow): AgentStep {
  return {
    id: row.id,
    runId: row.run_id,
    shipmentId: row.shipment_id,
    agentName: row.agent_name,
    stepName: row.step_name,
    status: row.status,
    message: row.message,
    inputArtifacts: parseArray(row.input_artifacts),
    outputArtifacts: parseArray(row.output_artifacts),
    memoryReads: parseArray(row.memory_reads),
    memoryWrites: parseArray(row.memory_writes),
    walrusBlobIds: parseArray(row.walrus_blob_ids).filter((v): v is string => typeof v === "string"),
    suiTxDigests: parseArray(row.sui_tx_digests).filter((v): v is string => typeof v === "string"),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function parseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
