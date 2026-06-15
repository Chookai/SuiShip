import Anthropic from "@anthropic-ai/sdk";
import JSZip from "jszip";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import pino from "pino";
import { getDb } from "@/lib/db";
import { getShipmentById } from "@/lib/shipments-server";
import { getSuiPassportClient } from "@/lib/sui-passport";
import { normalizeNamespaceKey, readPartyMemory } from "@/lib/agents/memory-agent";
import {
  SEAL_ENABLED,
  decryptPrivateManifest,
  objectIdToSealId,
  resolveSealEncryptionObjectId,
  SealUnavailableError,
} from "@/lib/seal-client";

const logger = pino({ name: "provenance-agent" });

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a shipping document provenance assistant for SuiShip running as a Claude Haiku 4.5 evidence agent.
Answer the user's question using ONLY the provided evidence. Cite specific documents, field names, and values for each claim.
If the evidence does not contain enough information to answer, say so explicitly.
Do not invent values or make assumptions beyond what is in the evidence.`;

export type Evidence = {
  type: "endorsement" | "validation" | "document_field" | "chain_ref";
  label: string;
  value: string;
  txDigest?: string;
};

export type ProvenanceAnswer = {
  answer: string;
  evidence: Evidence[];
  authorized: boolean;
  decryptionSucceeded: boolean;
};

function isSealNoAccessError(err: unknown): boolean {
  return err instanceof Error && (
    err.name === "NoAccessError" ||
    err.message.includes("does not have access")
  );
}

async function extractZipEvidence(
  plaintextZipBytes: Uint8Array,
  evidence: Evidence[],
): Promise<string> {
  let extractionContext = "";
  const zip = await JSZip.loadAsync(plaintextZipBytes);

  const privateManifestFile = zip.file("manifest.private.json");
  if (privateManifestFile) {
    const privateManifest = JSON.parse(await privateManifestFile.async("string")) as Record<string, unknown>;
    const docs = (privateManifest.documents as Array<Record<string, unknown>> | undefined) ?? [];
    for (const doc of docs) {
      if (!doc.extraction) continue;
      const label = `${doc.doc_type ?? "document"}: ${doc.file_name ?? ""}`;
      const value = JSON.stringify(doc.extraction, null, 2).slice(0, 500);
      evidence.push({ type: "document_field", label, value });
      extractionContext += `\n\n## ${label}\n${JSON.stringify(doc.extraction, null, 2)}`;
    }
  }

  const cargoManifestFile = zip.file("manifest.json");
  if (cargoManifestFile) {
    const cargoManifest = JSON.parse(await cargoManifestFile.async("string")) as Record<string, unknown>;
    evidence.push({
      type: "document_field",
      label: "Cargo manifest (parties + shipment details)",
      value: JSON.stringify(
        { parties: cargoManifest.parties, shipment: cargoManifest.shipment, cargo: cargoManifest.cargo },
        null,
        2,
      ).slice(0, 500),
    });
    extractionContext += `\n\n## Cargo Manifest\n${JSON.stringify(cargoManifest, null, 2)}`;
  }

  return extractionContext;
}

function isAuthorized(
  requesterAddress: string,
  importer: string,
  exporter: string,
  endorsements: Array<{ signer: string }>
): boolean {
  if (requesterAddress === importer || requesterAddress === exporter) return true;
  return endorsements.some((e) => e.signer === requesterAddress);
}

