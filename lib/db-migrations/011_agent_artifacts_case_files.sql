CREATE TABLE IF NOT EXISTS agent_runs (
  id              TEXT PRIMARY KEY,
  shipment_id     TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  run_type        TEXT NOT NULL,
  status          TEXT NOT NULL,
  current_step    TEXT,
  risk_level      TEXT,
  started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  completed_at    TEXT,
  failure_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_shipment ON agent_runs(shipment_id, updated_at);

CREATE TABLE IF NOT EXISTS agent_steps (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  shipment_id       TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  agent_name        TEXT NOT NULL,
  step_name         TEXT NOT NULL,
  status            TEXT NOT NULL,
  message           TEXT,
  input_artifacts   TEXT NOT NULL DEFAULT '[]',
  output_artifacts  TEXT NOT NULL DEFAULT '[]',
  memory_reads      TEXT NOT NULL DEFAULT '[]',
  memory_writes     TEXT NOT NULL DEFAULT '[]',
  walrus_blob_ids   TEXT NOT NULL DEFAULT '[]',
  sui_tx_digests    TEXT NOT NULL DEFAULT '[]',
  started_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  completed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_agent_steps_shipment ON agent_steps(shipment_id, started_at);

CREATE TABLE IF NOT EXISTS shipment_artifacts (
  artifact_id                TEXT PRIMARY KEY,
  shipment_id                TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  type                       TEXT NOT NULL,
  label                      TEXT NOT NULL,
  status                     TEXT NOT NULL,
  local_path_or_id           TEXT,
  walrus_blob_id             TEXT,
  walrus_url                 TEXT,
  related_agent_run_id       TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  related_agent_step_id      TEXT REFERENCES agent_steps(id) ON DELETE SET NULL,
  related_memwal_namespace   TEXT,
  related_sui_tx_digest      TEXT,
  metadata_json              TEXT NOT NULL DEFAULT '{}',
  created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_shipment_artifacts_shipment ON shipment_artifacts(shipment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shipment_artifacts_type ON shipment_artifacts(shipment_id, type);

CREATE TABLE IF NOT EXISTS shipment_case_files (
  case_file_id           TEXT PRIMARY KEY,
  shipment_id            TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  exporter_key           TEXT,
  importer_key           TEXT,
  agent_run_id           TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  final_decision         TEXT NOT NULL,
  risk_level             TEXT NOT NULL,
  customs_readiness_score INTEGER NOT NULL,
  recommended_action     TEXT NOT NULL,
  artifact_json          TEXT NOT NULL,
  markdown               TEXT,
  walrus_json_blob_id    TEXT,
  walrus_markdown_blob_id TEXT,
  status                 TEXT NOT NULL DEFAULT 'local',
  failure_reason         TEXT,
  generated_at           TEXT NOT NULL,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_case_files_shipment ON shipment_case_files(shipment_id, generated_at);
