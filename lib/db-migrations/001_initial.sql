-- =========================================================
-- SCHEMA VERSION TRACKING
-- =========================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- =========================================================
-- USERS & SESSIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  wallet_address  TEXT UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- =========================================================
-- FILE DEDUP CACHE
-- =========================================================
CREATE TABLE IF NOT EXISTS file_cache (
  sha256              TEXT PRIMARY KEY,
  file_name           TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL,
  raw_pdf             BLOB,
  extraction_json     TEXT NOT NULL,
  haiku_input_tokens  INTEGER NOT NULL DEFAULT 0,
  haiku_output_tokens INTEGER NOT NULL DEFAULT 0,
  haiku_latency_ms    INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_hit_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- =========================================================
-- SHIPMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS shipments (
  id                       TEXT PRIMARY KEY,
  created_by               TEXT NOT NULL,
  workflow                 TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'Draft',
  importer_json            TEXT NOT NULL DEFAULT '{}',
  exporter_json            TEXT NOT NULL DEFAULT '{}',
  notify_party_json        TEXT,
  broker                   TEXT,
  freight_forwarder        TEXT,
  shipment_json            TEXT NOT NULL DEFAULT '{}',
  cargo_json               TEXT NOT NULL DEFAULT '{}',
  documents_json           TEXT NOT NULL DEFAULT '[]',
  invite_token             TEXT UNIQUE,
  extracted_ref            TEXT,
  extraction_status        TEXT DEFAULT 'idle',
  passport_id              TEXT,
  tx_digest                TEXT,
  memwal_space_id          TEXT,
  walrus_manifest_blob_id  TEXT,
  manifest_hash            TEXT,
  minted_at                TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_invite_token ON shipments(invite_token);

-- =========================================================
-- DOCUMENT FILES (per shipment, pre-mint)
-- =========================================================
CREATE TABLE IF NOT EXISTS shipment_files (
  id             TEXT PRIMARY KEY,
  shipment_id    TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  sha256         TEXT NOT NULL REFERENCES file_cache(sha256),
  doc_type       TEXT,
  file_name      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  is_final       INTEGER NOT NULL DEFAULT 0,
  walrus_blob_id TEXT,
  uploaded_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_shipment_files_shipment_id ON shipment_files(shipment_id);

-- =========================================================
-- EXTRACTION RUNS
-- =========================================================
CREATE TABLE IF NOT EXISTS extraction_runs (
  id              TEXT PRIMARY KEY,
  shipment_id     TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  file_sha256s    TEXT NOT NULL,
  aggregate_json  TEXT NOT NULL,
  is_superseded   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_shipment_id ON extraction_runs(shipment_id);

-- =========================================================
-- VALIDATION RUNS
-- =========================================================
CREATE TABLE IF NOT EXISTS validation_runs (
  id                  TEXT PRIMARY KEY,
  shipment_id         TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  issues_json         TEXT NOT NULL,
  overall_verdict     TEXT NOT NULL,
  verdict_reason      TEXT,
  input_manifest_json TEXT,
  token_count_in      INTEGER,
  token_count_out     INTEGER,
  is_superseded       INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_validation_runs_shipment_id ON validation_runs(shipment_id);

-- =========================================================
-- EMBEDDING CHUNKS
-- =========================================================
CREATE TABLE IF NOT EXISTS embedding_chunks (
  id          TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  sha256      TEXT NOT NULL,
  doc_type    TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text  TEXT NOT NULL,
  embedding   TEXT,
  field_tags  TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_embedding_chunks_shipment ON embedding_chunks(shipment_id);
CREATE INDEX IF NOT EXISTS idx_embedding_chunks_sha256   ON embedding_chunks(sha256);

-- =========================================================
-- MANIFEST CACHE (post-mint read-through from MemWal)
-- =========================================================
CREATE TABLE IF NOT EXISTS manifest_cache (
  shipment_id    TEXT PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
  manifest_json  TEXT NOT NULL,
  reasoning_json TEXT,
  fetched_from   TEXT NOT NULL DEFAULT 'memwal',
  stale_after    TEXT,
  cached_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- =========================================================
-- MOCK SUI TABLES
-- =========================================================
CREATE TABLE IF NOT EXISTS mock_sui_passports (
  passport_id      TEXT PRIMARY KEY,
  owner_address    TEXT NOT NULL,
  shipment_id      TEXT NOT NULL,
  memwal_space_id  TEXT NOT NULL,
  walrus_blob_ids  TEXT NOT NULL,
  manifest_hash    TEXT NOT NULL,
  metadata_json    TEXT NOT NULL DEFAULT '{}',
  minted_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  tx_digest        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mock_sui_grants (
  grant_id        TEXT PRIMARY KEY,
  passport_id     TEXT NOT NULL REFERENCES mock_sui_passports(passport_id) ON DELETE CASCADE,
  grantor_address TEXT NOT NULL,
  grantee_address TEXT NOT NULL,
  scope           TEXT NOT NULL,
  expires_at      TEXT,
  revoked_at      TEXT,
  tx_digest       TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_mock_sui_grants_passport ON mock_sui_grants(passport_id);
CREATE INDEX IF NOT EXISTS idx_mock_sui_grants_grantee  ON mock_sui_grants(grantee_address);

-- =========================================================
-- WALRUS BLOB REGISTRY
-- =========================================================
CREATE TABLE IF NOT EXISTS walrus_blobs (
  blob_id     TEXT PRIMARY KEY,
  shipment_id TEXT REFERENCES shipments(id),
  purpose     TEXT NOT NULL,
  file_name   TEXT,
  size_bytes  INTEGER NOT NULL,
  sha256      TEXT,
  end_epoch   INTEGER,
  publisher   TEXT NOT NULL,
  stored_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_walrus_blobs_shipment ON walrus_blobs(shipment_id);
