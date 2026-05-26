import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import pino from "pino";
import { canonicalJson } from "./canonical-json";
import { getDb } from "./db";
import {
  getShipmentById,
  resetShipmentOnChainBootstrapState,
  updateShipmentOnChainPointers,
} from "./shipments-server";
import {
  markShipmentFileCommitmentCommitted,
  markShipmentFileCommitmentFailed,
  markShipmentFileCommitmentInFlight,
} from "./shipment-file-commitments";
import type { DocCommitInput } from "./sui-passport/types";
import { getSuiPassportClient } from "./sui-passport";
import { parseEd25519Keypair } from "./sui-keypair";

const logger = pino({ name: "real-sui-bootstrap" });

function getServerAddress(): string {
  const key = process.env.SUI_PRIVATE_KEY;
  if (!key) throw new Error("SUI_PRIVATE_KEY not set");
  return parseEd25519Keypair(key).toSuiAddress();
}

type BootstrapResult = {
  templateId: string;
  onChainRecordId: string;
  onChainAccumulatorId: string;
  onChainPackageId: string;
  onChainNetwork: string;
};

type AggregateRow = { aggregate_json: string };
type ShipmentChainRow = {
  template_id: string | null;
  on_chain_record_id: string | null;
  on_chain_accumulator_id: string | null;
  on_chain_package_id: string | null;
  on_chain_network: string | null;
  passport_id: string | null;
  tx_digest: string | null;
};

type CommitDocRow = {
  id: string;
  sha256: string;
  slot_key: string | null;
  doc_type: string | null;
  on_chain_commitment_tx: string | null;
  on_chain_commitment_status: "pending" | "in_flight" | "committed" | "failed" | null;
  extraction_json: string | null;
};

type RegistryTableObject = {
  data?: {
    content?: {
      fields?: {
        shipments?: {
          fields?: {
            id?: { id?: string };
          };
        };
      };
    };
  };
};

type DynamicFieldObject = {
  error?: {
    code?: string;
    parent_object_id?: string;
  };
  data?: {
    previousTransaction?: string;
    content?: {
      fields?: {
        value?: string;
      };
    };
  };
};

type RecoveryResult = {
  recordId: string;
  accumulatorId: string;
  sourceTxDigest: string;
  registryTableId: string;
};

function getPackageId(): string {
  const packageId = process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID;
  if (!packageId || !packageId.startsWith("0x") || packageId.includes("TODO")) {
    throw new Error("NEXT_PUBLIC_SUISHIP_PACKAGE_ID must point to a published package in real mode.");
  }
  return packageId;
}

function getNetwork(): "testnet" | "mainnet" | "devnet" | "localnet" {
  return (process.env.SUI_NETWORK ?? "testnet") as "testnet" | "mainnet" | "devnet" | "localnet";
}

function getRegistryId(): string {
  const registryId = process.env.NEXT_PUBLIC_REGISTRY_ID;
  if (!registryId || !registryId.startsWith("0x") || registryId.includes("TODO")) {
    throw new Error("NEXT_PUBLIC_REGISTRY_ID must point to a published registry in real mode.");
  }
  return registryId;
}

function getRpcClient(): SuiJsonRpcClient {
  const network = getNetwork();
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network,
  } as ConstructorParameters<typeof SuiJsonRpcClient>[0]);
}

function ensureRealSuiEnv(): string {
  if (process.env.SUI_CLIENT !== "real") {
    throw new Error("Real Sui bootstrap called while SUI_CLIENT is not set to real.");
  }
  if (!process.env.SUI_PRIVATE_KEY) {
    throw new Error("SUI_PRIVATE_KEY is required for real Sui mode.");
  }
  if (!process.env.NEXT_PUBLIC_REGISTRY_ID) {
    throw new Error("NEXT_PUBLIC_REGISTRY_ID is required for real Sui mode.");
  }
  return getPackageId();
}

function isMockPassportReference(value?: string | null): boolean {
  return Boolean(value && (value.startsWith("0xmock_") || value.startsWith("0xmocktx_") || value.startsWith("mock_")));
}

function inferTemplateId(transportMode: string, incoterm: string): string {
  const mode = transportMode.trim().toLowerCase();
  const term = incoterm.trim().toUpperCase();

  if (mode === "air") return "air";
  if (mode === "sea" && term === "FOB") return "sea-fob";
  if (mode === "sea" && term === "CIF") return "sea-cif";

  throw new Error(
    `Cannot derive shipment template for transport mode "${transportMode}" and incoterm "${incoterm}". Set a supported combination before real minting.`
  );
}

