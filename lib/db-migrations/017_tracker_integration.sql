-- Add tracking_number to link a monitored shipment row with the mock freight tracker
ALTER TABLE persistent_agent_monitored_shipments ADD COLUMN tracking_number TEXT;

-- Store failed tracker registrations so the persistent agent can retry them
CREATE TABLE IF NOT EXISTS tracking_failures (
  id            TEXT PRIMARY KEY,
  shipment_id   TEXT NOT NULL,
  role          TEXT NOT NULL,
  action        TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error    TEXT,
  resolved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tracking_failures_unresolved
  ON tracking_failures(resolved_at, attempt_count)
  WHERE resolved_at IS NULL;
