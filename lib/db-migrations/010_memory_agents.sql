ALTER TABLE validation_findings ADD COLUMN finding_type TEXT NOT NULL DEFAULT 'consistency';

CREATE INDEX IF NOT EXISTS idx_findings_type ON validation_findings(shipment_id, finding_type, status);
