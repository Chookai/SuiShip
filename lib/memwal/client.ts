import { createHash } from "node:crypto";
import pino from "pino";

const logger = pino({ name: "memwal-client" });
const DEFAULT_MEMWAL_RELAYER_URL = "https://relayer.staging.memwal.ai";
const REMEMBER_MAX_ATTEMPTS = 3;
const MEMWAL_MAX_ATTEMPTS = 3;

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
  if (!isMemWalConfigured()) {
    return mockWriteResult(namespace);
  }
  const MemWal = await getMemWalClass();
  const client = MemWal.create({
    key: process.env.MEMWAL_ED25519_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    namespace,
  });

  try {
    return await runRetriableMemWalOperation("remember", namespace, async (attempt) => {
      const accepted = await client.remember(text, namespace);
      logger.info({ jobId: accepted.job_id, namespace, attempt }, "MemWal remember accepted");

      const result = await client.waitForRememberJob(accepted.job_id, {
        pollIntervalMs: 1500,
        timeoutMs,
      });

      logger.info({ jobId: result.id, blobId: result.blob_id, namespace, attempt }, "MemWal remember complete");
      return { jobId: result.id, blobId: result.blob_id, namespace: result.namespace };
    }, { maxAttempts: REMEMBER_MAX_ATTEMPTS });
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
  if (!isMemWalConfigured()) {
    return mockBulkResult(items);
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
  if (!isMemWalConfigured()) {
    return { ...mockBulkResult([{ namespace }]), facts: [] };
  }
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
  if (!isMemWalConfigured()) {
    return { restored: 0, skipped: 0, total: 0, namespace };
  }
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
  if (!isMemWalConfigured()) {
    return [];
  }
  const MemWal = await getMemWalClass();
  const client = MemWal.create({
    key: process.env.MEMWAL_ED25519_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? DEFAULT_MEMWAL_RELAYER_URL,
    namespace,
  });

  try {
    const result = await runRetriableMemWalOperation(
      "recall",
      namespace,
      () => client.recall(query, limit, namespace)
    );
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
  if (!isMemWalConfigured()) return false;
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
 * Master switch: set ENABLE_MEMWAL=true in .env.local to use MemWal; false or unset = off.
 */
export function isMemWalEnabled(): boolean {
  const raw = process.env.ENABLE_MEMWAL?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return false;
}

/**
 * MemWal is active only when ENABLE_MEMWAL=true and credentials are present.
 */
export function isMemWalConfigured(): boolean {
  if (!isMemWalEnabled()) return false;
  const key = process.env.MEMWAL_ED25519_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  return !!(key && accountId && !key.startsWith("your-") && !accountId.startsWith("0xTODO"));
}

export async function runRetriableMemWalOperation<T>(
  operationName: string,
  namespace: string,
  operation: (attempt: number) => Promise<T>,
  options: {
    maxAttempts?: number;
    sleepFn?: (ms: number) => Promise<void>;
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MEMWAL_MAX_ATTEMPTS;
  const sleepFn = options.sleepFn ?? sleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      if (attempt >= maxAttempts || !isRetriableMemWalError(err)) {
        throw err;
      }

      const delayMs = getRetryDelayMs(err) ?? attempt * 1500;
      logger.warn({ err, namespace, attempt, delayMs, operationName }, "MemWal operation failed transiently — retrying");
      await sleepFn(delayMs);
    }
  }

  throw new Error(`MemWal ${operationName} exhausted retries`);
}

function mockWriteResult(namespace: string): MemWalWriteResult {
  const stub = createHash("sha256").update(`${namespace}:${Date.now()}`).digest("hex").slice(0, 32);
  return { jobId: `disabled_${stub}`, blobId: `memwal_disabled_${stub}`, namespace };
}

function mockBulkResult(items: Array<{ namespace: string }>): MemWalBulkWriteResult {
  return {
    succeeded: items.length,
    failed: 0,
    results: items.map((item) => ({
      ...mockWriteResult(item.namespace),
      status: "done" as const,
    })),
  };
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
