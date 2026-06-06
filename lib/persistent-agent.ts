import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type Database from "better-sqlite3";
import { getDb } from "./db";

export type MonitoredShipmentConfig = {
  simulationId: string;
  shipmentId: string;
  sourceUrl: string;
  displayName?: string | null;
};

export type PersistentAgentEvent = {
  id?: string;
  simulationId: string;
  shipmentId: string;
  status: string;
  actualLocationLabel: string;
  latitude: number | null;
  longitude: number | null;
  progressPercent: number;
  rawPayload: unknown;
  observedAt: string;
  receivedAt?: string;
};

export type PersistentAgentAlert = {
  id: string;
  simulationId: string;
  shipmentId: string;
  eventId?: string | null;
  status: "active" | "resolved";
  severity: "critical" | "warning" | "info";
  summary: string;
  likelyCause: string;
  recommendedAction: string;
  model: string;
  rawResponse?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PersistentAgentShipmentRow = MonitoredShipmentConfig & {
  lastCheckStatus: string | null;
  lastCheckError: string | null;
  lastCheckedAt: string | null;
  latestEvent: PersistentAgentEvent | null;
  latestAlert: PersistentAgentAlert | null;
};

export const DEFAULT_MONITORED_SIMULATION: MonitoredShipmentConfig = {
  simulationId: "SF-2026-LIVE",
  shipmentId: "SF-2026-LIVE",
  sourceUrl: `${process.env.AIS_BASE_URL ?? "http://localhost:8081"}/mock/ais/simulations/SF-2026-LIVE`,
  displayName: "SF-2026-LIVE",
};

type IssueOptions = {
  now?: string;
  useAi?: boolean;
};

type IssueDraft = {
  severity: PersistentAgentAlert["severity"];
  summary: string;
  likelyCause: string;
  recommendedAction: string;
  model: string;
  rawResponse?: unknown;
};

type MonitorRow = {
  simulation_id: string;
  shipment_id: string;
  source_url: string;
  display_name: string | null;
  last_check_status: string | null;
  last_check_error: string | null;
  last_checked_at: string | null;
};

type EventRow = {
  id: string;
  simulation_id: string;
  shipment_id: string;
  status: string;
  actual_location_label: string;
  latitude: number | null;
  longitude: number | null;
  progress_percent: number;
  raw_payload_json: string;
  observed_at: string;
  received_at: string;
};

type AlertRow = {
  id: string;
  simulation_id: string;
  shipment_id: string;
  event_id: string | null;
  status: "active" | "resolved";
  severity: "critical" | "warning" | "info";
  summary: string;
  likely_cause: string;
  recommended_action: string;
  model: string;
  raw_response_json: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeAisSimulationPayload(
  payload: unknown,
  config: MonitoredShipmentConfig = DEFAULT_MONITORED_SIMULATION
): PersistentAgentEvent {
  const simulationId = firstString(
    readPath(payload, ["simulationId"]),
    readPath(payload, ["simulation_id"]),
    readPath(payload, ["id"]),
    readPath(payload, ["simulation", "id"]),
    config.simulationId
  )!;
  const shipmentId = firstString(
    readPath(payload, ["shipmentId"]),
    readPath(payload, ["shipment_id"]),
    readPath(payload, ["shipment", "id"]),
    simulationId,
    config.shipmentId
  )!;
  const status = firstString(
    readPath(payload, ["status"]),
    readPath(payload, ["state"]),
    readPath(payload, ["shipment", "status"]),
    "unknown"
  )!.toLowerCase();
  const latitude = firstNumber(
    readPath(payload, ["latitude"]),
    readPath(payload, ["lat"]),
    readPath(payload, ["position", "latitude"]),
    readPath(payload, ["position", "lat"]),
    readPath(payload, ["vessel", "latitude"]),
    readPath(payload, ["vessel", "lat"]),
    readPath(payload, ["ais", "latitude"]),
    readPath(payload, ["ais", "lat"]),
    readPath(payload, ["current_position", "latitude"]),
    readPath(payload, ["current_position", "lat"])
  );
  const longitude = firstNumber(
    readPath(payload, ["longitude"]),
    readPath(payload, ["lng"]),
    readPath(payload, ["lon"]),
    readPath(payload, ["position", "longitude"]),
    readPath(payload, ["position", "lng"]),
    readPath(payload, ["position", "lon"]),
    readPath(payload, ["vessel", "longitude"]),
    readPath(payload, ["vessel", "lng"]),
    readPath(payload, ["vessel", "lon"]),
    readPath(payload, ["ais", "longitude"]),
    readPath(payload, ["ais", "lng"]),
    readPath(payload, ["ais", "lon"]),
    readPath(payload, ["current_position", "longitude"]),
    readPath(payload, ["current_position", "lng"]),
    readPath(payload, ["current_position", "lon"])
  );
  const progressRaw = firstNumber(
    readPath(payload, ["progressPercent"]),
    readPath(payload, ["progress_percent"]),
    readPath(payload, ["progress"]),
    readPath(payload, ["route", "progressPercent"]),
    readPath(payload, ["route", "progress_percent"])
  );
  const progressPercent = clampProgress(progressRaw);
  const actualLocationLabel = firstString(
    readPath(payload, ["actualLocationLabel"]),
    readPath(payload, ["actual_location_label"]),
    readPath(payload, ["location"]),
    readPath(payload, ["current_location"]),
    readPath(payload, ["port"]),
    readPath(payload, ["position", "label"]),
    readPath(payload, ["vessel", "location"]),
    readPath(payload, ["ais", "location"]),
    readPath(payload, ["current_position", "label"])
  ) ?? formatCoordinateLabel(latitude, longitude) ?? "Unknown location";
  const observedAt = firstString(
    readPath(payload, ["observedAt"]),
    readPath(payload, ["observed_at"]),
    readPath(payload, ["timestamp"]),
    readPath(payload, ["updatedAt"]),
    readPath(payload, ["updated_at"])
  ) ?? new Date().toISOString();

  return {
    simulationId,
    shipmentId,
    status,
    actualLocationLabel,
    latitude,
    longitude,
    progressPercent,
    rawPayload: payload,
    observedAt,
  };
}

export function recordPersistentAgentEvent(
  event: PersistentAgentEvent,
  db: Database.Database = getDb()
): PersistentAgentEvent {
  ensureMonitoredShipment({
    simulationId: event.simulationId,
    shipmentId: event.shipmentId,
    sourceUrl: event.simulationId === DEFAULT_MONITORED_SIMULATION.simulationId
      ? DEFAULT_MONITORED_SIMULATION.sourceUrl
      : `${process.env.AIS_BASE_URL ?? "http://localhost:8081"}/mock/ais/simulations/${event.simulationId}`,
    displayName: event.simulationId,
  }, db);
  const id = event.id ?? randomUUID();
  const receivedAt = event.receivedAt ?? new Date().toISOString();
  db.prepare(`
    INSERT INTO persistent_agent_events
      (id, simulation_id, shipment_id, status, actual_location_label, latitude,
       longitude, progress_percent, raw_payload_json, observed_at, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    event.simulationId,
    event.shipmentId,
    event.status,
    event.actualLocationLabel,
    event.latitude,
    event.longitude,
    event.progressPercent,
    JSON.stringify(event.rawPayload),
    event.observedAt,
    receivedAt
  );
  updatePersistentAgentHealth(event.simulationId, {
    status: "ok",
    error: null,
    checkedAt: receivedAt,
  }, db);
  return { ...event, id, receivedAt };
}

export async function analyzePersistentAgentIssue(
  event: PersistentAgentEvent,
  db: Database.Database = getDb(),
  options: IssueOptions = {}
): Promise<PersistentAgentAlert | null> {
  if (event.status !== "paused_issue") return null;

  const now = options.now ?? new Date().toISOString();
  const draft = options.useAi === false || !process.env.ANTHROPIC_API_KEY
    ? fallbackIssueAnalysis(event)
    : await aiIssueAnalysis(event);
  const existing = db.prepare(`
    SELECT * FROM persistent_agent_alerts
    WHERE simulation_id = ? AND status = 'active'
    ORDER BY updated_at DESC LIMIT 1
  `).get(event.simulationId) as AlertRow | undefined;

  if (existing) {
    db.prepare(`
      UPDATE persistent_agent_alerts SET
        shipment_id = ?,
        event_id = ?,
        severity = ?,
        summary = ?,
        likely_cause = ?,
        recommended_action = ?,
        model = ?,
        raw_response_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      event.shipmentId,
      event.id ?? null,
      draft.severity,
      draft.summary,
      draft.likelyCause,
      draft.recommendedAction,
      draft.model,
      draft.rawResponse ? JSON.stringify(draft.rawResponse) : null,
      now,
      existing.id
    );
    return getPersistentAgentAlert(existing.id, db);
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO persistent_agent_alerts
      (id, simulation_id, shipment_id, event_id, status, severity, summary,
       likely_cause, recommended_action, model, raw_response_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    event.simulationId,
    event.shipmentId,
    event.id ?? null,
    draft.severity,
    draft.summary,
    draft.likelyCause,
    draft.recommendedAction,
    draft.model,
    draft.rawResponse ? JSON.stringify(draft.rawResponse) : null,
    now,
    now
  );
  return getPersistentAgentAlert(id, db);
}

export function listPersistentAgentShipments(
  db: Database.Database = getDb()
): PersistentAgentShipmentRow[] {
  ensureMonitoredShipment(DEFAULT_MONITORED_SIMULATION, db);
  const monitors = db.prepare(`
    SELECT * FROM persistent_agent_monitored_shipments
    ORDER BY created_at ASC, simulation_id ASC
  `).all() as MonitorRow[];

  return monitors.map((monitor) => ({
    simulationId: monitor.simulation_id,
    shipmentId: monitor.shipment_id,
    sourceUrl: monitor.source_url,
    displayName: monitor.display_name,
    lastCheckStatus: monitor.last_check_status,
    lastCheckError: monitor.last_check_error,
    lastCheckedAt: monitor.last_checked_at,
    latestEvent: latestEvent(monitor.simulation_id, db),
    latestAlert: latestAlert(monitor.simulation_id, db),
  }));
}

export async function checkPersistentAgentShipment(
  config: MonitoredShipmentConfig,
  db: Database.Database = getDb()
): Promise<{ event: PersistentAgentEvent | null; alert: PersistentAgentAlert | null; error?: string }> {
  ensureMonitoredShipment(config, db);
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(config.sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`AIS simulation returned HTTP ${response.status}`);
    const payload = await response.json();
    const event = recordPersistentAgentEvent(normalizeAisSimulationPayload(payload, config), db);
    const alert = await analyzePersistentAgentIssue(event, db);
    return { event, alert };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    updatePersistentAgentHealth(config.simulationId, { status: "error", error, checkedAt }, db);
    return { event: null, alert: null, error };
  }
}

export async function checkAllPersistentAgentShipments(
  db: Database.Database = getDb()
): Promise<Array<{ simulationId: string; event: PersistentAgentEvent | null; alert: PersistentAgentAlert | null; error?: string }>> {
  const rows = listPersistentAgentShipments(db);
  const results = [];
  for (const row of rows) {
    const result = await checkPersistentAgentShipment(row, db);
    results.push({ simulationId: row.simulationId, ...result });
  }

  // Retry any tracker registrations that failed during FF picked_up endorsements
  void import("./tracker-api/retry").then(({ retryFailedRegistrations }) =>
    retryFailedRegistrations().catch((err) =>
      console.warn("[persistent-agent] retryFailedRegistrations error:", err)
    )
  );

  return results;
}

export async function ingestPersistentAgentWebhook(
  payload: unknown,
  db: Database.Database = getDb()
): Promise<{ event: PersistentAgentEvent; alert: PersistentAgentAlert | null }> {
  const simulationId = firstString(
    readPath(payload, ["simulationId"]),
    readPath(payload, ["simulation_id"]),
    readPath(payload, ["id"])
  );
  const config = simulationId ? getMonitoredShipment(simulationId, db) ?? {
    simulationId,
    shipmentId: firstString(readPath(payload, ["shipmentId"]), readPath(payload, ["shipment_id"]), simulationId) ?? simulationId,
    sourceUrl: `${process.env.AIS_BASE_URL ?? "http://localhost:8081"}/mock/ais/simulations/${simulationId}`,
    displayName: simulationId,
  } : DEFAULT_MONITORED_SIMULATION;
  const event = recordPersistentAgentEvent(normalizeAisSimulationPayload(payload, config), db);
  const alert = await analyzePersistentAgentIssue(event, db);
  return { event, alert };
}

export function ensureMonitoredShipment(
  config: MonitoredShipmentConfig,
  db: Database.Database = getDb()
): void {
  db.prepare(`
    INSERT INTO persistent_agent_monitored_shipments
      (simulation_id, shipment_id, source_url, display_name, last_check_status)
    VALUES (?, ?, ?, ?, 'pending')
    ON CONFLICT(simulation_id) DO UPDATE SET
      shipment_id = excluded.shipment_id,
      source_url = excluded.source_url,
      display_name = COALESCE(excluded.display_name, persistent_agent_monitored_shipments.display_name),
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  `).run(config.simulationId, config.shipmentId, config.sourceUrl, config.displayName ?? config.simulationId);
}

export function updatePersistentAgentHealth(
  simulationId: string,
  input: { status: string; error: string | null; checkedAt: string },
  db: Database.Database = getDb()
): void {
  db.prepare(`
    UPDATE persistent_agent_monitored_shipments
    SET last_check_status = ?,
        last_check_error = ?,
        last_checked_at = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE simulation_id = ?
  `).run(input.status, input.error, input.checkedAt, simulationId);
}

function getMonitoredShipment(simulationId: string, db: Database.Database): MonitoredShipmentConfig | null {
  const row = db.prepare(`
    SELECT simulation_id, shipment_id, source_url, display_name
    FROM persistent_agent_monitored_shipments
    WHERE simulation_id = ?
  `).get(simulationId) as Pick<MonitorRow, "simulation_id" | "shipment_id" | "source_url" | "display_name"> | undefined;
  return row ? {
    simulationId: row.simulation_id,
    shipmentId: row.shipment_id,
    sourceUrl: row.source_url,
    displayName: row.display_name,
  } : null;
}

function latestEvent(simulationId: string, db: Database.Database): PersistentAgentEvent | null {
  const row = db.prepare(`
    SELECT * FROM persistent_agent_events
    WHERE simulation_id = ?
    ORDER BY observed_at DESC, received_at DESC LIMIT 1
  `).get(simulationId) as EventRow | undefined;
  return row ? rowToEvent(row) : null;
}

function latestAlert(simulationId: string, db: Database.Database): PersistentAgentAlert | null {
  const row = db.prepare(`
    SELECT * FROM persistent_agent_alerts
    WHERE simulation_id = ? AND status = 'active'
    ORDER BY updated_at DESC LIMIT 1
  `).get(simulationId) as AlertRow | undefined;
  return row ? rowToAlert(row) : null;
}

function getPersistentAgentAlert(id: string, db: Database.Database): PersistentAgentAlert {
  const row = db.prepare("SELECT * FROM persistent_agent_alerts WHERE id = ?").get(id) as AlertRow;
  return rowToAlert(row);
}

function rowToEvent(row: EventRow): PersistentAgentEvent {
  return {
    id: row.id,
    simulationId: row.simulation_id,
    shipmentId: row.shipment_id,
    status: row.status,
    actualLocationLabel: row.actual_location_label,
    latitude: row.latitude,
    longitude: row.longitude,
    progressPercent: row.progress_percent,
    rawPayload: JSON.parse(row.raw_payload_json),
    observedAt: row.observed_at,
    receivedAt: row.received_at,
  };
}

function rowToAlert(row: AlertRow): PersistentAgentAlert {
  return {
    id: row.id,
    simulationId: row.simulation_id,
    shipmentId: row.shipment_id,
    eventId: row.event_id,
    status: row.status,
    severity: row.severity,
    summary: row.summary,
    likelyCause: row.likely_cause,
    recommendedAction: row.recommended_action,
    model: row.model,
    rawResponse: row.raw_response_json ? JSON.parse(row.raw_response_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fallbackIssueAnalysis(event: PersistentAgentEvent): IssueDraft {
  return {
    severity: "warning" as const,
    summary: `AIS simulation ${event.simulationId} reported pause_issue at ${event.actualLocationLabel}.`,
    likelyCause: "The shipment appears paused in the live tracker and needs carrier or operations review.",
    recommendedAction: "Contact the carrier or freight operations owner to confirm the pause reason, revised ETA, and whether customer notification is required.",
    model: "deterministic-fallback",
  };
}

async function aiIssueAnalysis(event: PersistentAgentEvent): Promise<IssueDraft> {
  const model = "claude-haiku-4-5-20251001";
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model,
      max_tokens: 700,
      system: "You are SuiShip's persistent shipment monitoring agent. Return concise JSON only.",
      messages: [{
        role: "user",
        content: `Analyze this live AIS issue and return JSON with severity ("critical"|"warning"|"info"), summary, likelyCause, recommendedAction.\n${JSON.stringify(event, null, 2)}`,
      }],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as Anthropic.TextBlock).text)
      .join("")
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(text) as Partial<{
      severity: PersistentAgentAlert["severity"];
      summary: string;
      likelyCause: string;
      recommendedAction: string;
    }>;
    return {
      severity: parsed.severity === "critical" || parsed.severity === "info" ? parsed.severity : "warning" as const,
      summary: parsed.summary || fallbackIssueAnalysis(event).summary,
      likelyCause: parsed.likelyCause || fallbackIssueAnalysis(event).likelyCause,
      recommendedAction: parsed.recommendedAction || fallbackIssueAnalysis(event).recommendedAction,
      model,
      rawResponse: parsed,
    };
  } catch {
    return fallbackIssueAnalysis(event);
  }
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function clampProgress(value: number | null): number {
  if (value === null) return 0;
  const normalized = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function formatCoordinateLabel(latitude: number | null, longitude: number | null): string | null {
  if (latitude === null || longitude === null) return null;
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}
