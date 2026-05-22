import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Inputs, Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import pino from "pino";
import { parseEd25519Keypair } from "@/lib/sui-keypair";
import type {
  SuiPassportClient,
  DocCommitInput,
  Grant,
  GrantAccessInput,
  GrantAccessResult,
  MemWalAccessScope,
  MintPassportInput,
  MintPassportResult,
  PassportRecord,
  RevokeAccessInput,
  TransferPassportInput,
} from "./types";

const logger = pino({ name: "real-sui-client" });

const NETWORK = (process.env.SUI_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet"
  | "devnet"
  | "localnet";

type OwnedObjectRef = {
  objectId: string;
  version: string;
  digest: string;
};

type TransactionMetrics = {
  mutableTxCount: number;
  retryCountTotal: number;
  retryCountByLabel: Record<string, number>;
};

type ShipmentMutationState = {
  recordRef?: OwnedObjectRef;
  gasRef?: OwnedObjectRef;
};

const shipmentTxMetrics = new Map<string, TransactionMetrics>();
const shipmentMutationState = new Map<string, ShipmentMutationState>();

function getPackageId(): string {
  const id = process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID;
  if (!id) throw new Error("NEXT_PUBLIC_SUISHIP_PACKAGE_ID env var is not set");
  return id;
}

function getRegistryId(): string {
  const id = process.env.NEXT_PUBLIC_REGISTRY_ID;
  if (!id) throw new Error("NEXT_PUBLIC_REGISTRY_ID env var is not set");
  return id;
}

function getKeypair(): Ed25519Keypair {
  const key = process.env.SUI_PRIVATE_KEY;
  if (!key) throw new Error("SUI_PRIVATE_KEY env var is not set");
  return parseEd25519Keypair(key);
}

function getClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  } as ConstructorParameters<typeof SuiJsonRpcClient>[0]);
}

function normalizeHex(hex: string): string {
  const normalized = hex.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error(`Invalid hex string: ${hex}`);
  }
  return normalized;
}

function hexToBytes(hex: string): number[] {
  const normalized = normalizeHex(hex);
  if (normalized.length % 2 !== 0) {
    throw new Error(`Hex string must contain an even number of characters: ${hex}`);
  }
  return Array.from(Buffer.from(normalized, "hex"));
}

function hexToFixedBytes(hex: string, size: number): number[] {
  const normalized = normalizeHex(hex);
  const padded = normalized.padStart(size * 2, "0");
  if (padded.length !== size * 2) {
    throw new Error(`Expected ${size} bytes of hex, received ${normalized.length / 2}`);
  }
  return Array.from(Buffer.from(padded, "hex"));
}

async function executeTransaction(tx: Transaction, signer: Ed25519Keypair = getKeypair()): Promise<{
  digest: string;
  objectChanges: Array<{ type: string; objectId: string; objectType?: string }>;
  effects?: {
    mutated?: Array<{ reference?: OwnedObjectRef }>;
    created?: Array<{ reference?: OwnedObjectRef }>;
    gasObject?: { reference?: OwnedObjectRef };
  };
}> {
  const client = getClient();

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });

  const status = (result as { effects?: { status?: { status: string; error?: string } } })
    .effects?.status;
  if (status?.status !== "success") {
    throw new Error(
      `SUI transaction failed: ${status?.error ?? "unknown"}\nDigest: ${result.digest}`
    );
  }

  const objectChanges = (
    (result as { objectChanges?: unknown[] }).objectChanges ?? []
  ).map((c) => c as { type: string; objectId: string; objectType?: string });

  logger.info({ digest: result.digest, network: NETWORK }, "SUI tx executed");
  return {
    digest: result.digest,
    objectChanges,
    effects: (result as {
      effects?: {
        mutated?: Array<{ reference?: OwnedObjectRef }>;
        created?: Array<{ reference?: OwnedObjectRef }>;
        gasObject?: { reference?: OwnedObjectRef };
      };
    }).effects,
  };
}

function isRetryableObjectVersionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("Transaction needs to be rebuilt because object") ||
    message.includes("is unavailable for consumption, current version:") ||
    message.includes("input objects are invalid")
  );
}

