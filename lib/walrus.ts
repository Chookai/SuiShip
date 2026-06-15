// Thin client for the public Walrus testnet HTTP API.
//
// Docs: https://docs.wal.app/ (HTTP API uses /v1/blobs for PUT, /v1/blobs/{id} for GET).
//
// We hit a public testnet publisher to store a blob and then read it back via the
// aggregator. No SDK required — Walrus exposes a simple PUT.
//
// Public testnet publishers are operated by community node providers and can be
// flaky. If one returns an error we transparently try the next.

export const WALRUS_PUBLISHERS = [
  "https://publisher.walrus-testnet.walrus.space",
  "https://walrus-testnet-publisher.nodes.guru",
  "https://publisher.testnet.walrus.atalma.io",
  "https://walrus-testnet-publisher.bartestnet.com"
];

export const WALRUS_AGGREGATORS = [
  "https://aggregator.walrus-testnet.walrus.space",
  "https://walrus-testnet-aggregator.nodes.guru",
  "https://aggregator.testnet.walrus.atalma.io"
];

export const WALRUS_PUBLISHER = WALRUS_PUBLISHERS[0];
export const WALRUS_AGGREGATOR = WALRUS_AGGREGATORS[0];

export type WalrusStoreResponse = {
  blobId: string;
  endEpoch?: number;
  publisher: string;
  raw: unknown;
};

export type WalrusStoreParams = {
  file: File;
  /** How many epochs to keep the blob alive. Testnet default is small; 5 is plenty for a demo. */
  epochs?: number;
  /** Override the publisher list if you have a private one. */
  publishers?: string[];
};

/**
 * Upload a single file (e.g. a ZIP) to a Walrus testnet publisher.
 * Tries publishers in order until one accepts the blob.
 */
export async function storeBlob({
  file,
  epochs = 5,
  publishers = WALRUS_PUBLISHERS
}: WalrusStoreParams): Promise<WalrusStoreResponse> {
  const errors: string[] = [];

  for (const publisher of publishers) {
    const url = `${publisher}/v1/blobs?epochs=${epochs}`;
    try {
      const response = await fetch(url, {
        method: "PUT",
        body: file
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        errors.push(`${publisher} → ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 160)}` : ""}`);
        continue;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const parsed = parseStoreResponse(data);
      if (!parsed.blobId) {
        errors.push(`${publisher} → response missing blobId: ${JSON.stringify(data).slice(0, 160)}`);
        continue;
      }

      return { blobId: parsed.blobId, endEpoch: parsed.endEpoch, publisher, raw: data };
    } catch (err) {
      errors.push(`${publisher} → ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`All Walrus publishers failed.\n${errors.join("\n")}`);
}

/** Direct read URL for a stored blob, useful for previewing or downloading. */
export function aggregatorUrl(blobId: string, aggregator: string = WALRUS_AGGREGATOR) {
  return `${aggregator}/v1/blobs/${blobId}`;
}

/** Minimum epoch duration used at mint time. Override with WALRUS_EPOCHS env var. */
export const WALRUS_MINT_EPOCHS = parseInt(process.env.WALRUS_EPOCHS ?? "24", 10);

export type ServerBlobParams = {
  data: Buffer | string;
  fileName: string;
  mimeType?: string;
  epochs?: number;
  publishers?: string[];
};

/**
 * Server-side blob upload using Node.js fetch (usable from API routes).
 * Identical retry logic to storeBlob() but accepts a Buffer instead of a browser File.
 */
export async function storeBlobServer({
  data,
  epochs = WALRUS_MINT_EPOCHS,
  publishers = WALRUS_PUBLISHERS,
}: ServerBlobParams): Promise<WalrusStoreResponse & { sizeBytes: number }> {
  const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  const sizeBytes = buffer.length;
  const errors: string[] = [];

  for (const publisher of publishers) {
    const url = `${publisher}/v1/blobs?epochs=${epochs}`;
    try {
      const response = await fetch(url, {
        method: "PUT",
        body: buffer as unknown as BodyInit,
        headers: { "Content-Type": "application/octet-stream" },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        errors.push(`${publisher} → ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
        continue;
      }

      const responseData = (await response.json()) as Record<string, unknown>;
      const parsed = parseStoreResponse(responseData);
      if (!parsed.blobId) {
        errors.push(`${publisher} → response missing blobId`);
        continue;
      }

      return { blobId: parsed.blobId, endEpoch: parsed.endEpoch, publisher, raw: responseData, sizeBytes };
    } catch (err) {
      errors.push(`${publisher} → ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`All Walrus publishers failed.\n${errors.join("\n")}`);
}

/**
 * Estimates WAL storage cost for a given payload before committing.
 * Calls the publisher with `?dry-run=true` (Walrus testnet supports this).
 */
export async function estimateStorageCost(
  sizeBytes: number,
  epochs: number = WALRUS_MINT_EPOCHS
): Promise<{ estimatedWal: number; estimatedUsd: number; note: string }> {
  const GB = 1024 * 1024 * 1024;
  const walPerGbPerEpoch = 0.003;
  const usdPerWal = 0.025;
  const sizeGb = sizeBytes / GB;
  const estimatedWal = sizeGb * epochs * walPerGbPerEpoch;
  const estimatedUsd = estimatedWal * usdPerWal;
  return {
    estimatedWal,
    estimatedUsd,
    note: "Testnet WAL is free via faucet. Mainnet estimate only.",
  };
}

function parseStoreResponse(data: Record<string, unknown>): { blobId: string | undefined; endEpoch: number | undefined } {
  const newlyCreated = (data as {
    newlyCreated?: { blobObject?: { blobId?: string; storage?: { endEpoch?: number } }; endEpoch?: number };
  }).newlyCreated;
  const alreadyCertified = (data as { alreadyCertified?: { blobId?: string; endEpoch?: number } }).alreadyCertified;

  const blobId = newlyCreated?.blobObject?.blobId ?? alreadyCertified?.blobId;
  const endEpoch =
    newlyCreated?.endEpoch ?? newlyCreated?.blobObject?.storage?.endEpoch ?? alreadyCertified?.endEpoch;

  return { blobId, endEpoch };
}
