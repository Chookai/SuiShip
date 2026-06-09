CREATE TABLE IF NOT EXISTS persistent_agent_monitored_shipments (
  simulation_id      TEXT PRIMARY KEY,
  shipment_id        TEXT NOT NULL,
  source_url         TEXT NOT NULL,
  display_name       TEXT,
  last_check_status  TEXT,
  last_check_error   TEXT,
  last_checked_at    TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS persistent_agent_events (
  id                     TEXT PRIMARY KEY,
  simulation_id          TEXT NOT NULL,
  shipment_id            TEXT NOT NULL,
  status                 TEXT NOT NULL,
  actual_location_label  TEXT NOT NULL,
  latitude               REAL,
  longitude              REAL,
  progress_percent       REAL NOT NULL DEFAULT 0,
  raw_payload_json       TEXT NOT NULL,
  observed_at            TEXT NOT NULL,
  received_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (simulation_id) REFERENCES persistent_agent_monitored_shipments(simulation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_persistent_agent_events_latest
  ON persistent_agent_events(simulation_id, observed_at DESC, received_at DESC);

CREATE TABLE IF NOT EXISTS persistent_agent_alerts (
  id                  TEXT PRIMARY KEY,
  simulation_id       TEXT NOT NULL,
  shipment_id         TEXT NOT NULL,
  event_id            TEXT,
  status              TEXT NOT NULL,
  severity            TEXT NOT NULL,
  summary             TEXT NOT NULL,
  likely_cause        TEXT NOT NULL,
  recommended_action  TEXT NOT NULL,
  model               TEXT NOT NULL,
  raw_response_json   TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (simulation_id) REFERENCES persistent_agent_monitored_shipments(simulation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_persistent_agent_alerts_latest
  ON persistent_agent_alerts(simulation_id, status, updated_at DESC);
