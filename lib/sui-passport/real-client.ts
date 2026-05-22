import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import pino from "pino";
import type {
  SuiPassportClient,
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
  if (key.startsWith("suiprivkey")) {
    return Ed25519Keypair.fromSecretKey(key);
  }
  const bytes = Buffer.from(key.replace(/^0x/, ""), "hex");
  if (bytes.length !== 32) {
    throw new Error("SUI_PRIVATE_KEY must be 32 bytes hex or a bech32 suiprivkey");
  }
  return Ed25519Keypair.fromSecretKey(bytes);
}

function getClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  } as ConstructorParameters<typeof SuiJsonRpcClient>[0]);
}

async function executeTransaction(tx: Transaction): Promise<{
  digest: string;
  objectChanges: Array<{ type: string; objectId: string; objectType?: string }>;
}> {
  const client = getClient();
  const keypair = getKeypair();

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
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
  return { digest: result.digest, objectChanges };
}

export class RealSuiPassportClient implements SuiPassportClient {
  /**
   * Create a ShipmentRecord + DocAccumulator on-chain in one transaction.
   */
  async createShipment(input: {
    shipmentId: string;
    importer: string;
    exporter: string;
    template: string;
    manifestDigest: string;
  }): Promise<{ recordId: string; accumulatorId: string; txDigest: string }> {
    const tx = new Transaction();
    const digestBytes = Array.from(Buffer.from(
      input.manifestDigest.replace(/^0x/, "").padStart(64, "0"),
      "hex"
    ));

    tx.moveCall({
      target: `${getPackageId()}::shipment_passport::create_shipment`,
      arguments: [
        tx.object(getRegistryId()),
        tx.pure.string(input.shipmentId),
        tx.pure.address(input.importer),
        tx.pure.address(input.exporter),
        tx.pure.string(input.template),
        tx.pure(new Uint8Array(digestBytes)),
        tx.object("0x6"),
      ],
    });

    const { digest, objectChanges } = await executeTransaction(tx);

    let recordId = "";
    let accumulatorId = "";
    for (const change of objectChanges) {
      if (change.type === "created") {
        if (change.objectType?.includes("ShipmentRecord")) recordId = change.objectId;
        if (change.objectType?.includes("DocAccumulator")) accumulatorId = change.objectId;
      }
    }

    return { recordId, accumulatorId, txDigest: digest };
  }

  /**
   * Append a per-doc commitment to the DocAccumulator.
   * Called fire-and-forget after each document extraction.
   */
  async commitDocument(
    _shipmentId: string,
    docId: string,
    slotKey: string,
    contentHash: string,
    extractionHash: string,
    recordId?: string,
    accumulatorId?: string,
  ): Promise<{ txDigest: string }> {
    if (!recordId || !accumulatorId) {
      throw new Error("commitDocument requires recordId and accumulatorId");
    }

    const tx = new Transaction();

    const toBytes = (hex: string) =>
      new Uint8Array(Buffer.from(hex.replace(/^0x/, "").padStart(64, "0"), "hex"));

    tx.moveCall({
      target: `${getPackageId()}::shipment_passport::commit_document`,
      arguments: [
        tx.object(recordId),
        tx.object(accumulatorId),
        tx.pure.string(docId),
        tx.pure.string(slotKey),
        tx.pure(toBytes(contentHash)),
        tx.pure(toBytes(extractionHash)),
        tx.object("0x6"),
      ],
    });

    const { digest } = await executeTransaction(tx);
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

    if (!recordId || !accumulatorId) {
      throw new Error(
        "mintPassport (real client): metadata.recordId and metadata.accumulatorId are required. " +
        "Call createShipment() first and store on_chain_record_id / on_chain_accumulator_id."
      );
    }

    const toBytes = (hex: string) =>
      new Uint8Array(Buffer.from(hex.replace(/^0x/, "").padStart(64, "0"), "hex"));

    const walrusManifestBlobId = input.walrusBlobIds[0] ?? "";
    const walrusDocBlobIdsJson = JSON.stringify(input.walrusBlobIds.slice(1));

    const tx = new Transaction();
    tx.moveCall({
      target: `${getPackageId()}::shipment_passport::finalize_shipment`,
      arguments: [
        tx.object(getRegistryId()),
        tx.object(recordId),
        tx.object(accumulatorId),
        tx.pure.string(walrusManifestBlobId),
        tx.pure.string(walrusDocBlobIdsJson),
        tx.pure.string(input.memWalSpaceId),
        tx.pure(toBytes(packageHash)),
        tx.pure(toBytes(validationHash)),
        tx.pure.u64(verificationScore),
        tx.object("0x6"),
      ],
    });

    const { digest, objectChanges } = await executeTransaction(tx);

    let passportId = "";
    for (const change of objectChanges) {
      if (change.type === "created" && change.objectType?.includes("ShipmentPassport")) {
        passportId = change.objectId;
        break;
      }
    }

    const mintedAt = new Date().toISOString();
    logger.info({ passportId, txDigest: digest }, "ShipmentPassport minted");
    return { passportId, txDigest: digest, mintedAt };
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
