import { getDb } from "./db";

export type OnChainCommitmentStatus = "pending" | "in_flight" | "committed" | "failed";

export function markShipmentFileCommitmentPending(fileId: string): void {
  getDb().prepare(`
    UPDATE shipment_files
    SET on_chain_commitment_status = 'pending',
        on_chain_commitment_error = NULL
    WHERE id = ?
  `).run(fileId);
}

export function markShipmentFileCommitmentInFlight(fileId: string): void {
  getDb().prepare(`
    UPDATE shipment_files
    SET on_chain_commitment_status = 'in_flight',
        on_chain_commitment_error = NULL
    WHERE id = ?
  `).run(fileId);
}

export function markShipmentFileCommitmentCommitted(fileId: string, txDigest: string): void {
  getDb().prepare(`
    UPDATE shipment_files
    SET on_chain_commitment_tx = ?,
        on_chain_commitment_status = 'committed',
        on_chain_commitment_error = NULL
    WHERE id = ?
  `).run(txDigest, fileId);
}

export function markShipmentFileCommitmentFailed(fileId: string, error: string): void {
  getDb().prepare(`
    UPDATE shipment_files
    SET on_chain_commitment_status = 'failed',
        on_chain_commitment_error = ?,
        on_chain_commitment_tx = NULL
    WHERE id = ?
  `).run(error, fileId);
}
