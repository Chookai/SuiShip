import { SealClient, SessionKey } from "@mysten/seal";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { WALRUS_AGGREGATORS } from "./walrus";
import { parseEd25519Keypair } from "./sui-keypair";
import pino from "pino";

const logger = pino({ name: "seal-client" });

export const SEAL_ENABLED = process.env.SEAL_ENABLED === "true";

export class SealUnavailableError extends Error {
  constructor(msg = "SEAL_ENABLED=false — plaintext path active") {
    super(msg);
    this.name = "SealUnavailableError";
  }
}

const NETWORK = (process.env.SUI_NETWORK ?? "testnet") as "testnet" | "mainnet";

const DEFAULT_SERVER_CONFIGS = [
  { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
  { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
];

type SealApproveMode = "log-only" | "accumulator-and-log";

function getSuiClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  } as ConstructorParameters<typeof SuiJsonRpcClient>[0]);
}

function getServerKeypair(): Ed25519Keypair {
  const key = process.env.SUI_PRIVATE_KEY;
  if (!key) throw new Error("SUI_PRIVATE_KEY not set");
  return parseEd25519Keypair(key);
}

function getServerConfigs(): Array<{ objectId: string; weight: number }> {
  const raw = process.env.SEAL_KEY_SERVER_CONFIGS;
  return raw ? (JSON.parse(raw) as Array<{ objectId: string; weight: number }>) : DEFAULT_SERVER_CONFIGS;
}

function buildSealClient(): SealClient {
  return new SealClient({
    suiClient: getSuiClient(),
    serverConfigs: getServerConfigs(),
    verifyKeyServers: false,
    timeout: 15_000,
  });
}

function isExpiredSessionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /session key has expired/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Convert a 0x-prefixed Sui object ID to the raw hex bytes SEAL expects for the `id` param.
 */
export function objectIdToSealId(objectId: string): string {
  return objectId.replace(/^0x/, "");
}

/**
 * Encrypt bytes under SEAL using the endorsement log object ID as the access-control identity.
 * Returns null when SEAL_ENABLED=false (caller uploads plaintext as today).
 *
 * encryptionId = endorsementLogObjectId without the 0x prefix.
 */
export async function encryptPrivateManifest(
  data: Uint8Array,
  encryptionId: string,
): Promise<{ encryptedBytes: Uint8Array } | null> {
  if (!SEAL_ENABLED) return null;

  const packageId = process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID;
  if (!packageId) throw new Error("NEXT_PUBLIC_SUISHIP_PACKAGE_ID not set");

  logger.info({ encryptionIdPrefix: encryptionId.slice(0, 16), dataBytes: data.length }, "[seal] encrypting private manifest");
  const { encryptedObject } = await buildSealClient().encrypt({
    threshold: 2,
    packageId,
    id: encryptionId,
    data,
  });
  return { encryptedBytes: encryptedObject };
}

/**
 * Build a PTB calling seal_approve against the currently deployed package shape.
 * Some testnet deployments accept (id, log), while newer code accepts (id, accumulator, log).
 * encryptionId = objectIdToSealId(accumulatorId) — the raw hex used when encrypting.
 * The serialized tx bytes are passed to sealClient.decrypt() so key servers can verify access.
 */
async function getSealApproveMode(
  packageId: string,
  suiClient: SuiJsonRpcClient,
): Promise<SealApproveMode> {
  const fn = await suiClient.getNormalizedMoveFunction({
    package: packageId,
    module: "shipment_passport",
    function: "seal_approve",
  });
  if (fn.parameters.length === 3) return "log-only";
  if (fn.parameters.length === 4) return "accumulator-and-log";
  throw new Error(`Unsupported seal_approve signature with ${fn.parameters.length} parameters`);
}

export async function resolveSealEncryptionObjectId(input: {
  accumulatorId: string;
  endorsementLogId: string;
  sealObjectId?: string | null;
}): Promise<string> {
  const packageId = process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID;
  if (!packageId) throw new Error("NEXT_PUBLIC_SUISHIP_PACKAGE_ID not set");

  const mode = await getSealApproveMode(packageId, getSuiClient());
  return mode === "log-only"
    ? input.endorsementLogId
    : input.sealObjectId ?? input.accumulatorId;
}

