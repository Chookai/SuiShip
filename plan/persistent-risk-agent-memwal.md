# SuiShip Persistent Risk Agent With MemWal

## Summary

Build a shipment risk monitor that calls the local tracker API, detects disruptions
like a Straits of Hormuz carrier delay, generates recommendations, and stores the
agent's memory in MemWal so future checks can recall prior incidents, user
decisions, route patterns, and shipment-specific context.

MemWal fills the current gap between "static shipment passport" and "persistent
agent": SuiShip can already store manifests and progress checkpoints, but the
agent needs durable semantic memory across monitoring runs.

## Key Changes

- Add `POST /api/agent/monitor`.
  - Optional body: `{ shipmentId?: string }`.
  - Default tracker base URL: `TRACKER_API_BASE_URL=http://localhost:8081`.
  - Auto-register missing SuiShip shipments in the tracker API using existing
    shipment fields.
  - Poll `GET /api/v1/track/{tracking_number}` for current operational status.

- Add agent persistence tables.
  - `shipment_tracking_links`: maps SuiShip shipment IDs to tracker tracking
    numbers.
  - `agent_runs`: records each monitor cycle.
  - `agent_alerts`: stores deduped alerts, severity, recommendations, tracker
    evidence, MemWal blob IDs, namespace, and acknowledgement state.

- Make MemWal the agent memory layer.
  - Use shipment namespace: `${shipmentId}:agent`.
  - Use shared route namespace: `suiship:routes`.
  - Before analysis, recall relevant memories from both namespaces, such as
    prior delays, previous recommendations, user acknowledgements, and known
    route risks.
  - After analysis, remember a compact agent memory record containing incident
    summary, affected route, ETA impact, recommendations, evidence, and
    user-facing explanation.
  - Store returned `memwal_blob_id` on `agent_alerts`.

- Keep Walrus and MemWal roles distinct.
  - MemWal: private semantic memory for the agent, encrypted and recallable.
  - Existing Walrus upload helpers: optional public/shareable report artifact if
    needed for demo evidence.
  - MVP should prioritize MemWal blob IDs because MemWal already stores
    encrypted memories on Walrus through its relayer.

- Add shipment-detail UI.
  - Add an "Agent Risk Monitor" panel.
  - Show latest alert, ETA impact, recommendations, evidence, and MemWal memory
    reference.
  - Add "Run agent check".
  - Add "Acknowledge alert", which updates SQLite and writes an acknowledgement
    memory back to MemWal.

## Gap MemWal Solves

- Without MemWal, each agent run only sees the current tracker response and local
  SQLite rows.
- With MemWal, the agent can recall:
  - prior disruptions on the same shipment,
  - route-level history such as repeated Hormuz delays,
  - recommendations already shown to the user,
  - user acknowledgements and chosen actions,
  - learned carrier or customs patterns across shipments.

This makes the agent feel persistent rather than stateless.

## Test Plan

- Unit tests:
  - Tracker-to-alert severity mapping.
  - Alert fingerprint deduplication.
  - MemWal memory payload generation.
  - Recall context shaping for shipment and route namespaces.

- API tests:
  - Monitor auto-registers missing tracker shipment.
  - Monitor creates one alert for `carrier_delay`.
  - Re-running monitor does not duplicate the same alert.
  - Alert acknowledgement writes acknowledgement state and attempts MemWal
    remember.

- Manual demo:
  - Start SuiShip and tracker API.
  - Open a shipment detail page.
  - Trigger tracker `carrier_delay` with reason mentioning Straits of Hormuz.
  - Run agent check.
  - Verify alert, recommendations, ETA impact, and MemWal memory blob reference
    appear.
  - Acknowledge alert, rerun check, and verify the agent recalls that the user
    already saw/acknowledged the disruption.

## Assumptions

- MemWal credentials use existing env vars: `MEMWAL_ED25519_KEY`,
  `MEMWAL_ACCOUNT_ID`, `MEMWAL_SERVER_URL`.
- If MemWal is not configured, the app falls back to local mock memory IDs and
  still works for demo flow.
- The agent remains advisory only; it does not change shipment status
  automatically.
- The tracker API remains the MVP news/disruption source.

