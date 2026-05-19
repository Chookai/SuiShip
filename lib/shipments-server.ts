import type { ShipmentRecord } from "./shipments-store";
import { getDb } from "./db";

type ShipmentRow = {
  id: string;
  created_by: string;
  workflow: string;
  status: string;
  importer_json: string;
  exporter_json: string;
  notify_party_json: string | null;
  broker: string | null;
  freight_forwarder: string | null;
  shipment_json: string;
  cargo_json: string;
  documents_json: string;
  invite_token: string | null;
  extracted_ref: string | null;
  extraction_status: string | null;
  passport_id: string | null;
  tx_digest: string | null;
  memwal_space_id: string | null;
  walrus_manifest_blob_id: string | null;
  manifest_hash: string | null;
  minted_at: string | null;
  created_at: string;
  updated_at: string;
  ai_json?: string | null;
  walrus_json?: string | null;
};

function rowToRecord(row: ShipmentRow): ShipmentRecord {
  const walrusBlobIds = getWalrusBlobIds(row.id);
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by as ShipmentRecord["createdBy"],
    workflow: row.workflow as ShipmentRecord["workflow"],
    status: row.status as ShipmentRecord["status"],
    importer: JSON.parse(row.importer_json),
    exporter: JSON.parse(row.exporter_json),
    notifyParty: row.notify_party_json ? JSON.parse(row.notify_party_json) : undefined,
    broker: row.broker ?? undefined,
    freightForwarder: row.freight_forwarder ?? undefined,
    shipment: JSON.parse(row.shipment_json),
    cargo: JSON.parse(row.cargo_json),
    documents: JSON.parse(row.documents_json),
    inviteToken: row.invite_token ?? undefined,
    extractedRef: row.extracted_ref ?? undefined,
    extractionStatus: (row.extraction_status as ShipmentRecord["extractionStatus"]) ?? undefined,
    ai: row.ai_json ? JSON.parse(row.ai_json) : undefined,
    walrus: row.walrus_json ? JSON.parse(row.walrus_json) : undefined,
    passportId: row.passport_id ?? undefined,
    txDigest: row.tx_digest ?? undefined,
    memWalSpaceId: row.memwal_space_id ?? undefined,
    walrusManifestBlobId: row.walrus_manifest_blob_id ?? undefined,
    walrusBlobIds: walrusBlobIds.length > 0 ? walrusBlobIds : undefined,
    manifestHash: row.manifest_hash ?? undefined,
    mintedAt: row.minted_at ?? undefined,
  };
}

function getWalrusBlobIds(shipmentId: string): string[] {
  try {
    const rows = getDb()
      .prepare("SELECT blob_id FROM walrus_blobs WHERE shipment_id = ? ORDER BY stored_at ASC")
      .all(shipmentId) as { blob_id: string }[];
    return rows.map((row) => row.blob_id);
  } catch {
    return [];
  }
}

function recordToParams(record: ShipmentRecord) {
  return {
    id: record.id,
    created_by: record.createdBy,
    workflow: record.workflow,
    status: record.status,
    importer_json: JSON.stringify(record.importer),
    exporter_json: JSON.stringify(record.exporter),
    notify_party_json: record.notifyParty ? JSON.stringify(record.notifyParty) : null,
    broker: record.broker ?? null,
    freight_forwarder: record.freightForwarder ?? null,
    shipment_json: JSON.stringify(record.shipment),
    cargo_json: JSON.stringify(record.cargo),
    documents_json: JSON.stringify(record.documents),
    invite_token: record.inviteToken ?? null,
    extracted_ref: record.extractedRef ?? null,
    extraction_status: record.extractionStatus ?? null,
    ai_json: record.ai ? JSON.stringify(record.ai) : null,
    walrus_json: record.walrus ? JSON.stringify(record.walrus) : null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function upsertShipment(record: ShipmentRecord): void {
  const db = getDb();
  // Check if the shipments table has ai_json and walrus_json columns; add if missing
  // (these are extra columns beyond the DDL migration, stored alongside the main shipment)
  ensureExtraColumns(db);

  const p = recordToParams(record);
  db.prepare(`
    INSERT INTO shipments (
      id, created_by, workflow, status,
      importer_json, exporter_json, notify_party_json,
      broker, freight_forwarder,
      shipment_json, cargo_json, documents_json,
      invite_token, extracted_ref, extraction_status,
      ai_json, walrus_json,
      created_at, updated_at
    ) VALUES (
      @id, @created_by, @workflow, @status,
      @importer_json, @exporter_json, @notify_party_json,
      @broker, @freight_forwarder,
      @shipment_json, @cargo_json, @documents_json,
      @invite_token, @extracted_ref, @extraction_status,
      @ai_json, @walrus_json,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      workflow = excluded.workflow,
      status = excluded.status,
      importer_json = excluded.importer_json,
      exporter_json = excluded.exporter_json,
      notify_party_json = excluded.notify_party_json,
      broker = excluded.broker,
      freight_forwarder = excluded.freight_forwarder,
      shipment_json = excluded.shipment_json,
      cargo_json = excluded.cargo_json,
      documents_json = excluded.documents_json,
      invite_token = excluded.invite_token,
      extracted_ref = excluded.extracted_ref,
      extraction_status = excluded.extraction_status,
      ai_json = excluded.ai_json,
      walrus_json = excluded.walrus_json,
      updated_at = excluded.updated_at
  `).run(p);
}

export function getShipmentById(id: string): ShipmentRecord | undefined {
  const db = getDb();
  ensureExtraColumns(db);
  const row = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id) as ShipmentRow | undefined;
  return row ? rowToRecord(row) : undefined;
}

export function listShipments(): ShipmentRecord[] {
  const db = getDb();
  ensureExtraColumns(db);
  const rows = db.prepare("SELECT * FROM shipments ORDER BY created_at DESC").all() as ShipmentRow[];
  return rows.map(rowToRecord);
}

export function deleteShipment(id: string): void {
  getDb().prepare("DELETE FROM shipments WHERE id = ?").run(id);
}

export function updateShipmentMintPointers(
  id: string,
  pointers: {
    passportId: string;
    txDigest: string;
    memwalSpaceId: string;
    walrusManifestBlobId: string;
    manifestHash: string;
    mintedAt: string;
  }
): void {
  getDb().prepare(`
    UPDATE shipments SET
      passport_id = @passportId,
      tx_digest = @txDigest,
      memwal_space_id = @memwalSpaceId,
      walrus_manifest_blob_id = @walrusManifestBlobId,
      manifest_hash = @manifestHash,
      minted_at = @mintedAt,
      status = 'Passport Minted',
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = @id
  `).run({ ...pointers, id });
}

let _extraColumnsAdded = false;
function ensureExtraColumns(db: import("better-sqlite3").Database): void {
  if (_extraColumnsAdded) return;
  try {
    const cols = (db.pragma("table_info(shipments)") as { name: string }[]).map((c) => c.name);
    if (cols.length === 0) return; // table doesn't exist yet — migrations pending
    if (!cols.includes("ai_json")) {
      db.exec("ALTER TABLE shipments ADD COLUMN ai_json TEXT");
    }
    if (!cols.includes("walrus_json")) {
      db.exec("ALTER TABLE shipments ADD COLUMN walrus_json TEXT");
    }
    _extraColumnsAdded = true;
  } catch {
    // non-fatal — table will be created by migration on next request
  }
}
