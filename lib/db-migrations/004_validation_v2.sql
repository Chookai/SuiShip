-- Add doc_set_hash and model tracking to validation_runs.
-- Add structured validation_findings table (replaces issues_json for new runs).

ALTER TABLE validation_runs ADD COLUMN doc_set_hash TEXT;
ALTER TABLE validation_runs ADD COLUMN model TEXT DEFAULT 'claude-haiku-4-5';

CREATE TABLE IF NOT EXISTS validation_findings (
  id                    TEXT PRIMARY KEY,
  validation_run_id     TEXT NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  shipment_id           TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  severity              TEXT NOT NULL,
  field_path            TEXT NOT NULL,
  message               TEXT NOT NULL,
  affected_doc_ids_json TEXT NOT NULL DEFAULT '[]',
  values_json           TEXT NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'unresolved',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_findings_shipment ON validation_findings(shipment_id, status);
CREATE INDEX IF NOT EXISTS idx_findings_run      ON validation_findings(validation_run_id);
