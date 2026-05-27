import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../lib/db-migrations";
import {
  DEFAULT_MONITORED_SIMULATION,
  analyzePersistentAgentIssue,
  listPersistentAgentShipments,
  normalizeAisSimulationPayload,
  recordPersistentAgentEvent,
} from "../../lib/persistent-agent";

function makeTestDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

describe("persistent agent AIS normalization", () => {
  it("handles explicit pause_issue status and preserves raw payload", () => {
    const raw = {
      simulation_id: "SF-2026-LIVE",
      shipment_id: "SF-2026-LIVE",
      status: "pause_issue",
      vessel: { lat: 37.78, lon: -122.39, location: "San Francisco Bay" },
      progress_percent: 58,
      observed_at: "2026-05-28T03:00:00.000Z",
    };

    const event = normalizeAisSimulationPayload(raw, DEFAULT_MONITORED_SIMULATION);

    expect(event).toEqual(
      expect.objectContaining({
        simulationId: "SF-2026-LIVE",
        shipmentId: "SF-2026-LIVE",
        status: "pause_issue",
        actualLocationLabel: "San Francisco Bay",
        latitude: 37.78,
        longitude: -122.39,
        progressPercent: 58,
        observedAt: "2026-05-28T03:00:00.000Z",
        rawPayload: raw,
      })
    );
  });

  it("tolerates missing coordinates and derives a readable location", () => {
    const event = normalizeAisSimulationPayload(
      {
        simulationId: "SF-2026-LIVE",
        status: "in_transit",
        port: "Port of Oakland",
        progress: 22,
      },
      DEFAULT_MONITORED_SIMULATION
    );

    expect(event.latitude).toBeNull();
    expect(event.longitude).toBeNull();
    expect(event.actualLocationLabel).toBe("Port of Oakland");
    expect(event.progressPercent).toBe(22);
  });

  it("reads live mock current_position coordinates", () => {
    const event = normalizeAisSimulationPayload(
      {
        shipment_id: "SF-2026-LIVE",
        status: "underway",
        current_position: { lat: 3.3972, lng: 89.236 },
        progress_percent: 7,
      },
      DEFAULT_MONITORED_SIMULATION
    );

    expect(event.latitude).toBe(3.3972);
    expect(event.longitude).toBe(89.236);
    expect(event.actualLocationLabel).toBe("3.3972, 89.2360");
  });
});

describe("persistent agent issue handling", () => {
  it("creates an active alert for pause_issue events", async () => {
    const db = makeTestDb();
    const event = normalizeAisSimulationPayload(
      { status: "pause_issue", location: "Anchored outside terminal" },
      DEFAULT_MONITORED_SIMULATION
    );

    const alert = await analyzePersistentAgentIssue(event, db, {
      now: "2026-05-28T04:00:00.000Z",
      useAi: false,
    });

    expect(alert).toEqual(
      expect.objectContaining({
        simulationId: "SF-2026-LIVE",
        shipmentId: "SF-2026-LIVE",
        status: "active",
        severity: "warning",
      })
    );
    expect(alert?.summary).toContain("pause_issue");
    expect(alert?.recommendedAction).toContain("carrier");
  });

  it("does not create an active alert for non-issue events", async () => {
    const db = makeTestDb();
    const event = normalizeAisSimulationPayload(
      { status: "in_transit", location: "Pacific lane" },
      DEFAULT_MONITORED_SIMULATION
    );

    await recordPersistentAgentEvent(event, db);
    const alert = await analyzePersistentAgentIssue(event, db, { useAi: false });
    const rows = listPersistentAgentShipments(db);

    expect(alert).toBeNull();
    expect(rows[0].latestAlert).toBeNull();
    expect(rows[0].latestEvent?.status).toBe("in_transit");
  });

  it("returns multiple monitored shipments as separate tracker rows", () => {
    const db = makeTestDb();

    recordPersistentAgentEvent(
      normalizeAisSimulationPayload(
        { simulationId: "SF-2026-LIVE", status: "in_transit", progress: 44 },
        DEFAULT_MONITORED_SIMULATION
      ),
      db
    );
    recordPersistentAgentEvent(
      normalizeAisSimulationPayload(
        { simulationId: "SS-DEMO-002", shipmentId: "SS-DEMO-002", status: "pause_issue", progress: 12 },
        {
          simulationId: "SS-DEMO-002",
          shipmentId: "SS-DEMO-002",
          sourceUrl: "http://localhost:8081/mock/ais/simulations/SS-DEMO-002",
        }
      ),
      db
    );

    const rows = listPersistentAgentShipments(db);

    expect(rows.map((row) => row.simulationId)).toEqual(["SF-2026-LIVE", "SS-DEMO-002"]);
    expect(rows[0].latestEvent?.progressPercent).toBe(44);
    expect(rows[1].latestEvent?.status).toBe("pause_issue");
  });

  it("ingests webhook payloads and stores the resulting alert", async () => {
    const db = makeTestDb();
    const { event, alert } = await import("../../lib/persistent-agent").then((mod) =>
      mod.ingestPersistentAgentWebhook(
        {
          simulation_id: "SF-2026-LIVE",
          shipment_id: "SF-2026-LIVE",
          status: "pause_issue",
          location: "Pier 80 hold area",
        },
        db
      )
    );

    expect(event.status).toBe("pause_issue");
    expect(alert?.status).toBe("active");
    expect(listPersistentAgentShipments(db)[0].latestAlert?.summary).toContain("SF-2026-LIVE");
  });

  it("records health errors when an AIS check cannot reach the source", async () => {
    const db = makeTestDb();
    const { checkPersistentAgentShipment } = await import("../../lib/persistent-agent");

    const result = await checkPersistentAgentShipment({
      simulationId: "SS-OFFLINE",
      shipmentId: "SS-OFFLINE",
      sourceUrl: "http://127.0.0.1:9/mock/ais/simulations/SS-OFFLINE",
    }, db);

    const row = listPersistentAgentShipments(db).find((item) => item.simulationId === "SS-OFFLINE");
    expect(result.error).toBeTruthy();
    expect(row?.lastCheckStatus).toBe("error");
    expect(row?.lastCheckError).toBeTruthy();
  });
});
