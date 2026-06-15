/**
 * Typed client for the mock freight tracker API and AIS simulation endpoints.
 * Modeled on lib/sui-passport-client.ts patterns: typed result unions, all errors
 * caught and returned — no thrown exceptions propagate to callers.
 *
 * Base URL: process.env.AIS_BASE_URL (defaults to http://localhost:8081).
 * Both the core freight tracker (/api/v1) and AIS simulation (/mock/ais) live
 * on the same server, so a single env var covers both.
 */

const baseUrl = (): string =>
  (process.env.AIS_BASE_URL ?? "http://localhost:8081").replace(/\/$/, "");

// AIS preset port names the mock simulation server accepts.
const PORT_PRESETS = [
  "Singapore",
  "Los Angeles",
  "Shanghai",
  "Tokyo",
  "Rotterdam",
  "Hamburg",
  "Sydney",
];

/**
 * Map a free-form port string to the nearest AIS preset by case-insensitive
 * substring match. Falls back to "Singapore".
 */
export function nearestPortPreset(input: string): string {
  const lower = input.toLowerCase();
  const match = PORT_PRESETS.find((p) => lower.includes(p.toLowerCase()));
  return match ?? "Singapore";
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type FreightRegisterResult =
  | { ok: true; trackingNumber: string; freightStatus: string; eta: string }
  | { ok: false; error: string; conflict?: boolean };

export type AisSimResult =
  | { ok: true; imo: string; simStatus: string }
  | { ok: false; error: string };

export type TrackingRegistration = {
  freight: FreightRegisterResult;
  ais: AisSimResult;
};

export type TrackingStatusResult =
  | {
      ok: true;
      trackingNumber: string;
      currentStatus: string;
      statusCategory: string;
      location: string;
      eta: string;
      actionRequired: boolean;
      paymentRequired: boolean;
      events: Array<{ id: number; status: string; location: string; description: string; timestamp: string }>;
    }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Core freight tracker endpoints (/api/v1)
// ---------------------------------------------------------------------------

/**
 * Register a shipment with the mock freight tracker.
 * POST /api/v1/shipments
 *
 * Returns a tracking_number (SSF-{12hex}) on success.
 * If the shipment_id already exists (409), attempts to fetch the existing
 * tracking_number from GET /api/v1/shipments so the call is idempotent.
 */
export async function registerWithFreightTracker(params: {
  shipmentId: string;
  origin: string;
  destination: string;
  carrier?: string;
  mode?: "air" | "sea" | "land";
  scenario?: string;
}): Promise<FreightRegisterResult> {
  try {
    const res = await fetch(`${baseUrl()}/api/v1/shipments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipment_id: params.shipmentId,
        carrier: params.carrier ?? "SuiShip",
        origin: params.origin,
        destination: params.destination,
        mode: params.mode ?? "sea",
        scenario: params.scenario ?? "happy_path",
      }),
    });

    if (res.status === 409) {
      // Already registered — fetch existing tracking number
      const existing = await fetchExistingTrackingNumber(params.shipmentId);
      if (existing) return { ok: true, trackingNumber: existing.trackingNumber, freightStatus: existing.status, eta: existing.eta, conflict: true } as FreightRegisterResult & { conflict: boolean };
      return { ok: false, error: "Shipment already registered but could not retrieve tracking number", conflict: true };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Freight tracker returned HTTP ${res.status}: ${text}` };
    }

    const data = (await res.json()) as { tracking_number: string; status: string; eta: string };
    return { ok: true, trackingNumber: data.tracking_number, freightStatus: data.status, eta: data.eta };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchExistingTrackingNumber(
  shipmentId: string
): Promise<{ trackingNumber: string; status: string; eta: string } | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/v1/shipments`);
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{ shipment_id: string; tracking_number: string; current_status: string; eta: string }>;
    const found = list.find((s) => s.shipment_id === shipmentId);
    return found ? { trackingNumber: found.tracking_number, status: found.current_status, eta: found.eta } : null;
  } catch {
    return null;
  }
}

/**
 * Poll current status for a registered shipment.
 * GET /api/v1/track/{trackingNumber}
 */
export async function getTrackingStatus(trackingNumber: string): Promise<TrackingStatusResult> {
  try {
    const res = await fetch(`${baseUrl()}/api/v1/track/${encodeURIComponent(trackingNumber)}`, {
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      tracking_number: string;
      current_status: string;
      status_category: string;
      location: string;
      eta: string;
      action_required: boolean;
      payment_required: boolean;
      events: Array<{ id: number; status: string; location: string; description: string; timestamp: string }>;
    };
    return {
      ok: true,
      trackingNumber: data.tracking_number,
      currentStatus: data.current_status,
      statusCategory: data.status_category,
      location: data.location,
      eta: data.eta,
      actionRequired: data.action_required,
      paymentRequired: data.payment_required,
      events: data.events,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// AIS simulation endpoints (/mock/ais)
// ---------------------------------------------------------------------------

/**
 * Start an AIS vessel position simulation.
 * POST /mock/ais/simulations
 *
 * origin and destination must be port preset names; nearestPortPreset() is
 * called automatically before sending.
 */
export async function startAisSimulation(params: {
  shipmentId: string;
  origin: string;
  destination: string;
  durationSeconds?: number;
}): Promise<AisSimResult> {
  try {
    const originPreset = nearestPortPreset(params.origin);
    const destPreset = nearestPortPreset(params.destination);
    const res = await fetch(`${baseUrl()}/mock/ais/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shipment_id: params.shipmentId,
        origin: originPreset,
        destination: destPreset,
        scenario: "smooth",
        duration_seconds: params.durationSeconds ?? 300,
      }),
    });

    if (res.status === 409) {
      // Simulation already exists — treat as success
      return { ok: true, imo: "existing", simStatus: "underway" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `AIS simulation returned HTTP ${res.status}: ${text}` };
    }

    const data = (await res.json()) as { imo: string; status: string };
    return { ok: true, imo: data.imo, simStatus: data.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Stop/delete an AIS simulation. Best-effort — errors are swallowed.
 * DELETE /mock/ais/simulations/{shipmentId}
 */
export async function stopTracking(shipmentId: string): Promise<void> {
  try {
    await fetch(`${baseUrl()}/mock/ais/simulations/${encodeURIComponent(shipmentId)}`, {
      method: "DELETE",
    });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Convenience: register with both systems
// ---------------------------------------------------------------------------

/**
 * Register a shipment with the freight tracker and start an AIS simulation.
 * Both calls are independent; a failure in one does not block the other.
 */
export async function registerShipmentForTracking(params: {
  shipmentId: string;
  origin: string;
  destination: string;
  carrier?: string;
  mode?: "air" | "sea" | "land";
}): Promise<TrackingRegistration> {
  const [freight, ais] = await Promise.all([
    registerWithFreightTracker(params),
    startAisSimulation(params),
  ]);
  return { freight, ais };
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/** Returns true if the mock freight API is reachable and healthy. */
export type AisPositionResult =
  | {
      ok: true;
      shipmentId: string;
      vesselName: string;
      origin: string;
      destination: string;
      lat: number;
      lng: number;
      headingDeg: number;
      progressPercent: number;
      status: string;
      elapsedSeconds: number;
      durationSeconds: number;
      timestamp: string;
    }
  | { ok: false; error: string };

export async function getAisPosition(shipmentId: string): Promise<AisPositionResult> {
  try {
    const res = await fetch(
      `${baseUrl()}/mock/ais/simulations/${encodeURIComponent(shipmentId)}`,
      { cache: "no-store" }
    );
    if (res.status === 404) return { ok: false, error: "No active simulation found for this shipment." };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const d = (await res.json()) as {
      shipment_id: string;
      vessel_name: string;
      origin: { name: string };
      destination: { name: string };
      current_position: { lat: number; lng: number };
      heading_deg: number;
      progress_percent: number;
      status: string;
      elapsed_seconds: number;
      duration_seconds: number;
      timestamp: string;
    };
    return {
      ok: true,
      shipmentId: d.shipment_id,
      vesselName: d.vessel_name,
      origin: d.origin.name,
      destination: d.destination.name,
      lat: d.current_position.lat,
      lng: d.current_position.lng,
      headingDeg: d.heading_deg,
      progressPercent: d.progress_percent,
      status: d.status,
      elapsedSeconds: d.elapsed_seconds,
      durationSeconds: d.duration_seconds,
      timestamp: d.timestamp,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pingTracker(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl()}/health`, { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string; db_reachable?: boolean };
    return data.status === "ok" && data.db_reachable !== false;
  } catch {
    return false;
  }
}
