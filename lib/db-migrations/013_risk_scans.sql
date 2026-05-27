CREATE TABLE IF NOT EXISTS risk_scans (
  id                    TEXT PRIMARY KEY,
  shipment_id           TEXT NOT NULL,
  status                TEXT NOT NULL,
  findings_json         TEXT NOT NULL,
  source_messages_json  TEXT NOT NULL DEFAULT '[]',
  memwal_configured     INTEGER NOT NULL DEFAULT 0,
  serpapi_configured    INTEGER NOT NULL DEFAULT 0,
  error                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_risk_scans_shipment_created
  ON risk_scans(shipment_id, created_at DESC);
