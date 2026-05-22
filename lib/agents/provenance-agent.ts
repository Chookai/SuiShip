import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { getDb } from "@/lib/db";
import { getSuiPassportClient } from "@/lib/sui-passport";

const logger = pino({ name: "provenance-agent" });

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a shipping document provenance assistant for SuiShip.
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
  requesterAddress: string
): Promise<ProvenanceAnswer> {
  const db = getDb();

  const shipmentRow = db.prepare(
    `SELECT passport_id, endorsement_log_object_id, encrypted_walrus_blob_id
     FROM shipments WHERE id = ?`
  ).get(shipmentId) as {
    passport_id: string | null;
    endorsement_log_object_id: string | null;
    encrypted_walrus_blob_id: string | null;
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
  const authorized = onChainAddrKnown
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
  let extractionContext = "";

  if (authorized) {
    // For now: read extraction from manifest_cache or file_cache (SEAL decryption wired in Part 2)
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
          label: "Manifest (cached)",
          value: `Available — ${Object.keys(manifest).join(", ")}`,
        });
      } catch { /* skip */ }
    }

    // Also include per-doc extraction from file_cache
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

  const userContext = `
## Shipment ID
${shipmentId}

## Custody Endorsements
${endorsementSummary}

## AI Validation
${validationSummary}

## Extracted Document Data
${extractionContext || "No extracted data available."}
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
