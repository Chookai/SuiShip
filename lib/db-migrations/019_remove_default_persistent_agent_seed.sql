-- Remove the static SF-2026-LIVE monitored shipment that was seeded by migration 015.
-- It is no longer force-created on every list call, so existing DBs need it cleaned up.
-- Related events and alerts are removed via ON DELETE CASCADE.
DELETE FROM persistent_agent_monitored_shipments
WHERE simulation_id = 'SF-2026-LIVE';
