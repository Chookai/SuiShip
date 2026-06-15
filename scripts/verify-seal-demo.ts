import { parseEd25519Keypair } from "@/lib/sui-keypair";

type ShipmentRow = {
  id: string;
  passport_id: string | null;
  endorsement_log_object_id: string | null;
  encrypted_walrus_blob_id: string | null;
  on_chain_accumulator_id: string | null;
  seal_object_id: string | null;
};

type ProvenanceResponse = {
  answer: string;
  evidence: Array<{ label: string; value: string }>;
  authorized: boolean;
  decryptionSucceeded: boolean;
};

const loadEnvFile = (process as typeof process & { loadEnvFile?: (path?: string) => void }).loadEnvFile;
for (const file of [".env.local", ".env"]) {
  try {
    loadEnvFile?.(file);
  } catch (err) {
    if (!(err instanceof Error) || !("code" in err) || err.code !== "ENOENT") {
      throw err;
    }
  }
}

const DEFAULT_BASE_URL = process.env.SUISHIP_BASE_URL ?? "http://127.0.0.1:3000";
const DEFAULT_SHIPMENT_ID = process.env.DEMO_SHIPMENT_ID ?? "SS-EXP-451766";

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function isSealAccessDenied(err: unknown): boolean {
  return err instanceof Error && (
    err.name === "NoAccessError" ||
    err.message.includes("does not have access")
  );
}

function isExpiredSessionKeyError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Session key has expired");
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    fail(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
  }
  return payload as T;
}

function getTargetShipment(
  shipmentId: string,
  getDb: typeof import("@/lib/db").getDb,
): ShipmentRow {
  const row = getDb().prepare(
    `SELECT id, passport_id, endorsement_log_object_id, encrypted_walrus_blob_id,
            on_chain_accumulator_id, seal_object_id
     FROM shipments WHERE id = ?`
  ).get(shipmentId) as ShipmentRow | undefined;
  if (!row) fail(`Shipment not found in SQLite: ${shipmentId}`);
  if (!row.passport_id || !row.endorsement_log_object_id || !row.encrypted_walrus_blob_id) {
    fail(`Shipment ${shipmentId} is missing passport, endorsement log, or encrypted Walrus refs`);
  }
  return row;
}

async function expectSealNoAccess(
  shipment: ShipmentRow,
  requesterSecret: string,
  decryptPrivateManifest: typeof import("@/lib/seal-client").decryptPrivateManifest,
  objectIdToSealId: typeof import("@/lib/seal-client").objectIdToSealId,
  resolveSealEncryptionObjectId: typeof import("@/lib/seal-client").resolveSealEncryptionObjectId,
) {
  const requesterKeypair = parseEd25519Keypair(requesterSecret);
  const accumulatorId = shipment.on_chain_accumulator_id ?? shipment.seal_object_id;
  assert(accumulatorId, "Shipment is missing accumulator/seal object ID");
  const encryptionObjectId = await resolveSealEncryptionObjectId({
    accumulatorId,
    endorsementLogId: shipment.endorsement_log_object_id!,
    sealObjectId: shipment.seal_object_id,
  });

  try {
    await decryptPrivateManifest(
      shipment.encrypted_walrus_blob_id!,
      accumulatorId,
      shipment.endorsement_log_object_id!,
      objectIdToSealId(encryptionObjectId),
      requesterKeypair,
    );
    fail("Expected SEAL key servers to deny the requester before endorsement");
  } catch (err) {
    if (!isSealAccessDenied(err)) {
      throw err;
    }
  }
}