function deriveCounterpartyAddress(seed: string, primary: string): string {
  const normalizedPrimary = primary.toLowerCase().replace(/^0x/, "");
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 64);
  if (hash !== normalizedPrimary) {
    return `0x${hash}`;
  }
  return `0x${createHash("sha256").update(`${seed}:alt`).digest("hex").slice(0, 64)}`;
}

function buildManifestDigest(shipmentId: string, db: Database.Database): string {
  const shipment = getShipmentById(shipmentId);
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found during on-chain bootstrap.`);

  const latestRun = db.prepare(
    `SELECT aggregate_json FROM extraction_runs
     WHERE shipment_id = ? AND is_superseded = 0
     ORDER BY created_at DESC LIMIT 1`
  ).get(shipmentId) as AggregateRow | undefined;

  const aggregateJson = latestRun ? JSON.parse(latestRun.aggregate_json) : null;
  const digestPayload = {
    shipmentId: shipment.id,
    createdBy: shipment.createdBy,
    shipment: shipment.shipment,
    cargo: shipment.cargo,
    documents: shipment.documents.map((doc) => ({
      name: doc.name,
      owner: doc.owner,
      required: doc.required,
      uploaded: doc.uploaded,
      fileName: doc.fileName ?? null,
    })),
    aggregate: aggregateJson,
  };

  return createHash("sha256").update(canonicalJson(digestPayload)).digest("hex");
}

async function getObjectType(id: string): Promise<string | null> {
  const object = await getRpcClient().getObject({
    id,
    options: { showType: true },
  });

  const data = (object as { data?: { type?: string } }).data;
  return data?.type ?? null;
}

async function getRegistryTableId(): Promise<string> {
  const registry = await getRpcClient().getObject({
    id: getRegistryId(),
    options: { showContent: true, showType: true },
  });

  const tableId = (registry as RegistryTableObject).data?.content?.fields?.shipments?.fields?.id?.id;
  if (!tableId) {
    throw new Error("Could not resolve shipments table ID from ShipmentRegistry.");
  }
  return tableId;
}

async function waitForSharedAccumulatorVisible(
  accumulatorId: string,
  packageId: string,
  shipmentId: string
): Promise<void> {
  const expectedType = `${packageId}::shipment_passport::DocAccumulator`;
  const maxAttempts = 15;
  const baseDelayMs = 300;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const type = await getObjectType(accumulatorId);
    if (type === expectedType) {
      logger.info({ shipmentId, accumulatorId, attempt }, "DocAccumulator visible on RPC");
      return;
    }
    if (attempt === maxAttempts) {
      throw new Error(
        `DocAccumulator ${accumulatorId} for ${shipmentId} not visible on RPC after ${maxAttempts} attempts.`
      );
    }
    await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
  }
}

async function validateRecoveredBootstrapState(
  shipmentId: string,
  recordId: string,
  accumulatorId: string,
  packageId: string
): Promise<void> {
  const expectedPrefix = `${packageId}::shipment_passport::`;
  const [recordType, accumulatorType] = await Promise.all([
    getObjectType(recordId),
    getObjectType(accumulatorId),
  ]);

  if (recordType !== `${expectedPrefix}ShipmentRecord`) {
    throw new Error(
      `Recovered ShipmentRecord ${recordId} for ${shipmentId} does not match active package ${packageId}.`
    );
  }
  if (accumulatorType !== `${expectedPrefix}DocAccumulator`) {
    throw new Error(
      `Recovered DocAccumulator ${accumulatorId} for ${shipmentId} does not match active package ${packageId}.`
    );
  }
}

function isDuplicateShipmentCreateError(err: unknown, packageId: string): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("abort code: 5") &&
    message.includes(`${packageId}::shipment_passport::create_shipment`)
  );
}

async function recoverExistingOnChainShipment(
  shipmentId: string,
  packageId: string
): Promise<RecoveryResult | null> {
  const client = getRpcClient();
  const registryTableId = await getRegistryTableId();

  let dynamicField;
  try {
    dynamicField = await client.getDynamicFieldObject({
      parentId: registryTableId,
      name: {
        type: "0x1::string::String",
        value: shipmentId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|dynamic field/i.test(message)) {
      return null;
    }
    throw err;
  }

  if ((dynamicField as DynamicFieldObject).error?.code === "dynamicFieldNotFound") {
    return null;
  }

  const fieldData = (dynamicField as DynamicFieldObject).data;
  const recordId = fieldData?.content?.fields?.value;
  const sourceTxDigest = fieldData?.previousTransaction;
  if (!recordId || !sourceTxDigest) {
    throw new Error(`Recovered registry entry for ${shipmentId} is missing record ID or source transaction.`);
  }

  const tx = await client.getTransactionBlock({
    digest: sourceTxDigest,
    options: { showEvents: true, showObjectChanges: true, showInput: true },
  });

  const shipmentCreatedEvent = ((tx as { events?: Array<{ type?: string; parsedJson?: Record<string, unknown> }> }).events ?? [])
    .find((event) =>
      event.type === `${packageId}::shipment_passport::ShipmentCreated` &&
      event.parsedJson?.shipment_id === shipmentId
    );

  if (!shipmentCreatedEvent) {
    throw new Error(`Could not find ShipmentCreated event for ${shipmentId} in recovery tx ${sourceTxDigest}.`);
  }

  const createdPayload = shipmentCreatedEvent.parsedJson ?? {};
  const accumulatorId = typeof createdPayload.accumulator_id === "string" ? createdPayload.accumulator_id : "";
  const eventRecordId = typeof createdPayload.record_id === "string" ? createdPayload.record_id : "";

  if (!accumulatorId || !eventRecordId) {
    throw new Error(`ShipmentCreated event for ${shipmentId} is missing record_id or accumulator_id.`);
  }
  if (eventRecordId !== recordId) {
    throw new Error(
      `Registry record ID ${recordId} does not match ShipmentCreated record ID ${eventRecordId} for ${shipmentId}.`
    );
  }

  return {
    recordId,
    accumulatorId,
    sourceTxDigest,
    registryTableId,
  };
}

async function reconcileStoredBootstrapState(
  shipmentId: string,
  templateId: string,
  existing: ShipmentChainRow,
  packageId: string,
  network: string,
): Promise<{
  status: "ready" | "reset";
  recordId?: string;
  accumulatorId?: string;
  packageId?: string;
  network?: string;
}> {
  if (!existing.on_chain_record_id || !existing.on_chain_accumulator_id) {
    return { status: "reset" };
  }

  const hasFinalizedState = Boolean(existing.passport_id || existing.tx_digest);
  const packageMismatch =
    Boolean(existing.on_chain_package_id) && existing.on_chain_package_id !== packageId;
  const networkMismatch =
    Boolean(existing.on_chain_network) && existing.on_chain_network !== network;

  if (packageMismatch || networkMismatch) {
    if (hasFinalizedState) {
      throw new Error(
        "Stored on-chain shipment state belongs to a different Sui package or network. " +
        "Create a fresh shipment before minting again."
      );
    }
    resetShipmentOnChainBootstrapState(shipmentId);
    return { status: "reset" };
  }

  const [recordType, accumulatorType] = await Promise.all([
    getObjectType(existing.on_chain_record_id),
    getObjectType(existing.on_chain_accumulator_id),
  ]);

  const expectedPrefix = `${packageId}::shipment_passport::`;
  const recordValid = recordType === `${expectedPrefix}ShipmentRecord`;
  const accumulatorValid = accumulatorType === `${expectedPrefix}DocAccumulator`;

  if (!recordValid || !accumulatorValid) {
    if (hasFinalizedState) {
      throw new Error(
        "Stored on-chain shipment objects are missing or no longer match the active package. " +
        "Create a fresh shipment before minting again."
      );
    }
    resetShipmentOnChainBootstrapState(shipmentId);
    return { status: "reset" };
  }

  if (!existing.on_chain_package_id || !existing.on_chain_network) {
    updateShipmentOnChainPointers(shipmentId, {
      templateId,
      onChainRecordId: existing.on_chain_record_id,
      onChainAccumulatorId: existing.on_chain_accumulator_id,
      onChainPackageId: packageId,
      onChainNetwork: network,
    });
  }

  return {
    status: "ready",
    recordId: existing.on_chain_record_id,
    accumulatorId: existing.on_chain_accumulator_id,
    packageId: existing.on_chain_package_id ?? packageId,
    network: existing.on_chain_network ?? network,
  };
}

export async function ensureOnChainShipmentInitialized(
  shipmentId: string,
  ownerAddress: string,
  db: Database.Database = getDb()
): Promise<BootstrapResult> {
  const packageId = ensureRealSuiEnv();
  const network = getNetwork();
  const shipmentRecord = getShipmentById(shipmentId);

  const existing = db.prepare(
    `SELECT template_id, on_chain_record_id, on_chain_accumulator_id, on_chain_package_id, on_chain_network, passport_id, tx_digest
     FROM shipments WHERE id = ?`
  ).get(shipmentId) as ShipmentChainRow | undefined;

  if (!existing) {
    throw new Error(`Shipment ${shipmentId} not found.`);
  }

  if (isMockPassportReference(existing.passport_id) || isMockPassportReference(existing.tx_digest)) {
    throw new Error("This shipment was minted in mock mode. Create a fresh shipment before using real Sui mode.");
  }

  const templateId = existing.template_id ?? (() => {
    if (!shipmentRecord) throw new Error(`Shipment ${shipmentId} not found.`);
    return inferTemplateId(shipmentRecord.shipment.transportMode, shipmentRecord.shipment.incoterm);
  })();

  if (existing.on_chain_record_id && existing.on_chain_accumulator_id) {
    const reconciled = await reconcileStoredBootstrapState(shipmentId, templateId, existing, packageId, network);
    if (reconciled.status === "ready" && reconciled.recordId && reconciled.accumulatorId) {
      return {
        templateId,
        onChainRecordId: reconciled.recordId,
        onChainAccumulatorId: reconciled.accumulatorId,
        onChainPackageId: reconciled.packageId ?? packageId,
        onChainNetwork: reconciled.network ?? network,
      };
    }
  }

  const shipment = shipmentRecord;
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found.`);
  const client = getSuiPassportClient();

  const recovered = await recoverExistingOnChainShipment(shipmentId, packageId);
  if (recovered) {
    await validateRecoveredBootstrapState(shipmentId, recovered.recordId, recovered.accumulatorId, packageId);
    if (typeof client.primeRecoveredShipmentRecordRef === "function") {
      await client.primeRecoveredShipmentRecordRef(shipmentId, recovered.recordId);
    }
    updateShipmentOnChainPointers(shipmentId, {
      templateId,
      onChainRecordId: recovered.recordId,
      onChainAccumulatorId: recovered.accumulatorId,
      onChainPackageId: packageId,
      onChainNetwork: network,
    });
    logger.info({
      shipmentId,
      recoveryMode: "registry_recovered",
      recordId: recovered.recordId,
      accumulatorId: recovered.accumulatorId,
      recoverySourceTxDigest: recovered.sourceTxDigest,
      registryTableId: recovered.registryTableId,
    }, "Recovered on-chain shipment bootstrap state from registry");
    return {
      templateId,
      onChainRecordId: recovered.recordId,
      onChainAccumulatorId: recovered.accumulatorId,
      onChainPackageId: packageId,
      onChainNetwork: network,
    };
  }

  const manifestDigest = buildManifestDigest(shipmentId, db);
  const serverAddr = getServerAddress();
  const counterpartyAddress = deriveCounterpartyAddress(`${shipmentId}:${shipment.workflow}`, serverAddr);
  const importerAddress = shipment.workflow === "importer" ? serverAddr : counterpartyAddress;
  const exporterAddress = shipment.workflow === "exporter" ? serverAddr : counterpartyAddress;

  if (typeof client.createShipment !== "function") {
    throw new Error("Real Sui client does not implement createShipment().");
  }

  let created;
  try {
    created = await client.createShipment({
      shipmentId,
      initiator: serverAddr,
      importer: importerAddress,
      exporter: exporterAddress,
      template: templateId,
      manifestDigest,
    });
  } catch (err) {
    if (!isDuplicateShipmentCreateError(err, packageId)) {
      throw err;
    }

    const recoveredAfterDuplicate = await recoverExistingOnChainShipment(shipmentId, packageId);
    if (!recoveredAfterDuplicate) {
      throw new Error(
        `create_shipment reported duplicate shipment ${shipmentId}, but bootstrap recovery could not find the existing on-chain record.`
      );
    }
    await validateRecoveredBootstrapState(
      shipmentId,
      recoveredAfterDuplicate.recordId,
      recoveredAfterDuplicate.accumulatorId,
      packageId
    );
    if (typeof client.primeRecoveredShipmentRecordRef === "function") {
      await client.primeRecoveredShipmentRecordRef(shipmentId, recoveredAfterDuplicate.recordId);
    }
    updateShipmentOnChainPointers(shipmentId, {
      templateId,
      onChainRecordId: recoveredAfterDuplicate.recordId,
      onChainAccumulatorId: recoveredAfterDuplicate.accumulatorId,
      onChainPackageId: packageId,
      onChainNetwork: network,
    });
    logger.info({
      shipmentId,
      recoveryMode: "registry_recovered_after_duplicate",
      recordId: recoveredAfterDuplicate.recordId,
      accumulatorId: recoveredAfterDuplicate.accumulatorId,
      recoverySourceTxDigest: recoveredAfterDuplicate.sourceTxDigest,
      registryTableId: recoveredAfterDuplicate.registryTableId,
    }, "Recovered on-chain shipment bootstrap state after duplicate create_shipment");
    return {
      templateId,
      onChainRecordId: recoveredAfterDuplicate.recordId,
      onChainAccumulatorId: recoveredAfterDuplicate.accumulatorId,
      onChainPackageId: packageId,
      onChainNetwork: network,
    };
  }

  if (!created.recordId || !created.accumulatorId) {
    throw new Error("Real Sui createShipment succeeded without returning ShipmentRecord and DocAccumulator IDs.");
  }

  await waitForSharedAccumulatorVisible(created.accumulatorId, packageId, shipmentId);

  updateShipmentOnChainPointers(shipmentId, {
    templateId,
    onChainRecordId: created.recordId,
    onChainAccumulatorId: created.accumulatorId,
    onChainPackageId: packageId,
    onChainNetwork: network,
  });

  return {
    templateId,
    onChainRecordId: created.recordId,
    onChainAccumulatorId: created.accumulatorId,
    onChainPackageId: packageId,
    onChainNetwork: network,
  };
}

