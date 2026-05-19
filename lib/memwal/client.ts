import pino from "pino";

const logger = pino({ name: "memwal-client" });
const DEFAULT_MEMWAL_RELAYER_URL = "https://relayer.staging.memwal.ai";

// Lazy-loaded so Next.js doesn't try to bundle it for client components
let _MemWalClass: typeof import("@mysten-incubation/memwal").MemWal | null = null;
async function getMemWalClass() {
  if (!_MemWalClass) {
    const mod = await import("@mysten-incubation/memwal");
    _MemWalClass = mod.MemWal;
  }
  return _MemWalClass;
}

export type MemWalWriteResult = {
  jobId: string;
  blobId: string;
  namespace: string;
};

export type MemWalRecallItem = {
  blobId: string;
  text: string;
  distance: number;
};

/**
 * Write a text memory to MemWal under a shipment-scoped namespace.
 * Returns the Walrus blob_id once the job completes.
 */
export async function memwalRemember(
  text: string,
  namespace: string
): Promise<MemWalWriteResult> {
  const MemWal = await getMemWalClass();
  const client = MemWal.create({
    key: process.env.MEMWAL_ED25519_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    namespace,
  });

  try {
    const accepted = await client.remember(text, namespace);
    logger.info({ jobId: accepted.job_id, namespace }, "MemWal remember accepted");

    const result = await client.waitForRememberJob(accepted.job_id, {
      pollIntervalMs: 1500,
      timeoutMs: 60_000,
    });

    logger.info({ jobId: result.id, blobId: result.blob_id, namespace }, "MemWal remember complete");
    return { jobId: result.id, blobId: result.blob_id, namespace: result.namespace };
  } finally {
    client.destroy();
  }
}

/**
 * Query a shipment's MemWal namespace with a natural language query.
 * Returns top-k results sorted by similarity.
 */
export async function memwalRecall(
  query: string,
  namespace: string,
  limit = 10
): Promise<MemWalRecallItem[]> {
  const MemWal = await getMemWalClass();
  const client = MemWal.create({
    key: process.env.MEMWAL_ED25519_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    namespace,
  });

  try {
    const result = await client.recall(query, limit, namespace);
    logger.info({ query, namespace, count: result.results.length }, "MemWal recall complete");
    return result.results.map((r) => ({
      blobId: r.blob_id,
      text: r.text,
      distance: r.distance,
    }));
  } finally {
    client.destroy();
  }
}

/**
 * Check MemWal connectivity.
 */
export async function memwalHealth(): Promise<boolean> {
  try {
    const MemWal = await getMemWalClass();
    const client = MemWal.create({
      key: process.env.MEMWAL_ED25519_KEY!,
      accountId: process.env.MEMWAL_ACCOUNT_ID!,
      serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    });
    await client.health();
    client.destroy();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether MemWal is configured with real credentials.
 * Returns false if env vars are missing or placeholder values.
 */
export function isMemWalConfigured(): boolean {
  const key = process.env.MEMWAL_ED25519_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  return !!(key && accountId && !key.startsWith("your-") && !accountId.startsWith("0xTODO"));
}
