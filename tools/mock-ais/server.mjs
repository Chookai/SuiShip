#!/usr/bin/env node
/**
 * Minimal AIS + freight tracker stub for local development and hackathon judges.
 *
 * Implements the same API surface that lib/tracker-api/client.ts expects:
 *   POST   /api/v1/shipments           register shipment
 *   GET    /api/v1/shipments           list shipments
 *   GET    /api/v1/track/:tracking     get tracking status
 *   POST   /mock/ais/simulations       start AIS simulation
 *   GET    /mock/ais/simulations/:id   get AIS position
 *   DELETE /mock/ais/simulations/:id   stop simulation
 *   GET    /health                     health check
 *   GET    /mock/ui                    simple status page
 *
 * Usage:
 *   node tools/mock-ais/server.mjs          # port 8081
 *   PORT=8082 node tools/mock-ais/server.mjs
 */

import http from "node:http";
import crypto from "node:crypto";

const PORT = parseInt(process.env.PORT ?? "8081", 10);

// In-memory stores (resets on server restart — fine for dev)
const shipments = new Map();   // shipmentId → { tracking_number, current_status, eta, ... }
const simulations = new Map(); // shipmentId → { imo, origin, destination, startedAt, durationSeconds }

const PORT_COORDS = {
  Singapore:    { lat:  1.29, lng: 103.85 },
  "Los Angeles": { lat: 33.74, lng: -118.25 },
  Shanghai:     { lat: 31.23, lng: 121.47 },
  Tokyo:        { lat: 35.45, lng: 139.77 },
  Rotterdam:    { lat: 51.92, lng:  4.48 },
  Hamburg:      { lat: 53.54, lng:   9.99 },
  Sydney:       { lat: -33.86, lng: 151.21 },
};

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getPosition(sim) {
  const elapsed = (Date.now() - sim.startedAt) / 1000;
  const t = Math.min(elapsed / sim.durationSeconds, 1);
  const originCoords = PORT_COORDS[sim.origin] ?? PORT_COORDS["Singapore"];
  const destCoords   = PORT_COORDS[sim.destination] ?? PORT_COORDS["Los Angeles"];
  const lat = lerp(originCoords.lat, destCoords.lat, t);
  const lng = lerp(originCoords.lng, destCoords.lng, t);
  const dLat = destCoords.lat - originCoords.lat;
  const dLng = destCoords.lng - originCoords.lng;
  const headingDeg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  const status = t >= 1 ? "arrived" : "underway";
  return { lat, lng, headingDeg, progressPercent: Math.round(t * 100), status, elapsed };
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  // Health check
  if (method === "GET" && path === "/health") {
    return send(res, 200, { status: "ok", db_reachable: true, shipments: shipments.size, simulations: simulations.size });
  }

  // Status UI
  if (method === "GET" && path === "/mock/ui") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(`<!DOCTYPE html><html><body>
<h2>SuiShip Mock AIS Server</h2>
<p>Status: <strong>running</strong> on port ${PORT}</p>
<p>Tracked shipments: ${shipments.size}</p>
<p>Active simulations: ${simulations.size}</p>
<p>Endpoints: POST /api/v1/shipments &bull; GET /api/v1/track/:id &bull; POST /mock/ais/simulations &bull; GET /mock/ais/simulations/:id</p>
</body></html>`);
  }

  // POST /api/v1/shipments — register
  if (method === "POST" && path === "/api/v1/shipments") {
    const body = await readBody(req);
    const { shipment_id, carrier, origin, destination, mode } = body;
    if (!shipment_id) return send(res, 400, { error: "shipment_id required" });
    if (shipments.has(shipment_id)) return send(res, 409, { error: "already registered" });
    const tracking_number = `SSF-${randomHex(6).toUpperCase()}`;
    const eta = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    shipments.set(shipment_id, { shipment_id, tracking_number, current_status: "registered", status_category: "in_transit", location: origin ?? "Origin Port", eta, carrier: carrier ?? "SuiShip", mode: mode ?? "sea", origin, destination, action_required: false, payment_required: false, events: [{ id: 1, status: "registered", location: origin ?? "Origin Port", description: "Shipment registered", timestamp: new Date().toISOString() }] });
    return send(res, 201, { tracking_number, status: "registered", eta });
  }

  // GET /api/v1/shipments — list
  if (method === "GET" && path === "/api/v1/shipments") {
    return send(res, 200, [...shipments.values()].map(({ shipment_id, tracking_number, current_status, eta }) => ({ shipment_id, tracking_number, current_status, eta })));
  }

  // GET /api/v1/track/:tracking
  const trackMatch = path.match(/^\/api\/v1\/track\/([^/]+)$/);
  if (method === "GET" && trackMatch) {
    const trackingNumber = decodeURIComponent(trackMatch[1]);
    const shipment = [...shipments.values()].find((s) => s.tracking_number === trackingNumber);
    if (!shipment) return send(res, 404, { error: "tracking number not found" });
    // Advance status over time for demo effect
    const ageMin = (Date.now() - new Date(shipment.events[0].timestamp).getTime()) / 60000;
    if (ageMin > 2 && shipment.current_status === "registered") {
      shipment.current_status = "in_transit";
      shipment.location = "Open Ocean";
      shipment.events.push({ id: 2, status: "in_transit", location: "Open Ocean", description: "Vessel departed port", timestamp: new Date().toISOString() });
    }
    return send(res, 200, shipment);
  }

  // POST /mock/ais/simulations — start simulation
  if (method === "POST" && path === "/mock/ais/simulations") {
    const body = await readBody(req);
    const { shipment_id, origin, destination, duration_seconds } = body;
    if (!shipment_id) return send(res, 400, { error: "shipment_id required" });
    if (simulations.has(shipment_id)) return send(res, 409, { error: "simulation already exists" });
    const imo = `IMO${randomHex(4).toUpperCase()}`;
    simulations.set(shipment_id, { imo, shipment_id, origin: origin ?? "Singapore", destination: destination ?? "Los Angeles", startedAt: Date.now(), durationSeconds: duration_seconds ?? 300 });
    return send(res, 201, { imo, status: "underway" });
  }

  // GET /mock/ais/simulations/:id
  const aisGetMatch = path.match(/^\/mock\/ais\/simulations\/([^/]+)$/);
  if (method === "GET" && aisGetMatch) {
    const shipmentId = decodeURIComponent(aisGetMatch[1]);
    const sim = simulations.get(shipmentId);
    if (!sim) return send(res, 404, { error: "no active simulation" });
    const { lat, lng, headingDeg, progressPercent, status, elapsed } = getPosition(sim);
    return send(res, 200, {
      shipment_id: sim.shipment_id,
      imo: sim.imo,
      vessel_name: `MV SuiShip-${sim.imo.slice(-4)}`,
      origin:      { name: sim.origin },
      destination: { name: sim.destination },
      current_position: { lat, lng },
      heading_deg: Math.round(headingDeg),
      progress_percent: progressPercent,
      status,
      elapsed_seconds: Math.round(elapsed),
      duration_seconds: sim.durationSeconds,
      timestamp: new Date().toISOString(),
    });
  }

  // DELETE /mock/ais/simulations/:id
  const aisDelMatch = path.match(/^\/mock\/ais\/simulations\/([^/]+)$/);
  if (method === "DELETE" && aisDelMatch) {
    const shipmentId = decodeURIComponent(aisDelMatch[1]);
    simulations.delete(shipmentId);
    return send(res, 204, {});
  }

  // OPTIONS (CORS preflight)
  if (method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    return res.end();
  }

  send(res, 404, { error: `${method} ${path} not found` });
});

server.listen(PORT, () => {
  console.log(`[mock-ais] Stub server running on http://localhost:${PORT}`);
  console.log(`[mock-ais] Status page: http://localhost:${PORT}/mock/ui`);
  console.log(`[mock-ais] Health:      http://localhost:${PORT}/health`);
});
