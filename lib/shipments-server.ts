import type { ShipmentRecord } from "./shipments-store";
import { getDb } from "./db";
import { listProgressManifests } from "./progress-manifests";

type ShipmentRow = {
  id: string;
  created_by: string;
  initiator_address: string | null;
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
  memwal_manifest_blob_id?: string | null;
  memwal_summary_blob_id?: string | null;
  memwal_sync_status?: string | null;
  memwal_sync_error?: string | null;
  memwal_synced_at?: string | null;
  walrus_manifest_blob_id: string | null;
  manifest_hash: string | null;
  minted_at: string | null;
  created_at: string;
  updated_at: string;
  ai_json?: string | null;
  walrus_json?: string | null;
  template_id?: string | null;
  on_chain_record_id?: string | null;
  on_chain_accumulator_id?: string | null;
  on_chain_package_id?: string | null;
  on_chain_network?: string | null;
};

type ShipmentFileDocRow = {
  file_name: string;
  doc_type: string | null;
  slot_key: string | null;
  uploaded_at: string;
  uploaded_by_role: string;
};

function canonicalDocumentKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("commercial invoice")) return "commercial_invoice";
  if (normalized.includes("packing list")) return "packing_list";
  if (normalized.includes("certificate of origin")) return "certificate_of_origin";
  if (normalized.includes("bill of lading") || normalized.includes("air waybill")) return "bill_of_lading";
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || null;
}

function ownerFromUploadedByRole(
  uploadedByRole: string,
  workflow: ShipmentRecord["workflow"]
): ShipmentRecord["documents"][number]["owner"] {
  const normalized = uploadedByRole.trim().toLowerCase();
  if (normalized === "importer") return "Importer";
  if (normalized === "exporter") return "Exporter";
  return workflow === "importer" ? "Importer" : "Exporter";
}

function getPersistedShipmentFiles(shipmentId: string, db: ReturnType<typeof getDb>): ShipmentFileDocRow[] {
  return db.prepare(
    `SELECT file_name, doc_type, slot_key, uploaded_at, uploaded_by_role
     FROM shipment_files
     WHERE shipment_id = ? AND state NOT IN ('superseded')
     ORDER BY uploaded_at ASC`
  ).all(shipmentId) as ShipmentFileDocRow[];
}

function reconcileDocuments(
  shipmentId: string,
  workflow: ShipmentRecord["workflow"],
  documents: ShipmentRecord["documents"],
  db: ReturnType<typeof getDb>
): ShipmentRecord["documents"] {
  const shipmentFiles = getPersistedShipmentFiles(shipmentId, db);
  const filesByKey = new Map<string, ShipmentFileDocRow>();
  const unmatchedFiles: ShipmentFileDocRow[] = [];

  for (const file of shipmentFiles) {
    const key = canonicalDocumentKey(file.slot_key ?? file.doc_type ?? file.file_name);
    if (key) {
      filesByKey.set(key, file);
    } else {
      unmatchedFiles.push(file);
    }
  }

  const usedFileKeys = new Set<string>();
  const reconciled = documents.map((doc) => {
    const key = canonicalDocumentKey(doc.name);
    const matchedFile = key ? filesByKey.get(key) : undefined;
    if (!matchedFile) {
      return { ...doc, uploaded: false, fileName: doc.fileName, uploadedAt: doc.uploadedAt };
    }
    usedFileKeys.add(key!);
    return {
      ...doc,
      uploaded: true,
      fileName: matchedFile.file_name,
      uploadedAt: matchedFile.uploaded_at,
    };
  });

  for (const [key, file] of filesByKey.entries()) {
    if (usedFileKeys.has(key)) continue;
    reconciled.push({
      name: humanizeDocumentKey(file.slot_key ?? file.doc_type ?? file.file_name),
      owner: ownerFromUploadedByRole(file.uploaded_by_role, workflow),
      required: false,
      uploaded: true,
      fileName: file.file_name,
      uploadedAt: file.uploaded_at,
    });
  }

  for (const file of unmatchedFiles) {
    reconciled.push({
      name: file.file_name,
      owner: ownerFromUploadedByRole(file.uploaded_by_role, workflow),
      required: false,
      uploaded: true,
      fileName: file.file_name,
      uploadedAt: file.uploaded_at,
    });
  }

  return reconciled;
}

function humanizeDocumentKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function rowToRecord(row: ShipmentRow): ShipmentRecord {
  const db = getDb();
  const storedDocuments = JSON.parse(row.documents_json) as ShipmentRecord["documents"];
  const documents = reconcileDocuments(row.id, row.workflow as ShipmentRecord["workflow"], storedDocuments, db);
  const walrusBlobIds = getWalrusBlobIds(row.id);
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by as ShipmentRecord["createdBy"],
    initiatorAddress: row.initiator_address ?? undefined,
    workflow: row.workflow as ShipmentRecord["workflow"],
    status: row.status as ShipmentRecord["status"],
    importer: JSON.parse(row.importer_json),
    exporter: JSON.parse(row.exporter_json),
    notifyParty: row.notify_party_json ? JSON.parse(row.notify_party_json) : undefined,
    broker: row.broker ?? undefined,
    freightForwarder: row.freight_forwarder ?? undefined,
    shipment: JSON.parse(row.shipment_json),
    cargo: JSON.parse(row.cargo_json),
    documents,
    inviteToken: row.invite_token ?? undefined,
    extractedRef: row.extracted_ref ?? undefined,
    extractionStatus: (row.extraction_status as ShipmentRecord["extractionStatus"]) ?? undefined,
    ai: row.ai_json ? JSON.parse(row.ai_json) : undefined,
    walrus: row.walrus_json ? JSON.parse(row.walrus_json) : undefined,
    passportId: row.passport_id ?? undefined,
    txDigest: row.tx_digest ?? undefined,
    memWalSpaceId: row.memwal_space_id ?? undefined,
    memWalManifestBlobId: row.memwal_manifest_blob_id ?? undefined,
    memWalSummaryBlobId: row.memwal_summary_blob_id ?? undefined,
    memWalSyncStatus: (row.memwal_sync_status as ShipmentRecord["memWalSyncStatus"]) ?? undefined,
    memWalSyncError: row.memwal_sync_error ?? undefined,
    memWalSyncedAt: row.memwal_synced_at ?? undefined,
    walrusManifestBlobId: row.walrus_manifest_blob_id ?? undefined,
    walrusBlobIds: walrusBlobIds.length > 0 ? walrusBlobIds : undefined,
    manifestHash: row.manifest_hash ?? undefined,
    mintedAt: row.minted_at ?? undefined,
    templateId: row.template_id ?? undefined,
    onChainRecordId: row.on_chain_record_id ?? undefined,
    onChainAccumulatorId: row.on_chain_accumulator_id ?? undefined,
    onChainPackageId: row.on_chain_package_id ?? undefined,
    onChainNetwork: row.on_chain_network ?? undefined,
    progressManifests: listProgressManifests(row.id),
  };
}

function getWalrusBlobIds(shipmentId: string): string[] {
  try {
    const db = getDb();
    const manifestRows = db
      .prepare("SELECT blob_id FROM walrus_blobs WHERE shipment_id = ? AND purpose IN ('manifest', 'document_package') ORDER BY stored_at ASC")
      .all(shipmentId) as { blob_id: string }[];
    const documentRows = db
      .prepare(
        `SELECT walrus_blob_id AS blob_id
         FROM shipment_files
         WHERE shipment_id = ? AND walrus_blob_id IS NOT NULL
         ORDER BY uploaded_at ASC`
      )
      .all(shipmentId) as { blob_id: string }[];

    const seen = new Set<string>();
    return [...manifestRows, ...documentRows]
      .map((row) => row.blob_id)
      .filter((blobId) => {
        if (seen.has(blobId)) return false;
        seen.add(blobId);
        return true;
      });
  } catch {
    return [];
  }
}

