import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { aggregatorUrl } from "./walrus";
import { getDb } from "./db";

export type ArtifactStatus = "local" | "uploading" | "stored_on_walrus" | "failed" | "pending";

export type ArtifactRef = {
  artifactId: string;
  shipmentId: string;
  type: string;
  label: string;
  status: ArtifactStatus;
  localPathOrId?: string | null;
  walrusBlobId?: string | null;
  walrusUrl?: string | null;
  relatedAgentRunId?: string | null;
  relatedAgentStepId?: string | null;
  relatedMemWalNamespace?: string | null;
  relatedSuiTxDigest?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type ArtifactRow = {
  artifact_id: string;
  shipment_id: string;
  type: string;
  label: string;
  status: ArtifactStatus;
  local_path_or_id: string | null;
  walrus_blob_id: string | null;
  walrus_url: string | null;
  related_agent_run_id: string | null;
  related_agent_step_id: string | null;
  related_memwal_namespace: string | null;
  related_sui_tx_digest: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

export function registerArtifact(
  input: {
    shipmentId: string;
    type: string;
    label: string;
    status?: ArtifactStatus;
    localPathOrId?: string | null;
    walrusBlobId?: string | null;
    walrusUrl?: string | null;
    relatedAgentRunId?: string | null;
    relatedAgentStepId?: string | null;
    relatedMemWalNamespace?: string | null;
    relatedSuiTxDigest?: string | null;
    metadata?: Record<string, unknown>;
  },
  db: Database.Database = getDb()
): ArtifactRef {
  const artifactId = randomUUID();
  const walrusUrl = input.walrusUrl ?? (input.walrusBlobId ? aggregatorUrl(input.walrusBlobId) : null);
  db.prepare(`
    INSERT INTO shipment_artifacts
      (artifact_id, shipment_id, type, label, status, local_path_or_id, walrus_blob_id, walrus_url,
       related_agent_run_id, related_agent_step_id, related_memwal_namespace, related_sui_tx_digest, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artifactId,
    input.shipmentId,
    input.type,
    input.label,
    input.status ?? (input.walrusBlobId ? "stored_on_walrus" : "local"),
    input.localPathOrId ?? null,
    input.walrusBlobId ?? null,
    walrusUrl,
    input.relatedAgentRunId ?? null,
    input.relatedAgentStepId ?? null,
    input.relatedMemWalNamespace ?? null,
    input.relatedSuiTxDigest ?? null,
    JSON.stringify(input.metadata ?? {})
  );
  return getArtifact(artifactId, db)!;
}

export function upsertWalrusArtifact(
  input: {
    shipmentId: string;
    type: string;
    label: string;
    walrusBlobId: string;
    relatedAgentRunId?: string | null;
    relatedAgentStepId?: string | null;
    relatedMemWalNamespace?: string | null;
    relatedSuiTxDigest?: string | null;
    metadata?: Record<string, unknown>;
  },
  db: Database.Database = getDb()
): ArtifactRef {
  const existing = db.prepare(`
    SELECT artifact_id FROM shipment_artifacts
    WHERE shipment_id = ? AND type = ? AND walrus_blob_id = ?
    LIMIT 1
  `).get(input.shipmentId, input.type, input.walrusBlobId) as { artifact_id: string } | undefined;

  if (!existing) {
    return registerArtifact({
      ...input,
      status: "stored_on_walrus",
      walrusUrl: aggregatorUrl(input.walrusBlobId),
    }, db);
  }

  db.prepare(`
    UPDATE shipment_artifacts SET
      label = @label,
      status = 'stored_on_walrus',
      walrus_url = @walrusUrl,
      related_agent_run_id = COALESCE(@relatedAgentRunId, related_agent_run_id),
      related_agent_step_id = COALESCE(@relatedAgentStepId, related_agent_step_id),
      related_memwal_namespace = COALESCE(@relatedMemWalNamespace, related_memwal_namespace),
      related_sui_tx_digest = COALESCE(@relatedSuiTxDigest, related_sui_tx_digest),
      metadata_json = @metadataJson,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE artifact_id = @artifactId
  `).run({
    artifactId: existing.artifact_id,
    label: input.label,
    walrusUrl: aggregatorUrl(input.walrusBlobId),
    relatedAgentRunId: input.relatedAgentRunId ?? null,
    relatedAgentStepId: input.relatedAgentStepId ?? null,
    relatedMemWalNamespace: input.relatedMemWalNamespace ?? null,
    relatedSuiTxDigest: input.relatedSuiTxDigest ?? null,
    metadataJson: JSON.stringify(input.metadata ?? {}),
  });
  return getArtifact(existing.artifact_id, db)!;
}

export function listArtifacts(shipmentId: string, db: Database.Database = getDb()): ArtifactRef[] {
  const rows = db.prepare(`
    SELECT * FROM shipment_artifacts WHERE shipment_id = ? ORDER BY created_at ASC
  `).all(shipmentId) as ArtifactRow[];
  return rows.map(rowToArtifact);
}

export function getArtifact(artifactId: string, db: Database.Database = getDb()): ArtifactRef | null {
  const row = db.prepare("SELECT * FROM shipment_artifacts WHERE artifact_id = ?").get(artifactId) as ArtifactRow | undefined;
  return row ? rowToArtifact(row) : null;
}

function rowToArtifact(row: ArtifactRow): ArtifactRef {
  return {
    artifactId: row.artifact_id,
    shipmentId: row.shipment_id,
    type: row.type,
    label: row.label,
    status: row.status,
    localPathOrId: row.local_path_or_id,
    walrusBlobId: row.walrus_blob_id,
    walrusUrl: row.walrus_url,
    relatedAgentRunId: row.related_agent_run_id,
    relatedAgentStepId: row.related_agent_step_id,
    relatedMemWalNamespace: row.related_memwal_namespace,
    relatedSuiTxDigest: row.related_sui_tx_digest,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
