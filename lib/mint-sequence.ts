import { createHash } from "node:crypto";
import JSZip from "jszip";
import pino from "pino";
import { getDb } from "./db";
import { getShipmentById, updateShipmentMintPointers } from "./shipments-server";
import { storeBlobServer, WALRUS_AGGREGATOR, WALRUS_MINT_EPOCHS, aggregatorUrl } from "./walrus";
import { getSuiPassportClient } from "./sui-passport";
import { isMemWalConfigured, memwalRemember } from "./memwal/client";
import type { AggregateResult } from "@/src/agent/schemas/aggregate-result";
import type { MemWalManifest } from "./memwal/types";
import type { WalrusUpload } from "./shipments-store";

const logger = pino({ name: "mint-sequence" });

export type MintResult = {
  passportId: string;
  txDigest: string;
  mintedAt: string;
  walrusBlobIds: string[];
  memWalSpaceId: string;
  manifestHash: string;
  walrus?: WalrusUpload;
};

export type MintError = {
  error: string;
  step: "gate" | "walrus" | "memwal" | "sui" | "db";
  retriable: boolean;
  partialState?: { walrusBlobIds?: string[]; memWalSpaceId?: string };
};

type FileCacheRow = { raw_pdf: Buffer | null };
type ShipmentFileRow = { sha256: string; doc_type: string; file_name: string; size_bytes: number };
type ExtractionRunRow = { aggregate_json: string };
type MintPointerRow = {
  passport_id: string | null;
  tx_digest: string | null;
  memwal_space_id: string | null;
  walrus_manifest_blob_id: string | null;
  manifest_hash: string | null;
  minted_at: string | null;
};

// ── Hardened mint gate ─────────────────────────────────────────────────────

