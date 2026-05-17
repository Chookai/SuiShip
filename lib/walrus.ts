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

function parseStoreResponse(data: Record<string, unknown>): { blobId: string | undefined; endEpoch: number | undefined } {
  // Two possible shapes from the publisher:
  // 1) Newly stored:    { newlyCreated: { blobObject: { blobId, ... }, endEpoch } }
  // 2) Already certified: { alreadyCertified: { blobId, endEpoch, ... } }
  const newlyCreated = (data as {
    newlyCreated?: { blobObject?: { blobId?: string; storage?: { endEpoch?: number } }; endEpoch?: number };
  }).newlyCreated;
  const alreadyCertified = (data as { alreadyCertified?: { blobId?: string; endEpoch?: number } }).alreadyCertified;

  const blobId = newlyCreated?.blobObject?.blobId ?? alreadyCertified?.blobId;
  const endEpoch =
    newlyCreated?.endEpoch ?? newlyCreated?.blobObject?.storage?.endEpoch ?? alreadyCertified?.endEpoch;

  return { blobId, endEpoch };
}

/** Direct read URL for a stored blob, useful for previewing or downloading. */
export function aggregatorUrl(blobId: string, aggregator: string = WALRUS_AGGREGATOR) {
  return `${aggregator}/v1/blobs/${blobId}`;
}