async function expectSealSuccess(
  shipment: ShipmentRow,
  requesterSecret: string,
  decryptPrivateManifest: typeof import("@/lib/seal-client").decryptPrivateManifest,
  objectIdToSealId: typeof import("@/lib/seal-client").objectIdToSealId,
  resolveSealEncryptionObjectId: typeof import("@/lib/seal-client").resolveSealEncryptionObjectId,
) {
  const requesterKeypair = parseEd25519Keypair(requesterSecret);
  const accumulatorId = shipment.on_chain_accumulator_id ?? shipment.seal_object_id;
  assert(accumulatorId, "Shipment is missing accumulator/seal object ID");
  const encryptionObjectId = await resolveSealEncryptionObjectId({
    accumulatorId,
    endorsementLogId: shipment.endorsement_log_object_id!,
    sealObjectId: shipment.seal_object_id,
  });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const plaintext = await decryptPrivateManifest(
        shipment.encrypted_walrus_blob_id!,
        accumulatorId,
        shipment.endorsement_log_object_id!,
        objectIdToSealId(encryptionObjectId),
        requesterKeypair,
      );
      assert(plaintext.length > 0, "SEAL decrypt succeeded but returned empty plaintext");
      return;
    } catch (err) {
      if (!isExpiredSessionKeyError(err) || attempt === 2) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

async function main() {
  const [{ getDb }, { answerProvenanceQuestion }, sealClient, { getSuiPassportClient }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/agents/provenance-agent"),
    import("@/lib/seal-client"),
    import("@/lib/sui-passport"),
  ]);
  const { decryptPrivateManifest, objectIdToSealId, resolveSealEncryptionObjectId } = sealClient;
  const shipmentId = process.argv[2] ?? DEFAULT_SHIPMENT_ID;
  const demoKeyHex = process.env.DEMO_KEYPAIR_HEX;
  if (!demoKeyHex) fail("DEMO_KEYPAIR_HEX is not set");

  const requesterKeypair = parseEd25519Keypair(demoKeyHex);
  const requesterAddress = requesterKeypair.toSuiAddress();
  const shipment = getTargetShipment(shipmentId, getDb);

  const log = await getSuiPassportClient().getEndorsementLog(shipment.endorsement_log_object_id!);
  assert(
    requesterAddress !== log.importer && requesterAddress !== log.exporter,
    `Demo requester ${requesterAddress} is already importer/exporter on ${shipmentId}`,
  );

  console.log(`Shipment: ${shipmentId}`);
  console.log(`Requester: ${requesterAddress}`);
  console.log("Step 1: confirming direct SEAL denial before endorsement...");
  await expectSealNoAccess(
    shipment,
    demoKeyHex,
    decryptPrivateManifest,
    objectIdToSealId,
    resolveSealEncryptionObjectId,
  );

  console.log("Step 2: confirming HTTP provenance denial before endorsement...");
  const denied = await postJson<ProvenanceResponse>(
    `/api/shipments/${encodeURIComponent(shipmentId)}/provenance`,
    {
      requesterAddress,
      requesterKeyHex: demoKeyHex,
      question: "What is the cargo?",
    },
  );
  assert(denied.authorized === false, "Expected provenance to deny the requester before endorsement");
  assert(denied.decryptionSucceeded === false, "Expected decryptionSucceeded=false before endorsement");

  console.log("Step 3: granting freight_forwarder role...");
  const grant = await postJson<{ capObjectId: string }>(
    `/api/shipments/${encodeURIComponent(shipmentId)}/passport/grant-role`,
    {
      role: "freight_forwarder",
      granteeAddress: requesterAddress,
    },
  );
  assert(grant.capObjectId, "grant-role did not return capObjectId");

  console.log("Step 4: endorsing as freight_forwarder with the grantee key...");
  await postJson(
    `/api/shipments/${encodeURIComponent(shipmentId)}/passport/endorse`,
    {
      role: "freight_forwarder",
      action: "pickup_confirmed",
      capObjectId: grant.capObjectId,
      requesterAddress,
      signerKeyHex: demoKeyHex,
    },
  );

  console.log("Step 5: confirming direct SEAL success after endorsement...");
  await expectSealSuccess(
    shipment,
    demoKeyHex,
    decryptPrivateManifest,
    objectIdToSealId,
    resolveSealEncryptionObjectId,
  );

  console.log("Step 6: confirming HTTP provenance success after endorsement...");
  const granted = await postJson<ProvenanceResponse>(
    `/api/shipments/${encodeURIComponent(shipmentId)}/provenance`,
    {
      requesterAddress,
      requesterKeyHex: demoKeyHex,
      question: "What is the cargo?",
    },
  );
  assert(granted.authorized === true, "Expected provenance to authorize the requester after endorsement");
  assert(granted.decryptionSucceeded === true, "Expected provenance to return decryptionSucceeded=true after endorsement");

  const cargoEvidence = granted.evidence.find((item) => item.label.includes("Cargo manifest"));
  assert(cargoEvidence, "Granted response did not include cargo manifest evidence");

  const cargoMatch = cargoEvidence.value.match(/"description"\s*:\s*"([^"]+)"/);
  if (cargoMatch?.[1]) {
    assert(
      granted.answer.includes(cargoMatch[1]),
      `Granted answer does not mention cargo description "${cargoMatch[1]}"`,
    );
  }

  const directAnswer = await answerProvenanceQuestion(
    shipmentId,
    "What is the cargo?",
    requesterAddress,
    requesterKeypair,
  );
  assert(directAnswer.authorized && directAnswer.decryptionSucceeded, "Direct provenance agent call did not stay authorized");

  console.log("Tier 0 verification passed.");
  console.log("Inspect server logs for a NoAccessError during the denied provenance attempt to confirm key-server denial on the HTTP path.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
