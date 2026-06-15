-- Shipment templates with pre-seeded standard trade lanes.
-- template_slots defines which document slots each template requires and who uploads them.

CREATE TABLE IF NOT EXISTS shipment_templates (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  description    TEXT,
  incoterms      TEXT,
  transport_mode TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS template_slots (
  id            TEXT PRIMARY KEY,
  template_id   TEXT NOT NULL REFERENCES shipment_templates(id) ON DELETE CASCADE,
  slot_key      TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  is_required   INTEGER NOT NULL DEFAULT 1,
  assigned_role TEXT NOT NULL DEFAULT 'any',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(template_id, slot_key)
);
CREATE INDEX IF NOT EXISTS idx_template_slots_tid ON template_slots(template_id);

-- Seed: Sea Freight FOB
INSERT OR IGNORE INTO shipment_templates VALUES
  ('sea-fob','Sea Freight – FOB','Standard ocean freight, Free On Board','FOB','sea',strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('sea-cif','Sea Freight – CIF','Ocean freight, Cost Insurance Freight','CIF','sea',strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('air',    'Air Freight',      'Air cargo express shipments','EXW','air',strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR IGNORE INTO template_slots VALUES
  ('sf1','sea-fob','commercial_invoice',   'Commercial Invoice',   1,'exporter',1),
  ('sf2','sea-fob','packing_list',         'Packing List',         1,'exporter',2),
  ('sf3','sea-fob','bill_of_lading',       'Bill of Lading',       1,'importer',3),
  ('sf4','sea-fob','certificate_of_origin','Certificate of Origin',1,'exporter',4),
  ('sc1','sea-cif','commercial_invoice',   'Commercial Invoice',   1,'exporter',1),
  ('sc2','sea-cif','packing_list',         'Packing List',         1,'exporter',2),
  ('sc3','sea-cif','bill_of_lading',       'Bill of Lading',       1,'importer',3),
  ('sc4','sea-cif','certificate_of_origin','Certificate of Origin',1,'exporter',4),
  ('a1', 'air',    'commercial_invoice',   'Commercial Invoice',   1,'exporter',1),
  ('a2', 'air',    'packing_list',         'Packing List',         1,'exporter',2),
  ('a3', 'air',    'bill_of_lading',       'Air Waybill (AWB)',    1,'importer',3),
  ('a4', 'air',    'certificate_of_origin','Certificate of Origin',0,'exporter',4);

-- Add template + on-chain columns to shipments
ALTER TABLE shipments ADD COLUMN template_id TEXT REFERENCES shipment_templates(id);
ALTER TABLE shipments ADD COLUMN on_chain_record_id TEXT;
ALTER TABLE shipments ADD COLUMN on_chain_accumulator_id TEXT;
ALTER TABLE shipments ADD COLUMN doc_set_hash TEXT;
