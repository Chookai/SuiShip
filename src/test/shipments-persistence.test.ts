import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "../../lib/db-migrations/index";
import type { ShipmentRecord } from "../../lib/shipments-store";

// Build an isolated in-memory DB for each test — bypasses the singleton in lib/db.ts
function makeTestDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  // Add extra columns that ensureExtraColumns() handles at runtime (not in migrations)
  const existing = (db.pragma("table_info(shipments)") as { name: string }[]).map((c) => c.name);
  const extras: [string, string][] = [
    ["ai_json", "TEXT"],
    ["walrus_json", "TEXT"],
    ["initiator_address", "TEXT"],
    ["template_id", "TEXT"],
    ["on_chain_record_id", "TEXT"],
    ["on_chain_accumulator_id", "TEXT"],
    ["on_chain_package_id", "TEXT"],
    ["on_chain_network", "TEXT"],
    ["memwal_manifest_blob_id", "TEXT"],
    ["memwal_summary_blob_id", "TEXT"],
    ["memwal_sync_status", "TEXT"],
    ["memwal_sync_error", "TEXT"],
    ["memwal_synced_at", "TEXT"],
  ];
  for (const [col, type] of extras) {
    if (!existing.includes(col)) db.exec(`ALTER TABLE shipments ADD COLUMN ${col} ${type}`);
  }
  return db;
}

function makeRecord(id: string, overrides: Partial<ShipmentRecord> = {}): ShipmentRecord {
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "exporter",
    workflow: "exporter",
    status: "Draft",
    importer: { company: "Importer Co", contact: "Alice", email: "a@example.com", phone: "123" },
    exporter: { company: "Exporter Co", contact: "Bob", email: "b@example.com", phone: "456" },
    shipment: {
      origin: "US", originPort: "LAX", destination: "DE", destinationPort: "HAM",
      carrier: "DHL", transportMode: "Air", incoterm: "FOB",
      etd: "2026-06-01", eta: "2026-06-05", declaredValue: "1000", currency: "USD",
    },
    cargo: {
      description: "Widgets", sku: "W-001", hsCode: "9999.00",
      quantity: "100", grossWeight: "50 kg", netWeight: "45 kg",
      handlingUnits: "2", container: "", seal: "",
      countryOfOrigin: "US", dangerousGoods: "No", temperatureControlled: "No",
    },
    documents: [],
    ...overrides,
  };
}

// Inline upsert/list/delete using the test DB — mirrors shipments-server.ts logic
function upsert(db: Database.Database, record: ShipmentRecord) {
  // Ensure extra columns exist (simplified — test DB has all columns from migrations)
  db.prepare(`
    INSERT INTO shipments (
      id, created_by, workflow, status,
      initiator_address, importer_json, exporter_json, notify_party_json,
      broker, freight_forwarder, shipment_json, cargo_json, documents_json,
      invite_token, extracted_ref, extraction_status,
      passport_id, tx_digest, memwal_space_id, memwal_manifest_blob_id,
      memwal_summary_blob_id, memwal_sync_status, memwal_sync_error, memwal_synced_at,
      walrus_manifest_blob_id, manifest_hash, minted_at,
      ai_json, walrus_json, template_id,
      on_chain_record_id, on_chain_accumulator_id, on_chain_package_id, on_chain_network,
      created_at, updated_at
    ) VALUES (
      @id, @created_by, @workflow, @status,
      @initiator_address, @importer_json, @exporter_json, @notify_party_json,
      @broker, @freight_forwarder, @shipment_json, @cargo_json, @documents_json,
      @invite_token, @extracted_ref, @extraction_status,
      @passport_id, @tx_digest, @memwal_space_id, @memwal_manifest_blob_id,
      @memwal_summary_blob_id, @memwal_sync_status, @memwal_sync_error, @memwal_synced_at,
      @walrus_manifest_blob_id, @manifest_hash, @minted_at,
      @ai_json, @walrus_json, @template_id,
      @on_chain_record_id, @on_chain_accumulator_id, @on_chain_package_id, @on_chain_network,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run({
    id: record.id,
    created_by: record.createdBy,
    workflow: record.workflow,
    status: record.status,
    initiator_address: record.initiatorAddress ?? null,
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
  });
}

function count(db: Database.Database): number {
  return (db.prepare("SELECT COUNT(*) as c FROM shipments").get() as { c: number }).c;
}

function del(db: Database.Database, id: string) {
  db.prepare("DELETE FROM shipments WHERE id = ?").run(id);
}

describe("shipments persistence", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeTestDb();
  });

  it("count is stable across repeated reads with no mutations", () => {
    upsert(db, makeRecord("SS-STABLE-001"));
    upsert(db, makeRecord("SS-STABLE-002"));
    expect(count(db)).toBe(2);
    expect(count(db)).toBe(2);
    expect(count(db)).toBe(2);
  });

  it("upserting the same record twice does not create duplicate rows", () => {
    const r = makeRecord("SS-DEDUP-001");
    upsert(db, r);
    upsert(db, r);
    expect(count(db)).toBe(1);
  });

  it("creating a new shipment increments count by exactly 1", () => {
    upsert(db, makeRecord("SS-A"));
    const before = count(db);
    upsert(db, makeRecord("SS-B"));
    expect(count(db)).toBe(before + 1);
  });

  it("deleting a shipment decrements count by exactly 1", () => {
    upsert(db, makeRecord("SS-DEL-001"));
    upsert(db, makeRecord("SS-DEL-002"));
    const before = count(db);
    del(db, "SS-DEL-001");
    expect(count(db)).toBe(before - 1);
  });

  it("upsert updates an existing record without changing count", () => {
    upsert(db, makeRecord("SS-UPDATE-001", { status: "Draft" }));
    const before = count(db);
    upsert(db, makeRecord("SS-UPDATE-001", { status: "Documents Uploaded" }));
    expect(count(db)).toBe(before);
    const row = db.prepare("SELECT status FROM shipments WHERE id = ?").get("SS-UPDATE-001") as { status: string };
    expect(row.status).toBe("Documents Uploaded");
  });

  it("migrations are idempotent — running twice does not change count", () => {
    upsert(db, makeRecord("SS-MIG-001"));
    runMigrations(db);
    expect(count(db)).toBe(1);
  });

  it("empty DB starts with zero shipments", () => {
    expect(count(db)).toBe(0);
  });
});
