-- Add document state tracking and slot assignment to shipment_files.
-- Existing rows default to 'committed' (they already completed the pipeline).

ALTER TABLE shipment_files ADD COLUMN state TEXT NOT NULL DEFAULT 'committed';
ALTER TABLE shipment_files ADD COLUMN slot_key TEXT;
ALTER TABLE shipment_files ADD COLUMN uploaded_by_role TEXT NOT NULL DEFAULT 'initiator';
ALTER TABLE shipment_files ADD COLUMN on_chain_commitment_tx TEXT;
ALTER TABLE shipment_files ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_shipment_files_state ON shipment_files(shipment_id, state);
CREATE INDEX IF NOT EXISTS idx_shipment_files_slot  ON shipment_files(shipment_id, slot_key);
