CREATE TABLE IF NOT EXISTS progress_manifests (
  id               TEXT PRIMARY KEY,
  shipment_id      TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  sequence         INTEGER NOT NULL,
  stage            TEXT NOT NULL,
  actor            TEXT NOT NULL,
  summary          TEXT NOT NULL,
  manifest_json    TEXT NOT NULL,
  memwal_blob_id   TEXT,
  memwal_namespace TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'stored',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_progress_manifests_shipment
  ON progress_manifests(shipment_id, sequence);
