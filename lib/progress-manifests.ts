import { createHash, randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { ProgressManifest, ShipmentRecord } from "./shipments-store";
import { getDb } from "./db";
import { isMemWalConfigured, memwalRemember } from "./memwal/client";

type ProgressManifestRow = {
  id: string;
  shipment_id: string;
  sequence: number;
  stage: string;
  actor: string;
  summary: string;
  manifest_json: string;
  memwal_blob_id: string | null;
  memwal_namespace: string;
  status: string;
  created_at: string;
};

type ShipmentProgressRow = {
  id: string;
  created_by: string;
  workflow: string;
  status: string;
  importer_json: string;
  exporter_json: string;
  documents_json: string;
};

export type ProgressManifestInput = {
  stage:
    | "shipment_created"
    | "documents_uploaded"
    | "ai_check_failed"
    | "ai_check_passed"
    | "walrus_package_stored"
    | "final_manifest"
    | "sui_passport_created";
  actor: string;
  summary: string;
  documents?: Array<{ name: string; fileName?: string; uploaded?: boolean }>;
  aiIssues?: Array<{ severity?: string; message?: string; field?: string }>;
  walrusPackage?: {
    blobId: string;
    fileName: string;
    sizeBytes: number;
    endEpoch?: number;
    publisher: string;
    aggregator: string;
  };
  suiPassport?: {
    passportId?: string;
    txDigest: string;
    packageId: string;
    network: "testnet";
  };
};

function rowToProgressManifest(row: ProgressManifestRow): ProgressManifest {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    sequence: row.sequence,
    stage: row.stage,
    actor: row.actor,
    summary: row.summary,
    manifestJson: row.manifest_json,
    memwalBlobId: row.memwal_blob_id ?? undefined,
    memwalNamespace: row.memwal_namespace,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function listProgressManifests(shipmentId: string, db: Database = getDb()): ProgressManifest[] {
  const rows = db
    .prepare("SELECT * FROM progress_manifests WHERE shipment_id = ? ORDER BY sequence ASC")
    .all(shipmentId) as ProgressManifestRow[];
  return rows.map(rowToProgressManifest);
}

export async function recordProgressManifest(
  shipmentId: string,
  input: ProgressManifestInput,
  db: Database = getDb()
): Promise<ProgressManifest> {
  const shipment = getShipmentForProgress(shipmentId, db);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const sequenceRow = db
    .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM progress_manifests WHERE shipment_id = ?")
    .get(shipmentId) as { next_sequence: number };
  const sequence = sequenceRow.next_sequence;
  const namespace = `${shipmentId}:progress`;
  const id = randomUUID();
  const manifest = buildProgressManifest(shipment, input, sequence);
  const manifestJson = JSON.stringify(manifest, null, 2);

  let memwalBlobId: string | null = null;
  let status = "stored_local";
  if (isMemWalConfigured()) {
    const result = await memwalRemember(`SUISHIP PROGRESS MANIFEST\n${manifestJson}`, namespace);
    memwalBlobId = result.blobId;
    status = "stored_memwal";
  } else {
    memwalBlobId = `local_${createHash("sha256").update(manifestJson).digest("hex").slice(0, 24)}`;
  }

  db.prepare(`
    INSERT INTO progress_manifests
      (id, shipment_id, sequence, stage, actor, summary, manifest_json, memwal_blob_id, memwal_namespace, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, shipmentId, sequence, input.stage, input.actor, input.summary, manifestJson, memwalBlobId, namespace, status);

  return rowToProgressManifest(
    db.prepare("SELECT * FROM progress_manifests WHERE id = ?").get(id) as ProgressManifestRow
  );
}

function getShipmentForProgress(shipmentId: string, db: Database): ShipmentRecord | null {
  const row = db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipmentId) as ShipmentProgressRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    createdAt: "",
    updatedAt: "",
    createdBy: row.created_by as ShipmentRecord["createdBy"],
    workflow: row.workflow as ShipmentRecord["workflow"],
    status: row.status as ShipmentRecord["status"],
    importer: JSON.parse(row.importer_json),
    exporter: JSON.parse(row.exporter_json),
    shipment: {
      origin: "",
      originPort: "",
      destination: "",
      destinationPort: "",
      carrier: "",
      transportMode: "",
      incoterm: "",
      etd: "",
      eta: "",
      declaredValue: "",
      currency: "",
    },
    cargo: {
      description: "",
      sku: "",
      hsCode: "",
      quantity: "",
      grossWeight: "",
      netWeight: "",
      handlingUnits: "",
      container: "",
      seal: "",
      countryOfOrigin: "",
      dangerousGoods: "",
      temperatureControlled: "",
    },
    documents: JSON.parse(row.documents_json),
  };
}

function buildProgressManifest(
  shipment: ShipmentRecord,
  input: ProgressManifestInput,
  sequence: number
) {
  const uploadedDocuments = shipment.documents
    .filter((doc) => doc.uploaded)
    .map((doc) => ({
      name: doc.name,
      owner: doc.owner,
      file_name: doc.fileName,
      uploaded_at: doc.uploadedAt,
    }));

  return {
    schema_version: "progress.v1",
    shipment_id: shipment.id,
    sequence,
    stage: input.stage,
    actor: input.actor,
    summary: input.summary,
    created_at: new Date().toISOString(),
    shipment_status: shipment.status,
    parties: {
      importer: shipment.importer.company,
      exporter: shipment.exporter.company,
      created_by: shipment.createdBy,
    },
    uploaded_documents: input.documents ?? uploadedDocuments,
    ai_issues: input.aiIssues ?? [],
    walrus_package: input.walrusPackage,
    sui_passport: input.suiPassport,
    note: "Progress manifests are audit checkpoints. Final PDFs are packaged as one ZIP, stored on Walrus, validated in MemWal, then anchored by a Sui passport object.",
  };
}
