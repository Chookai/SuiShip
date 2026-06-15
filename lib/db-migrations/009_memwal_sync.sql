-- Track background MemWal sync state so mint can return before MemWal finishes.
ALTER TABLE shipments ADD COLUMN memwal_manifest_blob_id TEXT;
ALTER TABLE shipments ADD COLUMN memwal_summary_blob_id TEXT;
ALTER TABLE shipments ADD COLUMN memwal_sync_status TEXT;
ALTER TABLE shipments ADD COLUMN memwal_sync_error TEXT;
ALTER TABLE shipments ADD COLUMN memwal_synced_at TEXT;
