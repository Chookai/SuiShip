import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { registerShipmentForTracking } from "./client";
import { ensureMonitoredShipment } from "@/lib/persistent-agent";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 10;

type FailureRow = {
  id: string;
  shipment_id: string;
  role: string;
  action: string;
  attempt_count: number;
  last_error: string | null;
};

/**
 * Retry tracker registrations that failed when the FF picked_up endorsement
 * was processed. Called at the end of each persistent-agent poll cycle.
 *
 * For each unresolved failure (attempt_count < MAX_ATTEMPTS):
 * - On success: insert/update monitored_shipments row, mark failure resolved.
 * - On failure: increment attempt_count, record latest error.
 */
export async function retryFailedRegistrations(): Promise<void> {
  const db = getDb();

  let failures: FailureRow[];
  try {
    failures = db.prepare(`
      SELECT id, shipment_id, role, action, attempt_count, last_error
      FROM tracking_failures
      WHERE resolved_at IS NULL AND attempt_count < ?
      ORDER BY updated_at ASC
      LIMIT ?
    `).all(MAX_ATTEMPTS, BATCH_SIZE) as FailureRow[];
  } catch {
    // Table may not exist yet if migration hasn't run — skip silently
    return;
  }

  if (failures.length === 0) return;

  const aisBase = process.env.AIS_BASE_URL ?? "http://localhost:8081";

  for (const failure of failures) {
    const { freight, ais } = await registerShipmentForTracking({
      shipmentId: failure.shipment_id,
      origin: "Singapore",
      destination: "Los Angeles",
    });

    if (freight.ok) {
      // Insert / update the monitored shipments row
      ensureMonitoredShipment({
        simulationId: failure.shipment_id,
        shipmentId: failure.shipment_id,
        sourceUrl: `${aisBase}/mock/ais/simulations/${failure.shipment_id}`,
        displayName: failure.shipment_id,
      }, db);

      // Stamp tracking_number separately (ensureMonitoredShipment doesn't know about it)
      try {
        db.prepare(`
          UPDATE persistent_agent_monitored_shipments
          SET tracking_number = ?, last_check_status = 'monitoring',
              updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE simulation_id = ?
        `).run(freight.trackingNumber, failure.shipment_id);
      } catch {
        // Column may not exist yet in tests — safe to ignore
      }

      db.prepare(`
        UPDATE tracking_failures
        SET resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            updated_at  = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).run(failure.id);

      console.log(
        `[tracker-retry] Resolved failure ${failure.id} for shipment ${failure.shipment_id}` +
          ` → tracking ${freight.trackingNumber}, AIS ${ais.ok ? "started" : "failed"}`
      );
    } else {
      db.prepare(`
        UPDATE tracking_failures
        SET attempt_count = attempt_count + 1,
            last_error    = ?,
            updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).run(freight.error, failure.id);

      console.warn(
        `[tracker-retry] Retry ${failure.attempt_count + 1}/${MAX_ATTEMPTS} failed for ${failure.shipment_id}: ${freight.error}`
      );
    }
  }
}

/**
 * Log a new tracker registration failure to the tracking_failures table.
 * Safe to call even if the table doesn't exist yet (errors are swallowed).
 */
export function logTrackerFailure(params: {
  shipmentId: string;
  role: string;
  action: string;
  error: string;
}): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR IGNORE INTO tracking_failures (id, shipment_id, role, action, last_error)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), params.shipmentId, params.role, params.action, params.error);
  } catch {
    // best-effort
  }
}
