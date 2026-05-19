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
