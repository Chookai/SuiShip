export type {
  MemWalManifest,
  MemWalReasoningTrace,
  MemWalDocumentChunk,
  MemWalAccessPolicy,
  MemWalAccessScope,
  MemWalSpaceDescriptor,
} from "./types";

export { memwalRemember, memwalRecall, memwalHealth, isMemWalConfigured } from "./client";

/**
 * Fire-and-forget doc event write. Never throws to the caller.
 * Used to append per-doc events to the in-flight MemWal audit trail.
 */
export async function writeDocEvent(
  shipmentId: string,
  op: "doc_extracted" | "doc_validated" | "conflict_detected",
  payload: Record<string, unknown>
): Promise<void> {
  const { isMemWalConfigured, memwalRemember } = await import("./client");
  if (!isMemWalConfigured()) return;

  const text = `SUISHIP DOC EVENT\n${JSON.stringify({
    op,
    shipment_id: shipmentId,
    ...payload,
    ts: new Date().toISOString(),
  }, null, 2)}`;

  memwalRemember(text, `${shipmentId}:docs`).catch(() => {
    // Swallow — MemWal failure never blocks the upload flow
  });
}

/**
 * Fire-and-forget progress/event write for shipment timeline memories.
 */
export async function writeProgressMemory(
  shipmentId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { isMemWalConfigured, memwalRemember } = await import("./client");
  if (!isMemWalConfigured()) return;

  const text = `SUISHIP PROGRESS EVENT\n${JSON.stringify({
    shipment_id: shipmentId,
    ...payload,
  }, null, 2)}`;

  memwalRemember(text, `${shipmentId}:progress`).catch(() => {
    // Swallow — MemWal failure never blocks the main request path
  });
}

/**
 * Reads the manifest for a minted shipment.
 * Checks SQLite cache first; falls back to MemWal recall if cache is stale.
 */
export async function readManifestFromMemWal(
  spaceId: string,
  shipmentId: string
): Promise<string | null> {
  // spaceId format: "accountId:namespace" when using real MemWal
  const parts = spaceId.split(":");
  const namespace = parts.length === 2 ? parts[1] : shipmentId;

  try {
    const { isMemWalConfigured, memwalRecall } = await import("./client");
    if (!isMemWalConfigured()) {
      // Fall back to SQLite cache
      return readFromSqliteCache(shipmentId);
    }

    const results = await memwalRecall("shipment manifest parties cargo documents", namespace, 1);
    if (results.length > 0) {
      const text = results[0].text;
      // Extract JSON from the remembered text
      const jsonStart = text.indexOf("{");
      if (jsonStart !== -1) return text.slice(jsonStart);
    }
    return await readFromSqliteCache(shipmentId);
  } catch {
    return await readFromSqliteCache(shipmentId);
  }
}

async function readFromSqliteCache(shipmentId: string): Promise<string | null> {
  try {
    const { getDb } = await import("../db");
    const db = getDb();
    const row = db
      .prepare("SELECT manifest_json FROM manifest_cache WHERE shipment_id = ?")
      .get(shipmentId) as { manifest_json: string } | undefined;
    return row?.manifest_json ?? null;
  } catch {
    return null;
  }
}
