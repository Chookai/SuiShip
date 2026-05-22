import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Use process.cwd() as the anchor because __dirname is unreliable inside
// Next.js webpack compilation (it can resolve to "/" or the bundle root).
const MIGRATIONS_DIR = path.join(process.cwd(), "lib", "db-migrations");

function reconcileTemplateSlots(db: Database.Database): void {
  db.exec(`
    DELETE FROM template_slots
    WHERE template_id = 'air'
      AND slot_key = 'air_waybill'
      AND EXISTS (
        SELECT 1
        FROM template_slots existing
        WHERE existing.template_id = 'air'
          AND existing.slot_key = 'bill_of_lading'
      );

    UPDATE template_slots
    SET slot_key = 'bill_of_lading',
        display_name = 'Air Waybill (AWB)',
        is_required = 1,
        assigned_role = 'importer',
        sort_order = 3
    WHERE template_id = 'air'
      AND slot_key = 'air_waybill';

    INSERT OR IGNORE INTO template_slots
      (id, template_id, slot_key, display_name, is_required, assigned_role, sort_order)
    VALUES
      ('a3', 'air', 'bill_of_lading', 'Air Waybill (AWB)', 1, 'importer', 3);

    UPDATE template_slots
    SET display_name = 'Air Waybill (AWB)',
        is_required = 1,
        assigned_role = 'importer',
        sort_order = 3
    WHERE template_id = 'air'
      AND slot_key = 'bill_of_lading';
  `);
}

function reconcileCommitmentTracking(db: Database.Database): void {
  const cols = (db.prepare("PRAGMA table_info(shipment_files)").all() as Array<{ name: string }>).map(
    (col) => col.name
  );
  if (!cols.includes("on_chain_commitment_status")) return;

  db.exec(`
    UPDATE shipment_files
    SET on_chain_commitment_status = 'committed',
        on_chain_commitment_error = NULL
    WHERE on_chain_commitment_tx IS NOT NULL;

    UPDATE shipment_files
    SET on_chain_commitment_status = 'pending'
    WHERE on_chain_commitment_tx IS NULL
      AND on_chain_commitment_status = 'in_flight';
  `);
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  const applied = new Set<number>(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(
      (r) => r.version
    )
  );

  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of sqlFiles) {
    const version = parseInt(file.split("_")[0], 10);
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
  }

  reconcileTemplateSlots(db);
  reconcileCommitmentTracking(db);
}