function recordToParams(record: ShipmentRecord) {
  return {
    id: record.id,
    created_by: record.createdBy,
    initiator_address: record.initiatorAddress ?? null,
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
    passport_id: record.passportId ?? null,
    tx_digest: record.txDigest ?? null,
    memwal_space_id: record.memWalSpaceId ?? null,
    memwal_manifest_blob_id: record.memWalManifestBlobId ?? null,
    memwal_summary_blob_id: record.memWalSummaryBlobId ?? null,
    memwal_sync_status: record.memWalSyncStatus ?? null,
    memwal_sync_error: record.memWalSyncError ?? null,
    memwal_synced_at: record.memWalSyncedAt ?? null,
    walrus_manifest_blob_id: record.walrusManifestBlobId ?? null,
    manifest_hash: record.manifestHash ?? null,
    minted_at: record.mintedAt ?? null,
    ai_json: record.ai ? JSON.stringify(record.ai) : null,
    walrus_json: record.walrus ? JSON.stringify(record.walrus) : null,
    template_id: record.templateId ?? null,
    on_chain_record_id: record.onChainRecordId ?? null,
    on_chain_accumulator_id: record.onChainAccumulatorId ?? null,
    on_chain_package_id: record.onChainPackageId ?? null,
    on_chain_network: record.onChainNetwork ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function upsertShipment(record: ShipmentRecord): void {
  const db = getDb();
  // Check if the shipments table has ai_json and walrus_json columns; add if missing
  // (these are extra columns beyond the DDL migration, stored alongside the main shipment)
  ensureExtraColumns(db);

  const p = recordToParams({
    ...record,
    documents: reconcileDocuments(record.id, record.workflow, record.documents, db),
  });
  db.prepare(`
    INSERT INTO shipments (
      id, created_by, workflow, status,
      initiator_address,
      importer_json, exporter_json, notify_party_json,
      broker, freight_forwarder,
      shipment_json, cargo_json, documents_json,
      invite_token, extracted_ref, extraction_status,
      passport_id, tx_digest, memwal_space_id, memwal_manifest_blob_id, memwal_summary_blob_id,
      memwal_sync_status, memwal_sync_error, memwal_synced_at,
      walrus_manifest_blob_id, manifest_hash, minted_at,
      ai_json, walrus_json,
      template_id, on_chain_record_id, on_chain_accumulator_id, on_chain_package_id,
      on_chain_network,
      created_at, updated_at
    ) VALUES (
      @id, @created_by, @workflow, @status,
      @initiator_address,
      @importer_json, @exporter_json, @notify_party_json,
      @broker, @freight_forwarder,
      @shipment_json, @cargo_json, @documents_json,
      @invite_token, @extracted_ref, @extraction_status,
      @passport_id, @tx_digest, @memwal_space_id, @memwal_manifest_blob_id, @memwal_summary_blob_id,
      @memwal_sync_status, @memwal_sync_error, @memwal_synced_at,
      @walrus_manifest_blob_id, @manifest_hash, @minted_at,
      @ai_json, @walrus_json,
      @template_id, @on_chain_record_id, @on_chain_accumulator_id, @on_chain_package_id,
      @on_chain_network,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      workflow = excluded.workflow,
      status = excluded.status,
      initiator_address = COALESCE(excluded.initiator_address, shipments.initiator_address),
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
      passport_id = COALESCE(excluded.passport_id, shipments.passport_id),
      tx_digest = COALESCE(excluded.tx_digest, shipments.tx_digest),
      memwal_space_id = COALESCE(excluded.memwal_space_id, shipments.memwal_space_id),
      memwal_manifest_blob_id = COALESCE(excluded.memwal_manifest_blob_id, shipments.memwal_manifest_blob_id),
      memwal_summary_blob_id = COALESCE(excluded.memwal_summary_blob_id, shipments.memwal_summary_blob_id),
      memwal_sync_status = COALESCE(excluded.memwal_sync_status, shipments.memwal_sync_status),
      memwal_sync_error = COALESCE(excluded.memwal_sync_error, shipments.memwal_sync_error),
      memwal_synced_at = COALESCE(excluded.memwal_synced_at, shipments.memwal_synced_at),
      walrus_manifest_blob_id = COALESCE(excluded.walrus_manifest_blob_id, shipments.walrus_manifest_blob_id),
      manifest_hash = COALESCE(excluded.manifest_hash, shipments.manifest_hash),
      minted_at = COALESCE(excluded.minted_at, shipments.minted_at),
      ai_json = excluded.ai_json,
      walrus_json = COALESCE(excluded.walrus_json, shipments.walrus_json),
      template_id = COALESCE(excluded.template_id, shipments.template_id),
      on_chain_record_id = COALESCE(excluded.on_chain_record_id, shipments.on_chain_record_id),
      on_chain_accumulator_id = COALESCE(excluded.on_chain_accumulator_id, shipments.on_chain_accumulator_id),
      on_chain_package_id = COALESCE(excluded.on_chain_package_id, shipments.on_chain_package_id),
      on_chain_network = COALESCE(excluded.on_chain_network, shipments.on_chain_network),
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
  const rows = db.prepare("SELECT * FROM shipments WHERE status != 'Draft' ORDER BY created_at DESC").all() as ShipmentRow[];
  return rows.map(rowToRecord);
}

export function deleteShipment(id: string): void {
  const db = getDb();
  const fileRows = db
    .prepare("SELECT sha256 FROM shipment_files WHERE shipment_id = ?")
    .all(id) as { sha256: string }[];
  const sha256s = fileRows.map((row) => row.sha256);

  db.transaction(() => {
    db.prepare(`
      DELETE FROM mock_sui_grants
      WHERE passport_id IN (
        SELECT passport_id FROM mock_sui_passports WHERE shipment_id = ?
      )
    `).run(id);

    db.prepare("DELETE FROM walrus_blobs WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM validation_findings WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM validation_runs WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM extraction_runs WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM embedding_chunks WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM manifest_cache WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM progress_manifests WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM passport_endorsements WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM shipment_artifacts WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM shipment_case_files WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM agent_steps WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM agent_runs WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM persistent_agent_monitored_shipments WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM tracking_failures WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM mock_sui_passports WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM shipment_files WHERE shipment_id = ?").run(id);
    db.prepare("DELETE FROM shipments WHERE id = ?").run(id);
  })();

  const deleteOrphanedCache = db.prepare(`
    DELETE FROM file_cache
    WHERE sha256 = ?
      AND NOT EXISTS (
        SELECT 1 FROM shipment_files WHERE shipment_files.sha256 = file_cache.sha256
      )
  `);
  for (const sha256 of sha256s) {
    deleteOrphanedCache.run(sha256);
  }
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
    walrusJson?: string | null;
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
      walrus_json = COALESCE(@walrusJson, walrus_json),
      status = 'Passport Minted',
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = @id
  `).run({ ...pointers, id });
}

export function updateShipmentSealPointers(
  id: string,
  pointers: { sealObjectId: string; encryptedWalrusBlobId: string },
): void {
  getDb().prepare(`
    UPDATE shipments SET
      seal_object_id = @sealObjectId,
      encrypted_walrus_blob_id = @encryptedWalrusBlobId,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = @id
  `).run({ ...pointers, id });
}

export function updateShipmentMemWalSync(
  id: string,
  sync: {
    memWalSpaceId?: string;
    manifestBlobId?: string | null;
    summaryBlobId?: string | null;
    status: "pending" | "synced" | "failed";
    error?: string | null;
    syncedAt?: string | null;
  }
): void {
  const params = {
    id,
    memWalSpaceId: sync.memWalSpaceId ?? null,
    manifestBlobId: sync.manifestBlobId ?? null,
    summaryBlobId: sync.summaryBlobId ?? null,
    status: sync.status,
    error: sync.error ?? null,
    syncedAt: sync.syncedAt ?? null,
  };
  getDb().prepare(`
    UPDATE shipments SET
      memwal_space_id = COALESCE(@memWalSpaceId, memwal_space_id),
      memwal_manifest_blob_id = COALESCE(@manifestBlobId, memwal_manifest_blob_id),
      memwal_summary_blob_id = COALESCE(@summaryBlobId, memwal_summary_blob_id),
      memwal_sync_status = @status,
      memwal_sync_error = @error,
      memwal_synced_at = @syncedAt,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = @id
  `).run(params);
}

export function updateShipmentOnChainPointers(
  id: string,
  pointers: {
    templateId: string;
    onChainRecordId: string;
    onChainAccumulatorId: string;
    onChainPackageId: string;
    onChainNetwork: string;
  }
): void {
  getDb().prepare(`
    UPDATE shipments SET
      template_id = @templateId,
      on_chain_record_id = @onChainRecordId,
      on_chain_accumulator_id = @onChainAccumulatorId,
      on_chain_package_id = @onChainPackageId,
      on_chain_network = @onChainNetwork,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = @id
  `).run({ ...pointers, id });
}

export function resetShipmentOnChainBootstrapState(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`
      UPDATE shipments SET
        on_chain_record_id = NULL,
        on_chain_accumulator_id = NULL,
        on_chain_package_id = NULL,
        on_chain_network = NULL,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ?
    `).run(id);

    db.prepare(`
      UPDATE shipment_files
      SET on_chain_commitment_tx = NULL,
          on_chain_commitment_status = 'pending',
          on_chain_commitment_error = NULL
      WHERE shipment_id = ?
    `).run(id);
  })();
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
    if (!cols.includes("initiator_address")) {
      db.exec("ALTER TABLE shipments ADD COLUMN initiator_address TEXT");
    }
    if (!cols.includes("template_id")) {
      db.exec("ALTER TABLE shipments ADD COLUMN template_id TEXT REFERENCES shipment_templates(id)");
    }
    if (!cols.includes("on_chain_record_id")) {
      db.exec("ALTER TABLE shipments ADD COLUMN on_chain_record_id TEXT");
    }
    if (!cols.includes("on_chain_accumulator_id")) {
      db.exec("ALTER TABLE shipments ADD COLUMN on_chain_accumulator_id TEXT");
    }
    if (!cols.includes("on_chain_package_id")) {
      db.exec("ALTER TABLE shipments ADD COLUMN on_chain_package_id TEXT");
    }
    if (!cols.includes("on_chain_network")) {
      db.exec("ALTER TABLE shipments ADD COLUMN on_chain_network TEXT");
    }
    if (!cols.includes("memwal_manifest_blob_id")) {
      db.exec("ALTER TABLE shipments ADD COLUMN memwal_manifest_blob_id TEXT");
    }
    if (!cols.includes("memwal_summary_blob_id")) {
      db.exec("ALTER TABLE shipments ADD COLUMN memwal_summary_blob_id TEXT");
    }
    if (!cols.includes("memwal_sync_status")) {
      db.exec("ALTER TABLE shipments ADD COLUMN memwal_sync_status TEXT");
    }
    if (!cols.includes("memwal_sync_error")) {
      db.exec("ALTER TABLE shipments ADD COLUMN memwal_sync_error TEXT");
    }
    if (!cols.includes("memwal_synced_at")) {
      db.exec("ALTER TABLE shipments ADD COLUMN memwal_synced_at TEXT");
    }
    _extraColumnsAdded = true;
  } catch {
    // non-fatal — table will be created by migration on next request
  }
}
