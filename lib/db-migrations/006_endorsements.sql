-- Mirror of on-chain endorsements for fast UI queries (on-chain is source of truth)
CREATE TABLE IF NOT EXISTS passport_endorsements (
  id             TEXT PRIMARY KEY,
  shipment_id    TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  passport_id    TEXT NOT NULL,
  log_object_id  TEXT NOT NULL,
  role           TEXT NOT NULL,
  signer_address TEXT NOT NULL,
  action         TEXT NOT NULL,
  note_hash      TEXT,
  signed_at_ms   INTEGER NOT NULL,
  tx_digest      TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_endorsements_shipment ON passport_endorsements(shipment_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_passport ON passport_endorsements(passport_id);
