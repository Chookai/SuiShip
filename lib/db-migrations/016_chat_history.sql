CREATE TABLE IF NOT EXISTS shipment_chats (
  id               TEXT PRIMARY KEY,
  shipment_id      TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,
  content          TEXT NOT NULL DEFAULT '',
  tool_name        TEXT,
  tool_input_json  TEXT,
  tool_result_json TEXT,
  is_error         INTEGER NOT NULL DEFAULT 0,
  agent_run_id     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_shipment_chats_shipment
  ON shipment_chats(shipment_id, created_at DESC);