function computeDocSetHash(shipmentId: string, db: ReturnType<typeof getDb>): string {
  const rows = db.prepare(
    `SELECT sha256, COALESCE(slot_key, doc_type) AS slot_key
     FROM shipment_files
     WHERE shipment_id = ? AND state IN ('validated','committed')
     ORDER BY slot_key ASC`
  ).all(shipmentId) as { sha256: string; slot_key: string }[];
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function checkMintGate(
  shipmentId: string,
  db: ReturnType<typeof getDb>
): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];

  // 1. Template slots satisfied (only if shipment has a template)
  const shipmentRow = db.prepare(
    "SELECT template_id FROM shipments WHERE id = ?"
  ).get(shipmentId) as { template_id: string | null } | undefined;

  if (shipmentRow?.template_id) {
    const missingSlots = db.prepare(`
      SELECT ts.slot_key FROM template_slots ts
      LEFT JOIN shipment_files sf
        ON sf.shipment_id = ? AND COALESCE(sf.slot_key, sf.doc_type) = ts.slot_key
        AND sf.state IN ('validated','committed')
      WHERE ts.template_id = ? AND ts.is_required = 1 AND sf.id IS NULL
    `).all(shipmentId, shipmentRow.template_id) as { slot_key: string }[];
    if (missingSlots.length > 0) {
      blockers.push(`Missing required slots: ${missingSlots.map(r => r.slot_key).join(", ")}`);
    }
  }

  // 2. No docs stuck in bad states
  const stuckDocs = db.prepare(`
    SELECT COALESCE(slot_key, doc_type) AS slot_key, state FROM shipment_files
    WHERE shipment_id = ? AND state IN ('conflict','extraction_failed','extracting','uploading')
  `).all(shipmentId) as { slot_key: string; state: string }[];
  if (stuckDocs.length > 0) {
    blockers.push(`Documents not ready: ${stuckDocs.map(r => `${r.slot_key}=${r.state}`).join(", ")}`);
  }

  // 3. Fresh validation with matching doc_set_hash (if any validated docs exist)
  const hasValidatedDocs = (db.prepare(
    "SELECT COUNT(*) as n FROM shipment_files WHERE shipment_id = ? AND state IN ('validated','committed')"
  ).get(shipmentId) as { n: number }).n > 0;

  if (hasValidatedDocs) {
    const currentHash = computeDocSetHash(shipmentId, db);
    const latestValidation = db.prepare(`
      SELECT doc_set_hash, overall_verdict FROM validation_runs
      WHERE shipment_id = ? AND is_superseded = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(shipmentId) as { doc_set_hash: string | null; overall_verdict: string } | undefined;

    if (!latestValidation) {
      blockers.push("No validation run found. Run POST /api/shipments/{id}/validate first.");
    } else if (latestValidation.doc_set_hash && latestValidation.doc_set_hash !== currentHash) {
      blockers.push("Document set changed since last validation. Re-run validate.");
    } else if (latestValidation.overall_verdict === "mismatched") {
      blockers.push("Validation verdict is mismatched. Resolve conflicts before minting.");
    }
  }

  // 4. No unresolved error-severity findings
  const unresolvedErrors = (db.prepare(`
    SELECT COUNT(*) as n FROM validation_findings
    WHERE shipment_id = ? AND severity = 'error' AND status = 'unresolved'
  `).get(shipmentId) as { n: number } | undefined)?.n ?? 0;
  if (unresolvedErrors > 0) {
    blockers.push(`${unresolvedErrors} unresolved error finding(s). Resolve before minting.`);
  }

  return { ok: blockers.length === 0, blockers };
}

/**
 * Orchestrates the 5-step mint sequence from the implementation plan.
 * Idempotent: checks existing pointers in SQLite before each step.
 */
export async function executeMintSequence(
  shipmentId: string,
  ownerAddress: string
): Promise<MintResult | MintError> {
  const db = getDb();

  if (!getShipmentById(shipmentId)) {
    return { error: `Shipment ${shipmentId} not found`, step: "gate", retriable: false };
  }

  // ── Gate: hardened 4-check gate ───────────────────────────────────────────
  const gateResult = checkMintGate(shipmentId, db);
  if (!gateResult.ok) {
    return {
      error: `Mint blocked: ${gateResult.blockers.join(" | ")}`,
      step: "gate",
      retriable: false,
    };
  }

  // ── Idempotency checks ─────────────────────────────────────────────────────
  const pointers = db
    .prepare(
      `SELECT passport_id, tx_digest, memwal_space_id, walrus_manifest_blob_id, manifest_hash, minted_at
       FROM shipments WHERE id = ?`
    )
    .get(shipmentId) as MintPointerRow | undefined;

  if (pointers?.passport_id) {
    return {
      passportId: pointers.passport_id,
      txDigest: pointers.tx_digest!,
      mintedAt: pointers.minted_at!,
      walrusBlobIds: getStoredWalrusBlobIds(shipmentId, db),
      memWalSpaceId: pointers.memwal_space_id!,
      manifestHash: pointers.manifest_hash!,
    };
  }

  // ── Step b: Upload to Walrus ───────────────────────────────────────────────
  let walrusBlobIds: string[];

  if (pointers?.walrus_manifest_blob_id) {
    walrusBlobIds = getStoredWalrusBlobIds(shipmentId, db);
    logger.info({ shipmentId }, "Walrus blobs already uploaded — skipping");
  } else {
    const walrusResult = await uploadDocumentsToWalrus(shipmentId, ownerAddress, db);
    if ("error" in walrusResult) return walrusResult;
    walrusBlobIds = walrusResult.blobIds;
  }

  // ── Step c: MemWal ─────────────────────────────────────────────────────────
  let memWalSpaceId: string;

  if (pointers?.memwal_space_id) {
    memWalSpaceId = pointers.memwal_space_id;
    logger.info({ shipmentId }, "MemWal space already created — skipping");
  } else {
    const memWalResult = await writeToMemWal(shipmentId, ownerAddress, walrusBlobIds, db);
    if ("error" in memWalResult) {
      return { ...memWalResult, partialState: { walrusBlobIds } };
    }
    memWalSpaceId = memWalResult.spaceId;

    db.prepare(
      "UPDATE shipments SET memwal_space_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
    ).run(memWalSpaceId, shipmentId);
  }

  // ── Step d: Sui finalize_shipment ────────────────────────────────────────
  const manifestHash = getManifestHash(shipmentId, db);
  const walrusPackage = await ensureWalrusPackage(shipmentId, db);
  if ("error" in walrusPackage) {
    return { ...walrusPackage, partialState: { walrusBlobIds, memWalSpaceId } };
  }
  const suiClient = getSuiPassportClient();

  // Fetch on-chain IDs for real SUI client
  const shipmentOnChainRow = db.prepare(
    "SELECT on_chain_record_id, on_chain_accumulator_id FROM shipments WHERE id = ?"
  ).get(shipmentId) as {
    on_chain_record_id: string | null;
    on_chain_accumulator_id: string | null;
  } | undefined;

  if (
    process.env.SUI_CLIENT === "real" &&
    (!shipmentOnChainRow?.on_chain_record_id || !shipmentOnChainRow?.on_chain_accumulator_id)
  ) {
    return {
      error: "Sui mint blocked: on-chain ShipmentRecord/DocAccumulator IDs are missing for this shipment.",
      step: "sui",
      retriable: false,
      partialState: { walrusBlobIds, memWalSpaceId },
    };
  }

  // Get latest validation hash for the passport
  const latestValidation = db.prepare(
    `SELECT doc_set_hash FROM validation_runs
     WHERE shipment_id = ? AND is_superseded = 0
     ORDER BY created_at DESC LIMIT 1`
  ).get(shipmentId) as { doc_set_hash: string | null } | undefined;

  const validationHash = createHash("sha256")
    .update(latestValidation?.doc_set_hash ?? shipmentId)
    .digest("hex");

  // Verification score from ai_json
  const aiRow = db.prepare("SELECT ai_json FROM shipments WHERE id = ?")
    .get(shipmentId) as { ai_json: string | null } | undefined;
  const verificationScore = (() => {
    try {
      return (JSON.parse(aiRow?.ai_json ?? "{}") as { score?: number }).score ?? 85;
    } catch { return 85; }
  })();
  const packageHash = walrusPackage.sha256;

  let passportId: string;
  let txDigest: string;
  let mintedAt: string;

  try {
    const result = await suiClient.mintPassport({
      owner: ownerAddress,
      shipmentId,
      memWalSpaceId,
      walrusBlobIds,
      manifestHash,
      metadata: {
        recordId: shipmentOnChainRow?.on_chain_record_id ?? "",
        accumulatorId: shipmentOnChainRow?.on_chain_accumulator_id ?? "",
        packageHash,
        validationHash,
        verificationScore: String(verificationScore),
      },
    });
    passportId = result.passportId;
    txDigest = result.txDigest;
    mintedAt = result.mintedAt;
  } catch (err) {
    logger.error({ err, shipmentId }, "Sui finalize_shipment failed");
    return {
      error: `Sui mint failed: ${err instanceof Error ? err.message : String(err)}`,
      step: "sui",
      retriable: true,
      partialState: { walrusBlobIds, memWalSpaceId },
    };
  }

  // Mark all docs as committed
  db.prepare(
    "UPDATE shipment_files SET state = 'committed' WHERE shipment_id = ? AND state = 'validated'"
  ).run(shipmentId);

  // ── Step e: Update SQLite ─────────────────────────────────────────────────
  try {
    updateShipmentMintPointers(shipmentId, {
      passportId,
      txDigest,
      memwalSpaceId: memWalSpaceId,
      walrusManifestBlobId: walrusBlobIds[0] ?? "",
      manifestHash,
      mintedAt,
      walrusJson: JSON.stringify(walrusPackage.upload),
    });
  } catch (err) {
    logger.error({ err, shipmentId, passportId }, "SQLite update failed after mint");
    return {
      error: `Passport ${passportId} minted but SQLite update failed. Manual reconciliation needed.`,
      step: "db",
      retriable: true,
      partialState: { walrusBlobIds, memWalSpaceId },
    };
  }

  logger.info({
    shipmentId,
    passportId,
    txDigest,
    memWalSpaceId,
    walrusBlobIds,
    manifestHash,
  }, "Mint sequence complete");
  return { passportId, txDigest, mintedAt, walrusBlobIds, memWalSpaceId, manifestHash, walrus: walrusPackage.upload };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function getStoredWalrusBlobIds(shipmentId: string, db: ReturnType<typeof getDb>): string[] {
  const manifestRows = db
    .prepare("SELECT blob_id FROM walrus_blobs WHERE shipment_id = ? AND purpose = 'manifest' ORDER BY stored_at ASC")
    .all(shipmentId) as { blob_id: string }[];
  const documentRows = db
    .prepare(
      `SELECT walrus_blob_id AS blob_id
       FROM shipment_files
       WHERE shipment_id = ? AND walrus_blob_id IS NOT NULL
       ORDER BY uploaded_at ASC`
    )
    .all(shipmentId) as { blob_id: string }[];

  const seen = new Set<string>();
  return [...manifestRows, ...documentRows]
    .map((row) => row.blob_id)
    .filter((blobId) => {
      if (seen.has(blobId)) return false;
      seen.add(blobId);
      return true;
    });
}

async function uploadDocumentsToWalrus(
  shipmentId: string,
  ownerAddress: string,
  db: ReturnType<typeof getDb>
): Promise<{ blobIds: string[] } | MintError> {
  const files = db
    .prepare(
      `SELECT sha256, doc_type, file_name, size_bytes
       FROM shipment_files WHERE shipment_id = ?`
    )
    .all(shipmentId) as ShipmentFileRow[];

  if (files.length === 0) {
    return {
      error: "Walrus upload blocked: no extracted shipment files found. Re-upload documents before creating the shipment.",
      step: "walrus",
      retriable: false,
    };
  }

  const blobIds: string[] = [];

  for (const file of files) {
    const cached = db
      .prepare("SELECT raw_pdf FROM file_cache WHERE sha256 = ?")
      .get(file.sha256) as FileCacheRow | undefined;

    if (!cached?.raw_pdf) {
      logger.warn({ sha256: file.sha256 }, "raw_pdf not found in file_cache — skipping");
      continue;
    }

    try {
      const result = await storeBlobServer({
        data: cached.raw_pdf,
        fileName: `${shipmentId}/${file.doc_type}/${file.sha256.slice(0, 8)}.pdf`,
        epochs: WALRUS_MINT_EPOCHS,
      });

      blobIds.push(result.blobId);
      logger.info({
        blobId: result.blobId,
        endEpoch: result.endEpoch,
        publisher: result.publisher,
        sizeBytes: result.sizeBytes,
        fileName: file.file_name,
        readUrl: aggregatorUrl(result.blobId),
      }, "Walrus blob stored");

      db.prepare(`
        INSERT OR IGNORE INTO walrus_blobs
          (blob_id, shipment_id, purpose, file_name, size_bytes, sha256, end_epoch, publisher)
        VALUES (?, ?, 'document', ?, ?, ?, ?, ?)
      `).run(
        result.blobId, shipmentId, file.file_name,
        file.size_bytes, file.sha256, result.endEpoch ?? null, result.publisher
      );

      db.prepare(
        "UPDATE shipment_files SET walrus_blob_id = ?, is_final = 1 WHERE shipment_id = ? AND sha256 = ?"
      ).run(result.blobId, shipmentId, file.sha256);
    } catch (err) {
      return {
        error: `Walrus upload failed for ${file.file_name}: ${err instanceof Error ? err.message : String(err)}`,
        step: "walrus",
        retriable: true,
      };
    }
  }

  if (blobIds.length === 0) {
    return {
      error: "Walrus upload blocked: the extracted document PDFs are missing from the local cache. Re-upload the documents and run extraction again before minting.",
      step: "walrus",
      retriable: false,
    };
  }

  // Upload manifest JSON as a Walrus blob (slot 0 per plan convention)
  const manifestJson = buildManifestJson(shipmentId, ownerAddress, blobIds, db);
  try {
    const manifestResult = await storeBlobServer({
      data: Buffer.from(manifestJson, "utf-8"),
      fileName: `${shipmentId}/manifest.json`,
      epochs: WALRUS_MINT_EPOCHS,
    });
    blobIds.unshift(manifestResult.blobId);
    logger.info({
      blobId: manifestResult.blobId,
      readUrl: aggregatorUrl(manifestResult.blobId),
      sizeBytes: manifestResult.sizeBytes,
    }, "Walrus manifest blob stored");

    db.prepare(`
      INSERT OR IGNORE INTO walrus_blobs
        (blob_id, shipment_id, purpose, file_name, size_bytes, publisher)
      VALUES (?, ?, 'manifest', ?, ?, ?)
    `).run(
      manifestResult.blobId, shipmentId,
      `${shipmentId}/manifest.json`, manifestResult.sizeBytes, manifestResult.publisher
    );

    // Cache manifest locally
    db.prepare(`
      INSERT OR REPLACE INTO manifest_cache (shipment_id, manifest_json, fetched_from)
      VALUES (?, ?, 'local')
    `).run(shipmentId, manifestJson);
  } catch (err) {
    // Manifest is the integrity anchor — if it fails the mint must not proceed.
    return {
      error: `Walrus manifest upload failed: ${err instanceof Error ? err.message : String(err)}`,
      step: "walrus",
      retriable: true,
    };
  }

  return { blobIds };
}

async function ensureWalrusPackage(
  shipmentId: string,
  db: ReturnType<typeof getDb>
): Promise<{ upload: WalrusUpload; sha256: string } | MintError> {
  const files = db
    .prepare(
      `SELECT sf.sha256, sf.doc_type, sf.file_name, sf.size_bytes, fc.raw_pdf
       FROM shipment_files sf
       JOIN file_cache fc ON fc.sha256 = sf.sha256
       WHERE sf.shipment_id = ?
       ORDER BY sf.uploaded_at ASC`
    )
    .all(shipmentId) as Array<ShipmentFileRow & FileCacheRow>;

  if (files.length === 0) {
    return {
      error: "Walrus package blocked: no uploaded PDFs found for this shipment.",
      step: "walrus",
      retriable: false,
    };
  }

  const missingFiles = files.filter((file) => !file.raw_pdf);
  if (missingFiles.length > 0) {
    return {
      error: `Walrus package blocked: cached PDFs missing for ${missingFiles.map((file) => file.file_name).join(", ")}.`,
      step: "walrus",
      retriable: false,
    };
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const documents = files.map((file, index) => {
    const docType = file.doc_type || "document";
    const fileName = uniqueZipPath(usedNames, `${docType}/${index + 1}-${file.file_name}`);
    zip.file(fileName, file.raw_pdf as Buffer);
    return {
      name: file.file_name,
      zip_path: fileName,
      doc_type: docType,
      size_bytes: file.size_bytes,
    };
  });

  zip.file(
    "suiship_manifest.json",
    JSON.stringify(
      {
        schema_version: "suiship.walrus_package.v1",
        shipment_id: shipmentId,
        created_at: new Date().toISOString(),
        documents,
      },
      null,
      2
    )
  );

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const packageHash = createHash("sha256").update(zipBuffer).digest("hex");
  const packageFileName = `${shipmentId}-documents.zip`;

  try {
    const result = await storeBlobServer({
      data: zipBuffer,
      fileName: packageFileName,
      mimeType: "application/zip",
      epochs: WALRUS_MINT_EPOCHS,
    });

    db.prepare(
      `INSERT OR REPLACE INTO walrus_blobs
        (blob_id, shipment_id, purpose, file_name, size_bytes, sha256, end_epoch, publisher)
       VALUES (?, ?, 'document_package', ?, ?, ?, ?, ?)`
    ).run(result.blobId, shipmentId, packageFileName, result.sizeBytes, packageHash, result.endEpoch ?? null, result.publisher);

    const upload: WalrusUpload = {
      blobId: result.blobId,
      fileName: packageFileName,
      sizeBytes: result.sizeBytes,
      uploadedAt: new Date().toISOString(),
      endEpoch: result.endEpoch,
      publisher: result.publisher,
      aggregator: WALRUS_AGGREGATOR,
    };
    return { upload, sha256: packageHash };
  } catch (err) {
    return {
      error: `Walrus package upload failed: ${err instanceof Error ? err.message : String(err)}`,
      step: "walrus",
      retriable: true,
    };
  }
}

async function writeToMemWal(
  shipmentId: string,
  ownerAddress: string,
  walrusBlobIds: string[],
  db: ReturnType<typeof getDb>
): Promise<{ spaceId: string } | MintError> {
  const manifestJson = buildManifestJson(shipmentId, ownerAddress, walrusBlobIds, db);

  // Always cache locally for fast reads
  db.prepare(`
    INSERT OR REPLACE INTO manifest_cache (shipment_id, manifest_json, fetched_from)
    VALUES (?, ?, 'local')
  `).run(shipmentId, manifestJson);

  if (!isMemWalConfigured()) {
    const spaceId = `memwal_mock_${createHash("sha256").update(shipmentId + ownerAddress).digest("hex").slice(0, 24)}`;
    logger.info({ shipmentId, spaceId }, "MemWal not configured — using mock space ID");
    return { spaceId };
  }

  // Use shipmentId as the namespace for isolation per shipment
  const namespace = shipmentId;

  try {
    // Write manifest as the primary queryable memory
    const manifestResult = await memwalRemember(`SHIPMENT MANIFEST\n${manifestJson}`, namespace);
    logger.info({ shipmentId, blobId: manifestResult.blobId, namespace }, "MemWal manifest written");

    // Write a searchable summary for recall queries
    const shipment = getShipmentById(shipmentId);
    if (shipment) {
      const summary =
        `Shipment ${shipmentId}: exporter ${shipment.exporter.company} → importer ${shipment.importer.company}. ` +
        `Route: ${shipment.shipment.origin} → ${shipment.shipment.destination}. ` +
        `Carrier: ${shipment.shipment.carrier}. Cargo: ${shipment.cargo.description}, HS ${shipment.cargo.hsCode}. ` +
        `Declared value: ${shipment.shipment.declaredValue} ${shipment.shipment.currency}. ` +
        `Walrus evidence blobs: ${walrusBlobIds.join(", ")}`;
      try {
        await memwalRemember(summary, namespace);
        logger.info({ shipmentId, namespace }, "MemWal summary written");
      } catch (err) {
        logger.warn(
          { err, shipmentId, namespace },
          "MemWal summary write failed after manifest success — continuing"
        );
      }
    }

    // spaceId encodes accountId + namespace so recall can reconstruct the query params
    const accountId = process.env.MEMWAL_ACCOUNT_ID!;
    return { spaceId: `${accountId}:${namespace}` };
  } catch (err) {
    logger.error({ err, shipmentId }, "MemWal write failed");
    return {
      error: `MemWal write failed: ${err instanceof Error ? err.message : String(err)}`,
      step: "memwal",
      retriable: true,
    };
  }
}

function buildManifestJson(
  shipmentId: string,
  ownerAddress: string,
  walrusBlobIds: string[],
  db: ReturnType<typeof getDb>
): string {
  const shipment = getShipmentById(shipmentId);
  if (!shipment) return JSON.stringify({ shipment_id: shipmentId, owner: ownerAddress });

  const latestRun = db
    .prepare(
      `SELECT aggregate_json FROM extraction_runs
       WHERE shipment_id = ? AND is_superseded = 0
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(shipmentId) as ExtractionRunRow | undefined;

  const agg = latestRun ? (JSON.parse(latestRun.aggregate_json) as AggregateResult) : null;

  const documents: MemWalManifest["documents"] = [];
  if (agg) {
    for (const [docType, docs] of Object.entries(agg.detected)) {
      for (const doc of docs as { file_name: string; extraction_result: { confidence: number } }[]) {
        const sfRow = db
          .prepare(
            "SELECT sha256, walrus_blob_id FROM shipment_files WHERE shipment_id = ? AND file_name = ?"
          )
          .get(shipmentId, doc.file_name) as { sha256: string; walrus_blob_id: string | null } | undefined;
        if (sfRow) {
          documents.push({
            doc_type: docType as MemWalManifest["documents"][0]["doc_type"],
            file_name: doc.file_name,
            sha256: sfRow.sha256,
            walrus_blob_id: sfRow.walrus_blob_id ?? walrusBlobIds[1] ?? "",
            confidence: doc.extraction_result.confidence,
          });
        }
      }
    }
  }

  // manifest_hash is NOT embedded inside the manifest JSON (to keep the hash stable).
  // It is computed from the final serialized form and stored separately.
  const manifest: Omit<MemWalManifest, "manifest_hash"> & { manifest_hash?: string } = {
    schema_version: "1.0",
    shipment_id: shipmentId,
    passport_id: "",
    created_at: new Date().toISOString(),
    parties: {
      shipper: { name: shipment.exporter.company, tax_id: shipment.exporter.taxId },
      consignee: { name: shipment.importer.company, tax_id: shipment.importer.taxId },
      broker: shipment.broker,
      freight_forwarder: shipment.freightForwarder,
    },
    shipment: {
      origin: shipment.shipment.origin,
      origin_port: shipment.shipment.originPort,
      destination: shipment.shipment.destination,
      destination_port: shipment.shipment.destinationPort,
      carrier: shipment.shipment.carrier,
      transport_mode: shipment.shipment.transportMode,
      incoterm: shipment.shipment.incoterm,
      etd: shipment.shipment.etd,
      eta: shipment.shipment.eta,
      booking_ref: shipment.shipment.bookingRef,
      bl_type: shipment.shipment.blType,
      payment_terms: shipment.shipment.paymentTerms,
    },
    cargo: {
      description: shipment.cargo.description,
      hs_code: shipment.cargo.hsCode,
      quantity: shipment.cargo.quantity,
      gross_weight: shipment.cargo.grossWeight,
      net_weight: shipment.cargo.netWeight,
      country_of_origin: shipment.cargo.countryOfOrigin,
      declared_value: shipment.shipment.declaredValue,
      currency: shipment.shipment.currency,
      dangerous_goods: shipment.cargo.dangerousGoods === "true",
      temperature_controlled: shipment.cargo.temperatureControlled === "true",
    },
    documents,
    ai_verification: {
      score: shipment.ai?.score ?? 0,
      risk_level: shipment.ai?.riskLevel ?? "High",
      ran_at: shipment.ai?.ranAt ?? new Date().toISOString(),
    },
  };

  // Hash is computed from the final pretty-printed JSON without the hash field inside it.
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestHash = createHash("sha256").update(manifestJson).digest("hex");
  // Store the hash as a separate top-level field so verifiers can strip it and re-check.
  const manifestWithHash = { ...manifest, manifest_hash: manifestHash };
  return JSON.stringify(manifestWithHash, null, 2);
}

function getManifestHash(shipmentId: string, db: ReturnType<typeof getDb>): string {
  const cached = db
    .prepare("SELECT manifest_json FROM manifest_cache WHERE shipment_id = ?")
    .get(shipmentId) as { manifest_json: string } | undefined;
  if (!cached) {
    throw new Error(
      `Manifest cache is empty for shipment ${shipmentId}. ` +
      "Walrus upload must complete before getManifestHash is called."
    );
  }
  // Re-hash without the manifest_hash field to get the canonical content hash.
  try {
    const parsed = JSON.parse(cached.manifest_json) as Record<string, unknown>;
    const rest = { ...parsed };
    delete rest.manifest_hash;
    return createHash("sha256").update(JSON.stringify(rest, null, 2)).digest("hex");
  } catch {
    return createHash("sha256").update(cached.manifest_json).digest("hex");
  }
}

function uniqueZipPath(usedNames: Set<string>, rawPath: string) {
  const normalized = rawPath
    .split("/")
    .map((segment) => sanitizeZipSegment(segment))
    .join("/");
  if (!usedNames.has(normalized)) {
    usedNames.add(normalized);
    return normalized;
  }

  const dot = normalized.lastIndexOf(".");
  const base = dot === -1 ? normalized : normalized.slice(0, dot);
  const ext = dot === -1 ? "" : normalized.slice(dot);
  let counter = 2;
  let candidate = `${base}-${counter}${ext}`;
  while (usedNames.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function sanitizeZipSegment(value: string) {
  return value
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^\.+$/, "file") || "file";
}
