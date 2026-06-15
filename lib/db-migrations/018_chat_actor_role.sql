-- Add actor_role column to shipment_chats to partition history by the human party role.
-- Note: the existing "role" column stores message type (user/assistant/tool_call/tool_result).
-- actor_role stores the human party: 'Exporter', 'Freight Forwarder', or 'Importer'.
ALTER TABLE shipment_chats ADD COLUMN actor_role TEXT;

-- Backfill existing rows as Exporter (the only role with historical chat usage).
UPDATE shipment_chats SET actor_role = 'Exporter' WHERE actor_role IS NULL;

-- Composite index for per-role history queries.
CREATE INDEX IF NOT EXISTS idx_shipment_chats_actor_role
  ON shipment_chats(shipment_id, actor_role, created_at DESC);
