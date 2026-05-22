ALTER TABLE shipment_files ADD COLUMN on_chain_commitment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE shipment_files ADD COLUMN on_chain_commitment_error TEXT;