export async function answerProvenanceQuestion(
  shipmentId: string,
  question: string,
  requesterAddress: string,
  requesterKeypair?: Ed25519Keypair,
): Promise<ProvenanceAnswer> {
  const db = getDb();

  const shipmentRow = db.prepare(
    `SELECT passport_id, endorsement_log_object_id, encrypted_walrus_blob_id,
            seal_object_id, on_chain_accumulator_id
     FROM shipments WHERE id = ?`
  ).get(shipmentId) as {
    passport_id: string | null;
    endorsement_log_object_id: string | null;
    encrypted_walrus_blob_id: string | null;
    seal_object_id: string | null;
    on_chain_accumulator_id: string | null;
  } | undefined;

  if (!shipmentRow?.passport_id) {
    return {
      answer: "This shipment has not been minted yet. No provenance data is available.",
      evidence: [],
      authorized: false,
      decryptionSucceeded: false,
    };
  }

  // Read SQLite-mirrored endorsements
  const localEndorsements = db.prepare(
    `SELECT role, signer_address AS signer, action, signed_at_ms, tx_digest
     FROM passport_endorsements WHERE shipment_id = ? ORDER BY signed_at_ms ASC`
  ).all(shipmentId) as Array<{
    role: string;
    signer: string;
    action: string;
    signed_at_ms: number;
    tx_digest: string;
  }>;

  // Try to fetch on-chain endorsements for authoritative check
  let onChainImporter = "";
  let onChainExporter = "";
  let onChainEndorsements = localEndorsements.map((e) => ({ signer: e.signer }));

  if (shipmentRow.endorsement_log_object_id) {
    try {
      const client = getSuiPassportClient();
      const log = await client.getEndorsementLog(shipmentRow.endorsement_log_object_id);
      onChainImporter = log.importer;
      onChainExporter = log.exporter;
      onChainEndorsements = log.endorsements;
    } catch (err) {
      logger.warn({ err, shipmentId }, "Could not fetch on-chain endorsement log — using SQLite mirror");
    }
  }

  // Fallback when on-chain addresses are unavailable (mock mode / old contracts):
  // authorize by SQLite mirror endorsements only. Importer/exporter check is skipped.
  // The demo flow requires at least one POST /passport/endorse call before the agent grants access.
  const onChainAddrKnown = !!(onChainImporter || onChainExporter);
  const appAuthorized = onChainAddrKnown
    ? isAuthorized(requesterAddress, onChainImporter, onChainExporter, onChainEndorsements)
    : onChainEndorsements.some((e) => e.signer === requesterAddress);

  // Build grounding evidence
  const evidence: Evidence[] = [];

  // Endorsement chain
  for (const e of localEndorsements) {
    evidence.push({
      type: "endorsement",
      label: `${e.role}: ${e.action}`,
      value: `Signer: ${e.signer} at ${new Date(e.signed_at_ms).toISOString()}`,
      txDigest: e.tx_digest,
    });
  }

  // Validation summary from DB
  const validationRow = db.prepare(
    `SELECT overall_verdict, verdict_reason, doc_set_hash, model
     FROM validation_runs WHERE shipment_id = ? AND is_superseded = 0
     ORDER BY created_at DESC LIMIT 1`
  ).get(shipmentId) as {
    overall_verdict: string | null;
    verdict_reason: string | null;
    doc_set_hash: string | null;
    model: string | null;
  } | undefined;

  if (validationRow) {
    evidence.push({
      type: "validation",
      label: "AI cross-validation verdict",
      value: `${validationRow.overall_verdict ?? "unknown"}: ${validationRow.verdict_reason ?? ""}`,
    });
  }

  // Try to get decrypted extraction data if authorized
  let decryptionSucceeded = false;
  let sealStatus: "disabled" | "success" | "degraded" = "disabled";
  let extractionContext = "";
  let authorized = appAuthorized;

  const encryptedBlobId = shipmentRow.encrypted_walrus_blob_id;
  const endorsementLogId = shipmentRow.endorsement_log_object_id;
  const accumulatorId = shipmentRow.on_chain_accumulator_id ?? shipmentRow.seal_object_id;
  const canAttemptSeal = Boolean(SEAL_ENABLED && requesterKeypair && encryptedBlobId && accumulatorId && endorsementLogId);

  if (canAttemptSeal) {
    const encryptionObjectId = await resolveSealEncryptionObjectId({
      accumulatorId: accumulatorId!,
      endorsementLogId: endorsementLogId!,
      sealObjectId: shipmentRow.seal_object_id,
    });
    const encryptionId = objectIdToSealId(encryptionObjectId);
    try {
      const plaintextZipBytes = await decryptPrivateManifest(
        encryptedBlobId!,
        accumulatorId!,
        endorsementLogId!,
        encryptionId,
        requesterKeypair,
      );
      extractionContext = await extractZipEvidence(plaintextZipBytes, evidence);
      decryptionSucceeded = true;
      sealStatus = "success";
      authorized = true;
      logger.info({ shipmentId, requesterAddress }, "[seal] provenance agent decryption succeeded with requester key");
    } catch (err) {
      if (err instanceof SealUnavailableError) {
        sealStatus = "disabled";
      } else if (isSealNoAccessError(err)) {
        logger.warn({ err, shipmentId, requesterAddress }, "[seal] requester denied by SEAL key servers");
        return {
          answer: "Access denied: you are not endorsed on this shipment. Ask the importer or exporter to endorse you, then try again.",
          evidence: [],
          authorized: false,
          decryptionSucceeded: false,
        };
      } else {
        sealStatus = "degraded";
        logger.warn({ err, shipmentId, requesterAddress }, "[seal] requester decryption failed — considering fallback");
      }
    }
  }

  if (authorized) {
    if (!decryptionSucceeded && SEAL_ENABLED && !requesterKeypair && encryptedBlobId && accumulatorId && endorsementLogId) {
      const encryptionObjectId = await resolveSealEncryptionObjectId({
        accumulatorId,
        endorsementLogId,
        sealObjectId: shipmentRow.seal_object_id,
      });
      const encryptionId = objectIdToSealId(encryptionObjectId);
      try {
        const plaintextZipBytes = await decryptPrivateManifest(encryptedBlobId, accumulatorId, endorsementLogId, encryptionId);
        extractionContext = await extractZipEvidence(plaintextZipBytes, evidence);
        decryptionSucceeded = true;
        sealStatus = "success";
        logger.info({ shipmentId }, "[seal] provenance agent decryption succeeded");
      } catch (err) {
        if (err instanceof SealUnavailableError) {
          sealStatus = "disabled";
        } else {
          sealStatus = "degraded";
          logger.warn({ err, shipmentId }, "[seal] decryption failed — falling back to plaintext cache");
        }
      }
    }

    // ── Plaintext fallback: manifest_cache + file_cache ────────────────────
    // Used when SEAL_ENABLED=false, or when SEAL decryption failed (degraded mode).
    if (!decryptionSucceeded && authorized) {
      const manifestRow = db.prepare(
        "SELECT manifest_json FROM manifest_cache WHERE shipment_id = ?"
      ).get(shipmentId) as { manifest_json: string } | undefined;

      if (manifestRow) {
        try {
          const manifest = JSON.parse(manifestRow.manifest_json) as Record<string, unknown>;
          extractionContext = JSON.stringify(manifest, null, 2);
          decryptionSucceeded = true;
          evidence.push({
            type: "document_field",
            label: sealStatus === "degraded" ? "Manifest (cached — SEAL degraded)" : "Manifest (cached)",
            value: `Available — ${Object.keys(manifest).join(", ")}`,
          });
        } catch { /* skip */ }
      }

      const fileRows = db.prepare(
        `SELECT sf.doc_type, sf.file_name, sf.sha256, fc.extraction_json
         FROM shipment_files sf JOIN file_cache fc ON fc.sha256 = sf.sha256
         WHERE sf.shipment_id = ?`
      ).all(shipmentId) as Array<{
        doc_type: string;
        file_name: string;
        sha256: string;
        extraction_json: string | null;
      }>;

      for (const f of fileRows) {
        if (!f.extraction_json) continue;
        try {
          const ext = JSON.parse(f.extraction_json) as Record<string, unknown>;
          evidence.push({
            type: "document_field",
            label: `${f.doc_type}: ${f.file_name}`,
            value: JSON.stringify(ext.data ?? ext, null, 2).slice(0, 500),
          });
          extractionContext += `\n\n## ${f.doc_type} (${f.file_name})\n${JSON.stringify(ext.data ?? ext, null, 2)}`;
        } catch { /* skip */ }
      }
    }
  }

  if (!authorized) {
    return {
      answer: "Access denied: you are not endorsed on this shipment. Ask the importer or exporter to endorse you, then try again.",
      evidence: [],
      authorized: false,
      decryptionSucceeded: false,
    };
  }

  // Build context for Haiku
  const endorsementSummary = localEndorsements.length > 0
    ? localEndorsements.map((e) => `• [${e.role}] ${e.action} by ${e.signer} at ${new Date(e.signed_at_ms).toISOString()} (tx: ${e.tx_digest})`).join("\n")
    : "No endorsements yet.";

  const validationSummary = validationRow
    ? `Verdict: ${validationRow.overall_verdict}. ${validationRow.verdict_reason ?? ""}`
    : "No validation data available.";

  let partyHistoryContext = "";
  if (shouldRecallPartyHistory(question)) {
    const shipment = getShipmentById(shipmentId);
    const partyQueries = [
      shipment?.exporter ? { label: "Exporter history", key: normalizeNamespaceKey(shipment.exporter.taxId, shipment.exporter.company) } : null,
      shipment?.importer ? { label: "Importer history", key: normalizeNamespaceKey(shipment.importer.taxId, shipment.importer.company) } : null,
    ].filter((item): item is { label: string; key: string } => Boolean(item));

    const historyBlocks: string[] = [];
    for (const party of partyQueries) {
      try {
        const recalled = await readPartyMemory(party.key, question, 5);
        if (recalled.length > 0) {
          historyBlocks.push(`## ${party.label} (${party.key})\n${recalled.map((item, index) => {
            evidence.push({
              type: "chain_ref",
              label: `${party.label} MemWal memory ${index + 1}`,
              value: `blob=${item.blobId}; distance=${item.distance}`,
            });
            return `[${index + 1}] ${item.text}`;
          }).join("\n")}`);
        }
      } catch (err) {
        logger.warn({ err, shipmentId, partyKey: party.key }, "Party history recall failed");
      }
    }
    partyHistoryContext = historyBlocks.join("\n\n");
  }

  const userContext = `
## Shipment ID
${shipmentId}

## Custody Endorsements
${endorsementSummary}

## AI Validation
${validationSummary}

## Extracted Document Data
${extractionContext || "No extracted data available."}

## Cross-Shipment Party History
${partyHistoryContext || "No party history recalled for this question."}
`.trim();

  const client = new Anthropic();
  let answer = "";
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Evidence:\n${userContext}\n\nQuestion: ${question}`,
        },
      ],
    });
    answer = msg.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("\n");
  } catch (err) {
    logger.error({ err, shipmentId }, "Haiku provenance question failed");
    answer = `Could not answer: ${err instanceof Error ? err.message : String(err)}`;
  }

  return { answer, evidence, authorized: true, decryptionSucceeded };
}

function shouldRecallPartyHistory(question: string): boolean {
  return /\b(history|before|previous|prior|shipped|shipments|exporter|importer|party|memory)\b/i.test(question);
}
