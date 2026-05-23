import pino from "pino";

const logger = pino({ name: "memwal-client" });
const DEFAULT_MEMWAL_RELAYER_URL = "https://relayer.staging.memwal.ai";
const REMEMBER_MAX_ATTEMPTS = 3;

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

export type MemWalBulkWriteResult = {
  succeeded: number;
  failed: number;
  results: Array<{
    jobId: string;
    blobId: string;
    namespace: string;
    status: "done" | "failed" | "timeout";
    error?: string;
  }>;
};

export type MemWalAnalyzeResult = MemWalBulkWriteResult & {
  facts: string[];
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
  return memwalRememberAndWait(text, namespace);
}

export async function memwalRememberAndWait(
  text: string,
  namespace: string,
  timeoutMs = 60_000
): Promise<MemWalWriteResult> {
  const MemWal = await getMemWalClass();
  const client = MemWal.create({
    key: process.env.MEMWAL_ED25519_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    namespace,
  });

  try {
    for (let attempt = 1; attempt <= REMEMBER_MAX_ATTEMPTS; attempt += 1) {
      try {
        const accepted = await client.remember(text, namespace);
        logger.info({ jobId: accepted.job_id, namespace, attempt }, "MemWal remember accepted");

        const result = await client.waitForRememberJob(accepted.job_id, {
          pollIntervalMs: 1500,
          timeoutMs,
        });

        logger.info({ jobId: result.id, blobId: result.blob_id, namespace, attempt }, "MemWal remember complete");
        return { jobId: result.id, blobId: result.blob_id, namespace: result.namespace };
      } catch (err) {
        if (attempt >= REMEMBER_MAX_ATTEMPTS || !isRetriableMemWalError(err)) {
          throw err;
        }

        const delayMs = getRetryDelayMs(err) ?? attempt * 1500;
        logger.warn({ err, namespace, attempt, delayMs }, "MemWal remember failed transiently — retrying");
        await sleep(delayMs);
      }
    }

    throw new Error("MemWal remember exhausted retries");
  } finally {
    client.destroy();
  }
}

export async function memwalRememberBulkAndWait(
  items: Array<{ text: string; namespace: string }>,
  timeoutMs = 120_000
): Promise<MemWalBulkWriteResult> {
  if (items.length === 0) {
    return { succeeded: 0, failed: 0, results: [] };
  }

  const MemWal = await getMemWalClass();
  const client = MemWal.create({
    key: process.env.MEMWAL_ED25519_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    namespace: items[0]?.namespace ?? "default",
  });

  try {
    const result = await client.rememberBulkAndWait(items, {
      pollIntervalMs: 1500,
      timeoutMs,
    });
    return {
      succeeded: result.succeeded,
      failed: result.failed,
      results: result.results.map((item) => ({
        jobId: item.id,
        blobId: item.blob_id,
        namespace: item.namespace,
        status: item.status,
        error: item.error,
      })),
    };
  } finally {
    client.destroy();
  }
}

export async function memwalAnalyzeAndWait(
  text: string,
  namespace: string,
  timeoutMs = 120_000
): Promise<MemWalAnalyzeResult> {
  const MemWal = await getMemWalClass();
  const client = MemWal.create({
    key: process.env.MEMWAL_ED25519_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    namespace,
  });

  try {
    const result = await client.analyzeAndWait(text, namespace, {
      pollIntervalMs: 1500,
      timeoutMs,
    });
    return {
      succeeded: result.succeeded,
      failed: result.failed,
      facts: result.facts.map((fact) => fact.text),
      results: result.results.map((item) => ({
        jobId: item.id,
        blobId: item.blob_id,
        namespace: item.namespace,
        status: item.status,
        error: item.error,
      })),
    };
  } finally {
    client.destroy();
  }
}

export async function memwalRestore(namespace: string, limit = 10): Promise<{ restored: number; skipped: number; total: number; namespace: string }> {
  const MemWal = await getMemWalClass();
  const client = MemWal.create({
    key: process.env.MEMWAL_ED25519_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    namespace,
  });

  try {
    const result = await client.restore(namespace, limit);
    return {
      restored: result.restored,
      skipped: result.skipped,
      total: result.total,
      namespace: result.namespace,
    };
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

function isRetriableMemWalError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /(502|503|504|429|timeout|timed out|temporar)/i.test(message);
}

function getRetryDelayMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/"retry_after_seconds"\s*:\s*(\d+)/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, 120_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