async function buildSealApproveTx(
  accumulatorId: string,
  endorsementLogId: string,
  encryptionId: string,
  packageId: string,
  sender: string,
  suiClient: SuiJsonRpcClient,
): Promise<Transaction> {
  const mode = await getSealApproveMode(packageId, suiClient);
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(2_000_000);
  const idArg = tx.pure.vector("u8", Array.from(Buffer.from(encryptionId, "hex")));
  tx.moveCall({
    target: `${packageId}::shipment_passport::seal_approve`,
    arguments: mode === "log-only"
      ? [idArg, tx.object(endorsementLogId)]
      : [idArg, tx.object(accumulatorId), tx.object(endorsementLogId)],
  });
  return tx;
}

/**
 * Create a SessionKey signed by the server's Ed25519 keypair.
 * For seal_approve to pass, the server wallet must be the shipment's importer, exporter, or an endorser.
 */
export async function createSessionKey(keypair?: Ed25519Keypair): Promise<SessionKey> {
  const packageId = process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID;
  if (!packageId) throw new Error("NEXT_PUBLIC_SUISHIP_PACKAGE_ID not set");

  const signerKeypair = keypair ?? getServerKeypair();
  return SessionKey.create({
    address: signerKeypair.toSuiAddress(),
    packageId,
    ttlMin: 30,
    signer: signerKeypair,
    suiClient: getSuiClient(),
  });
}

/**
 * Download encrypted bytes from Walrus and decrypt via SEAL key servers.
 * Returns the raw decrypted bytes (a ZIP when the SEAL path is active).
 * Throws SealUnavailableError when disabled.
 * Throws NoAccessError (from @mysten/seal) when the server wallet is not authorized.
 *
 * encryptionId = objectIdToSealId(accumulatorId) — must match what was used at encrypt time.
 */
export async function decryptPrivateManifest(
  encryptedWalrusBlobId: string,
  accumulatorId: string,
  endorsementLogId: string,
  encryptionId: string,
  requesterKeypair?: Ed25519Keypair,
): Promise<Uint8Array> {
  if (!SEAL_ENABLED) throw new SealUnavailableError();

  const packageId = process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID;
  if (!packageId) throw new Error("NEXT_PUBLIC_SUISHIP_PACKAGE_ID not set");

  const suiClient = getSuiClient();
  const signerKeypair = requesterKeypair ?? getServerKeypair();
  const encryptedBytes = await fetchBlobFromWalrus(encryptedWalrusBlobId);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const sessionKey = await createSessionKey(signerKeypair);
    const tx = await buildSealApproveTx(
      accumulatorId,
      endorsementLogId,
      encryptionId,
      packageId,
      signerKeypair.toSuiAddress(),
      suiClient,
    );
    const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

    logger.info(
      {
        attempt,
        maxAttempts,
        encryptionIdPrefix: encryptionId.slice(0, 16),
        accumulatorIdPrefix: accumulatorId.slice(0, 16),
      },
      "[seal] requesting decryption keys"
    );

    try {
      const plaintext = await buildSealClient().decrypt({ data: encryptedBytes, sessionKey, txBytes });
      if (attempt > 1) {
        logger.info({ attempt, maxAttempts }, "[seal] decryption succeeded after refreshing session");
      }
      return plaintext;
    } catch (err) {
      if (!isExpiredSessionError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const delayMs = attempt * 300;
      logger.warn(
        { err, attempt, maxAttempts, delayMs },
        "[seal] session key expired during decrypt — refreshing session and retrying"
      );
      await sleep(delayMs);
    }
  }

  throw new Error("SEAL decryption exhausted retries");
}

async function fetchBlobFromWalrus(blobId: string): Promise<Uint8Array> {
  const errors: string[] = [];
  for (const aggregator of WALRUS_AGGREGATORS) {
    try {
      const res = await fetch(`${aggregator}/v1/blobs/${blobId}`);
      if (!res.ok) { errors.push(`${aggregator} → ${res.status}`); continue; }
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      errors.push(`${aggregator} → ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All Walrus aggregators failed for blob ${blobId}:\n${errors.join("\n")}`);
}
