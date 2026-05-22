-- SEAL encryption references and on-chain endorsement log object ID per shipment
-- Note: SQLite does not support IF NOT EXISTS on ALTER TABLE.
-- The migration runner (index.ts) skips already-applied versions so each ALTER runs at most once.
ALTER TABLE shipments ADD COLUMN seal_object_id TEXT;
ALTER TABLE shipments ADD COLUMN encrypted_walrus_blob_id TEXT;
ALTER TABLE shipments ADD COLUMN endorsement_log_object_id TEXT;
