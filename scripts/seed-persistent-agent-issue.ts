/**
 * Seed a dummy paused shipment on the Persistent Agent page whose cause the
 * agent has already identified.
 *
 * Writes a monitored shipment + a `pause_issue` AIS event + an active alert
 * (with a concrete likely cause + recommended action) into the same SQLite DB
 * the app reads from (data/suiship.db). The `/persistent-agent` page then shows
 * the amber "Issue Agent Analysis" panel instead of the green "No active issue"
 * banner.
 *
 * Run:  npx tsx scripts/seed-persistent-agent-issue.ts
 *       (or  npm run seed:pause-issue)
 *
 * Re-running is idempotent: prior event/alert rows for this simulation are
 * cleared before re-seeding so active alerts never stack.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/db";
import {
  ensureMonitoredShipment,
  recordPersistentAgentEvent,
  type PersistentAgentEvent,
} from "../lib/persistent-agent";

const SIMULATION_ID = "SS-EXP-771204";
const VESSEL_NAME = "MV SuiShip-771204";
const IMO = "IMO7712040";
const AIS_BASE_URL = process.env.AIS_BASE_URL ?? "http://localhost:8081";

function main() {
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Register the monitored shipment card (upserts on conflict).
  ensureMonitoredShipment(
    {
      simulationId: SIMULATION_ID,
      shipmentId: SIMULATION_ID,
      sourceUrl: `${AIS_BASE_URL}/mock/ais/simulations/${SIMULATION_ID}`,
      displayName: SIMULATION_ID,
    },
    db
  );

  // 2. Idempotency — clear any prior seeded event/alert rows for this sim.
  db.prepare("DELETE FROM persistent_agent_alerts WHERE simulation_id = ?").run(SIMULATION_ID);
  db.prepare("DELETE FROM persistent_agent_events WHERE simulation_id = ?").run(SIMULATION_ID);

  // 3. Record the latest AIS event as a pause_issue (also sets health -> ok).
  const rawPayload = {
    shipment_id: SIMULATION_ID,
    imo: IMO,
    vessel_name: VESSEL_NAME,
    origin: { name: "Singapore" },
    destination: { name: "Rotterdam" },
    current_position: { lat: 1.2306, lng: 103.851 },
    heading_deg: 295,
    progress_percent: 63,
    status: "pause_issue",
    elapsed_seconds: 21600,
    duration_seconds: 1209600,
    timestamp: now,
  };

  const event: PersistentAgentEvent = {
    simulationId: SIMULATION_ID,
    shipmentId: SIMULATION_ID,
    status: "pause_issue",
    actualLocationLabel: "Singapore Strait — Eastern Anchorage",
    latitude: 1.2306,
    longitude: 103.851,
    progressPercent: 63,
    rawPayload,
    observedAt: now,
  };
  const recorded = recordPersistentAgentEvent(event, db);

  // 4. Insert the active alert with the cause already found.
  db.prepare(
    `INSERT INTO persistent_agent_alerts
       (id, simulation_id, shipment_id, event_id, status, severity, summary,
        likely_cause, recommended_action, model, raw_response_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', 'warning', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    SIMULATION_ID,
    SIMULATION_ID,
    recorded.id ?? null,
    `AIS reports ${VESSEL_NAME} paused in the Singapore Strait Eastern Anchorage for ~6h.`,
    "Berth congestion at PSA Singapore — the vessel is holding at anchorage awaiting a berth window; terminal yard density and an upstream schedule slip pushed the assigned slot back.",
    "Confirm revised berth ETA with the carrier/PSA agent, notify the consignee of a ~1-day delay, and check whether the connecting feeder booking needs to be rerolled.",
    "claude-haiku-4-5-20251001",
    JSON.stringify({
      severity: "warning",
      detectedPattern: "anchorage-dwell-exceeds-threshold",
      confirmedVia: "PSA berth schedule cross-check",
    }),
    now,
    now
  );

  console.log(`Seeded paused shipment ${SIMULATION_ID} with an active "cause found" alert.`);
  console.log("Open /persistent-agent to see the amber Issue Agent Analysis panel.");
}

main();