async function executeRetriableTransaction(
  label: string,
  build: () => Transaction,
  shipmentId?: string,
  maxAttempts = 3,
  onRetry?: (attempt: number, err: unknown) => Promise<void> | void,
  signer: Ed25519Keypair = getKeypair()
): Promise<{
  digest: string;
  objectChanges: Array<{ type: string; objectId: string; objectType?: string }>;
  effects?: {
    mutated?: Array<{ reference?: OwnedObjectRef }>;
    created?: Array<{ reference?: OwnedObjectRef }>;
    gasObject?: { reference?: OwnedObjectRef };
  };
}> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await executeTransaction(build(), signer);
      if (shipmentId) {
        const metrics = getOrCreateShipmentTxMetrics(shipmentId);
        metrics.mutableTxCount += 1;
        metrics.retryCountTotal += attempt - 1;
        if (attempt > 1) {
          metrics.retryCountByLabel[label] = (metrics.retryCountByLabel[label] ?? 0) + (attempt - 1);
        } else if (!(label in metrics.retryCountByLabel)) {
          metrics.retryCountByLabel[label] = 0;
        }
      }
      return result;
    } catch (err) {
      if (!isRetryableObjectVersionError(err) || attempt === maxAttempts) {
        throw err;
      }
      await onRetry?.(attempt, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { label, attempt, maxAttempts, shipmentId: shipmentId ?? "?", err: errMsg.slice(0, 300) },
        "[sui-retry] Retrying SUI transaction after stale object version"
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  throw new Error(`Unreachable retry path for ${label}`);
}

function getOrCreateShipmentTxMetrics(shipmentId: string): TransactionMetrics {
  let metrics = shipmentTxMetrics.get(shipmentId);
  if (!metrics) {
    metrics = { mutableTxCount: 0, retryCountTotal: 0, retryCountByLabel: {} };
    shipmentTxMetrics.set(shipmentId, metrics);
  }
  return metrics;
}

export function resetSuiTxMetrics(shipmentId: string): void {
  shipmentTxMetrics.delete(shipmentId);
  shipmentMutationState.delete(shipmentId);
}

export function takeSuiTxMetrics(shipmentId: string): TransactionMetrics {
  const metrics = shipmentTxMetrics.get(shipmentId) ?? {
    mutableTxCount: 0,
    retryCountTotal: 0,
    retryCountByLabel: {},
  };
  shipmentTxMetrics.delete(shipmentId);
  shipmentMutationState.delete(shipmentId);
  return metrics;
}

async function waitForTx(digest: string): Promise<void> {
  await getClient().waitForTransaction({ digest });
}

async function getOwnedObjectRef(objectId: string): Promise<OwnedObjectRef> {
  const object = await getClient().getObject({
    id: objectId,
    options: { showOwner: true },
  });
  const data = (object as {
    data?: { objectId?: string; version?: string | number; digest?: string };
  }).data;
  if (!data?.objectId || !data.version || !data.digest) {
    throw new Error(`Could not resolve object ref for ${objectId}`);
  }
  return {
    objectId: data.objectId,
    version: String(data.version),
    digest: data.digest,
  };
}

function findEffectRef(
  effects: {
    mutated?: Array<{ reference?: OwnedObjectRef }>;
    created?: Array<{ reference?: OwnedObjectRef }>;
    gasObject?: { reference?: OwnedObjectRef };
  } | undefined,
  objectId: string
): OwnedObjectRef | null {
  const candidates = [
    ...(effects?.mutated ?? []).map((item) => item.reference).filter(Boolean),
    ...(effects?.created ?? []).map((item) => item.reference).filter(Boolean),
  ] as OwnedObjectRef[];
  return candidates.find((candidate) => candidate.objectId === objectId) ?? null;
}

function getShipmentMutationState(shipmentId: string): ShipmentMutationState {
  let state = shipmentMutationState.get(shipmentId);
  if (!state) {
    state = {};
    shipmentMutationState.set(shipmentId, state);
  }
  return state;
}

function rememberShipmentRefs(
  shipmentId: string,
  recordId: string,
  effects?: {
    mutated?: Array<{ reference?: OwnedObjectRef }>;
    created?: Array<{ reference?: OwnedObjectRef }>;
    gasObject?: { reference?: OwnedObjectRef };
  }
): void {
  const state = getShipmentMutationState(shipmentId);
  const nextRecordRef = findEffectRef(effects, recordId);
  if (nextRecordRef) state.recordRef = nextRecordRef;
  if (effects?.gasObject?.reference) state.gasRef = effects.gasObject.reference;
}

async function resolveRecordRef(shipmentId: string, recordId: string): Promise<OwnedObjectRef> {
  const cached = getShipmentMutationState(shipmentId).recordRef;
  if (cached?.objectId === recordId) {
    return cached;
  }
  const recordRef = await getOwnedObjectRef(recordId);
  getShipmentMutationState(shipmentId).recordRef = recordRef;
  return recordRef;
}

export class RealSuiPassportClient implements SuiPassportClient {
  async primeRecoveredShipmentRecordRef(shipmentId: string, recordId: string): Promise<void> {
    const recordRef = await getOwnedObjectRef(recordId);
    getShipmentMutationState(shipmentId).recordRef = recordRef;
    logger.info({ shipmentId, recordId, version: recordRef.version }, "Seeded recovered ShipmentRecord ref");
  }

  /**
   * Create a ShipmentRecord + DocAccumulator on-chain in one transaction.
   */
  async createShipment(input: {
    shipmentId: string;
    initiator: string;
    importer: string;
    exporter: string;
    template: string;
    manifestDigest: string;
  }): Promise<{ recordId: string; accumulatorId: string; txDigest: string }> {
    const digestBytes = hexToFixedBytes(input.manifestDigest, 32);
    const { digest, objectChanges, effects } = await executeRetriableTransaction("createShipment", () => {
      const tx = new Transaction();
      tx.moveCall({
        target: `${getPackageId()}::shipment_passport::create_shipment`,
        arguments: [
          tx.object(getRegistryId()),
          tx.pure.string(input.shipmentId),
          tx.pure.address(input.initiator),
          tx.pure.address(input.importer),
          tx.pure.address(input.exporter),
          tx.pure.string(input.template),
          tx.pure.vector("u8", digestBytes),
          tx.object("0x6"),
        ],
      });
      return tx;
    }, input.shipmentId);

    let recordId = "";
    let accumulatorId = "";
    for (const change of objectChanges) {
      if (change.type === "created") {
        if (change.objectType?.includes("ShipmentRecord")) recordId = change.objectId;
        if (change.objectType?.includes("DocAccumulator")) accumulatorId = change.objectId;
      }
    }

    if (!recordId || !accumulatorId) {
      throw new Error("Real Sui createShipment succeeded without returning ShipmentRecord and DocAccumulator IDs.");
    }

    rememberShipmentRefs(input.shipmentId, recordId, effects);

    // Wait for indexer to catch up so commitDocumentBatch sees the fresh accumulator version.
    await waitForTx(digest);
    logger.info({ shipmentId: input.shipmentId, recordId, accumulatorId, digest }, "[sui-build] createShipment indexed");

    return { recordId, accumulatorId, txDigest: digest };
  }

  /**
   * Append a per-doc commitment to the DocAccumulator.
   * Called fire-and-forget after each document extraction.
   */
  async commitDocument(
    shipmentId: string,
    docId: string,
    slotKey: string,
    contentHash: string,
    extractionHash: string,
    accumulatorId?: string,
  ): Promise<{ txDigest: string }> {
    if (!accumulatorId) {
      throw new Error("commitDocument requires accumulatorId");
    }

    const toBytes = (hex: string) => hexToFixedBytes(hex, 32);
    const { digest } = await executeRetriableTransaction("commitDocument", () => {
      const tx = new Transaction();
      tx.moveCall({
        target: `${getPackageId()}::shipment_passport::commit_document`,
        arguments: [
          tx.object(getRegistryId()),
          tx.object(accumulatorId),
          tx.pure.string(docId),
          tx.pure.string(slotKey),
          tx.pure.vector("u8", toBytes(contentHash)),
          tx.pure.vector("u8", toBytes(extractionHash)),
          tx.object("0x6"),
        ],
      });
      return tx;
    }, shipmentId);
    return { txDigest: digest };
  }

  /**
   * Batch all document commitments into a single PTB, eliminating inter-commit stale-version errors.
   * Within one PTB the accumulator is mutated N times atomically, so no version mismatch can occur.
   * After success, waits for the indexer so mintPassport sees the final accumulator version.
   */
  async commitDocumentBatch(
    shipmentId: string,
    accumulatorId: string,
    docs: DocCommitInput[],
  ): Promise<{ txDigest: string }> {
    if (docs.length === 0) return { txDigest: "" };

    const toBytes = (hex: string) => hexToFixedBytes(hex, 32);
    logger.info(
      { shipmentId, accumulatorId, docCount: docs.length },
      "[sui-build] commitDocumentBatch starting"
    );

    // DocAccumulator is a shared object — pass by ID (SDK resolves initialSharedVersion).
    const build = () => {
      const tx = new Transaction();
      for (const doc of docs) {
        tx.moveCall({
          target: `${getPackageId()}::shipment_passport::commit_document`,
          arguments: [
            tx.object(getRegistryId()),
            tx.object(accumulatorId),
            tx.pure.string(doc.docId),
            tx.pure.string(doc.slotKey),
            tx.pure.vector("u8", toBytes(doc.contentHash)),
            tx.pure.vector("u8", toBytes(doc.extractionHash)),
            tx.object("0x6"),
          ],
        });
      }
      return tx;
    };

    const { digest } = await executeRetriableTransaction(
      "commitDocumentBatch",
      build,
      shipmentId,
      3,
    );

    // Ensure indexer has caught up before mintPassport builds its TX referencing the accumulator.
    await waitForTx(digest);
    logger.info(
      { shipmentId, accumulatorId, digest, docCount: docs.length },
      "[sui-build] commitDocumentBatch indexed"
    );
    return { txDigest: digest };
  }

  /**
   * mintPassport = finalize_shipment in the new contract.
   * metadata must include recordId, accumulatorId, packageHash, validationHash, verificationScore.
   */
  async mintPassport(input: MintPassportInput): Promise<MintPassportResult> {
    const metadata = input.metadata ?? {};
    const recordId = metadata.recordId ?? "";
    const accumulatorId = metadata.accumulatorId ?? "";
    const packageHash = metadata.packageHash ?? "";
    const validationHash = metadata.validationHash ?? "";
    const verificationScore = parseInt(metadata.verificationScore ?? "85", 10);
    const sealObjectId = metadata.sealObjectId ?? "";
    const encryptedBlobId = metadata.encryptedBlobId ?? "";

    if (!recordId || !accumulatorId) {
      throw new Error(
        "mintPassport (real client): metadata.recordId and metadata.accumulatorId are required. " +
        "Call createShipment() first and store on_chain_record_id / on_chain_accumulator_id."
      );
    }

    const toBytes = (hex: string) => hexToFixedBytes(hex, 32);

    const walrusManifestBlobId = input.walrusBlobIds[0] ?? "";
    const walrusDocBlobIdsJson = JSON.stringify(input.walrusBlobIds.slice(1));

    let recordRef = await resolveRecordRef(input.shipmentId, recordId);
    logger.info(
      { shipmentId: input.shipmentId, recordId, recordVersion: recordRef.version, accumulatorId },
      "[sui-build] mintPassport starting"
    );

    // ShipmentRecord is owned (consumed by value) → Inputs.ObjectRef for exact version match.
    // DocAccumulator is shared → pass by ID (SDK resolves initialSharedVersion).
    const { digest, objectChanges, effects } = await executeRetriableTransaction("mintPassport", () => {
      const tx = new Transaction();
      tx.moveCall({
        target: `${getPackageId()}::shipment_passport::finalize_shipment`,
        arguments: [
          tx.object(getRegistryId()),
          tx.object(Inputs.ObjectRef(recordRef)),
          tx.object(accumulatorId),
          tx.pure.string(walrusManifestBlobId),
          tx.pure.string(walrusDocBlobIdsJson),
          tx.pure.string(input.memWalSpaceId),
          tx.pure.address(input.owner),
          tx.pure.vector("u8", toBytes(packageHash)),
          tx.pure.vector("u8", toBytes(validationHash)),
          tx.pure.u64(verificationScore),
          tx.pure.vector("u8", sealObjectId ? hexToBytes(sealObjectId) : []),
          tx.pure.string(encryptedBlobId),
          tx.object("0x6"),
        ],
      });
      return tx;
    }, input.shipmentId, 3, async (attempt, err) => {
      const freshRecord = await getOwnedObjectRef(recordId);
      logger.warn(
        {
          shipmentId: input.shipmentId,
          attempt,
          err: err instanceof Error ? err.message.slice(0, 200) : String(err),
          oldRecordVersion: recordRef.version, newRecordVersion: freshRecord.version,
        },
        "[sui-retry] mintPassport — refreshed recordRef"
      );
      recordRef = freshRecord;
      getShipmentMutationState(input.shipmentId).recordRef = recordRef;
    });

    let passportId = "";
    let endorsementLogId = "";
    for (const change of objectChanges) {
      if (change.type === "created") {
        if (change.objectType?.includes("ShipmentPassport")) passportId = change.objectId;
        if (change.objectType?.includes("ShipmentEndorsementLog")) endorsementLogId = change.objectId;
      }
    }

    const mintedAt = new Date().toISOString();
    rememberShipmentRefs(input.shipmentId, recordId, effects);
    logger.info({ passportId, endorsementLogId, txDigest: digest }, "ShipmentPassport minted");
    return { passportId, txDigest: digest, mintedAt, endorsementLogId };
  }

  async endorseShipment(input: {
    logObjectId: string;
    role: string;
    action: string;
    noteHash?: string;
  }): Promise<{ txDigest: string }> {
    const tx = new Transaction();
    const noteBytes = input.noteHash ? hexToBytes(input.noteHash) : [];
    tx.moveCall({
      target: `${getPackageId()}::shipment_passport::endorse_shipment`,
      arguments: [
        tx.object(input.logObjectId),
        tx.pure.string(input.role),
        tx.pure.string(input.action),
        tx.pure.vector("u8", noteBytes),
        tx.object("0x6"),
      ],
    });
    const { digest } = await executeTransaction(tx);
    return { txDigest: digest };
  }

  async endorseAsFreightForwarder(input: {
    logObjectId: string;
    capObjectId: string;
    action: string;
    noteHash?: string;
    signerKeypair?: Ed25519Keypair;
  }): Promise<{ txDigest: string }> {
    const tx = new Transaction();
    const noteBytes = input.noteHash ? hexToBytes(input.noteHash) : [];
    tx.moveCall({
      target: `${getPackageId()}::shipment_passport::endorse_as_freight_forwarder`,
      arguments: [
        tx.object(input.logObjectId),
        tx.object(input.capObjectId),
        tx.pure.string(input.action),
        tx.pure.vector("u8", noteBytes),
        tx.object("0x6"),
      ],
    });
    const { digest } = await executeTransaction(tx, input.signerKeypair ?? getKeypair());
    return { txDigest: digest };
  }

  async endorseAsCustoms(input: {
    logObjectId: string;
    capObjectId: string;
    action: string;
    noteHash?: string;
    signerKeypair?: Ed25519Keypair;
  }): Promise<{ txDigest: string }> {
    const tx = new Transaction();
    const noteBytes = input.noteHash ? hexToBytes(input.noteHash) : [];
    tx.moveCall({
      target: `${getPackageId()}::shipment_passport::endorse_as_customs`,
      arguments: [
        tx.object(input.logObjectId),
        tx.object(input.capObjectId),
        tx.pure.string(input.action),
        tx.pure.vector("u8", noteBytes),
        tx.object("0x6"),
      ],
    });
    const { digest } = await executeTransaction(tx, input.signerKeypair ?? getKeypair());
    return { txDigest: digest };
  }

  async grantRole(input: {
    passportObjectId: string;
    role: "freight_forwarder" | "customs";
    granteeAddress: string;
  }): Promise<{ txDigest: string; capObjectId: string }> {
    const target = input.role === "freight_forwarder"
      ? `${getPackageId()}::shipment_passport::grant_freight_forwarder_role`
      : `${getPackageId()}::shipment_passport::grant_customs_role`;
    const tx = new Transaction();
    tx.moveCall({
      target,
      arguments: [
        tx.object(input.passportObjectId),
        tx.pure.address(input.granteeAddress),
      ],
    });
    const { digest, objectChanges } = await executeTransaction(tx);
    let capObjectId = "";
    for (const change of objectChanges) {
      if (change.type === "created" &&
          (change.objectType?.includes("FreightForwarderCap") ||
           change.objectType?.includes("CustomsCap"))) {
        capObjectId = change.objectId;
        break;
      }
    }
    return { txDigest: digest, capObjectId };
  }

  async getEndorsementLog(logObjectId: string): Promise<{
    passportId: string;
    shipmentId: string;
    importer: string;
    exporter: string;
    endorsements: Array<{ role: string; signer: string; action: string; noteHash: string; signedAtMs: number }>;
  }> {
    const client = getClient();
    const obj = await client.getObject({ id: logObjectId, options: { showContent: true } });
    const content = (obj as { data?: { content?: { dataType?: string; fields?: Record<string, unknown> } } })
      .data?.content;
    if (!content || content.dataType !== "moveObject" || !content.fields) {
      throw new Error(`EndorsementLog not found: ${logObjectId}`);
    }
    const f = content.fields;
    const rawEndorsements = (f.endorsements as Array<{ fields: Record<string, unknown> }>) ?? [];
    return {
      passportId: f.passport_id as string,
      shipmentId: f.shipment_id as string,
      importer: f.importer as string,
      exporter: f.exporter as string,
      endorsements: rawEndorsements.map((e) => ({
        role: e.fields.role as string,
        signer: e.fields.signer as string,
        action: e.fields.action as string,
        noteHash: Buffer.from((e.fields.note_hash as number[]) ?? []).toString("hex"),
        signedAtMs: Number(e.fields.signed_at_ms),
      })),
    };
  }

  async getPassport(passportId: string): Promise<PassportRecord> {
    const client = getClient();
    const obj = await client.getObject({
      id: passportId,
      options: { showContent: true },
    });

    const content = (obj as { data?: { content?: { dataType?: string; fields?: Record<string, unknown> } } })
      .data?.content;
    if (!content || content.dataType !== "moveObject" || !content.fields) {
      throw new Error(`Passport not found or wrong type: ${passportId}`);
    }

    const f = content.fields;
    return {
      passportId,
      owner: f.owner as string,
      shipmentId: f.shipment_id as string,
      memWalSpaceId: f.memwal_space_id as string,
      walrusBlobIds: (f.walrus_blob_ids as string[]) ?? [],
      manifestHash: Buffer.from((f.package_hash as number[]) ?? []).toString("hex"),
      grants: [],
      mintedAt: new Date(Number(f.created_at_ms)).toISOString(),
      txDigest: passportId,
    };
  }

  async grantAccess(_input: GrantAccessInput): Promise<GrantAccessResult> {
    throw new Error("On-chain grantAccess not implemented. Use mock client.");
  }

  async revokeAccess(_input: RevokeAccessInput): Promise<{ txDigest: string }> {
    throw new Error("On-chain revokeAccess not implemented. Use mock client.");
  }

  async listGrants(_passportId: string): Promise<Grant[]> {
    return [];
  }

  async transferPassport(input: TransferPassportInput): Promise<{ txDigest: string }> {
    const tx = new Transaction();
    tx.transferObjects(
      [tx.object(input.passportId)],
      tx.pure.address(input.toAddress)
    );
    const { digest } = await executeTransaction(tx);
    return { txDigest: digest };
  }

  async checkScope(
    _requestorAddress: string,
    _passportId: string,
    _scope: MemWalAccessScope
  ): Promise<boolean> {
    return false;
  }
}