export async function backfillOnChainDocumentCommitments(
  shipmentId: string,
  initialized: BootstrapResult,
  db: Database.Database = getDb()
): Promise<void> {
  if (process.env.SUI_CLIENT !== "real") return;

  const client = getSuiPassportClient();
  if (typeof client.commitDocumentBatch !== "function") {
    throw new Error("Real Sui client does not implement commitDocumentBatch().");
  }

  const rows = db.prepare(
    `SELECT sf.id, sf.sha256, sf.slot_key, sf.doc_type, sf.on_chain_commitment_tx,
            sf.on_chain_commitment_status, fc.extraction_json
     FROM shipment_files sf
     LEFT JOIN file_cache fc ON fc.sha256 = sf.sha256
     WHERE sf.shipment_id = ? AND sf.state IN ('validated', 'committed')
     ORDER BY sf.uploaded_at ASC`
  ).all(shipmentId) as CommitDocRow[];

  const uncommitted = rows.filter(
    (row) => !(row.on_chain_commitment_status === "committed" && row.on_chain_commitment_tx)
  );
  if (uncommitted.length === 0) return;

  for (const row of uncommitted) {
    if (!row.extraction_json) {
      throw new Error(`Cannot backfill on-chain commitment for file ${row.id}: extraction JSON is missing.`);
    }
  }

  const docs: DocCommitInput[] = uncommitted.map((row) => ({
    docId: row.id,
    slotKey: row.slot_key ?? row.doc_type ?? "document",
    contentHash: row.sha256,
    extractionHash: createHash("sha256").update(row.extraction_json!).digest("hex"),
  }));

  uncommitted.forEach((row) => markShipmentFileCommitmentInFlight(row.id));

  try {
    const { txDigest } = await client.commitDocumentBatch(
      shipmentId,
      initialized.onChainAccumulatorId,
      docs,
    );
    uncommitted.forEach((row) => markShipmentFileCommitmentCommitted(row.id, txDigest));
    logger.info(
      { shipmentId, accumulatorId: initialized.onChainAccumulatorId, txDigest, docCount: uncommitted.length },
      "backfillOnChainDocumentCommitments: batch committed"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    uncommitted.forEach((row) => markShipmentFileCommitmentFailed(row.id, message));
    throw err;
  }
}
