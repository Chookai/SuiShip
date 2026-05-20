import { createHash } from "node:crypto";
import pino from "pino";
import { getDb } from "./db";
import { getShipmentById, updateShipmentMintPointers } from "./shipments-server";
import { storeBlobServer, WALRUS_MINT_EPOCHS, aggregatorUrl } from "./walrus";
import { getSuiPassportClient } from "./sui-passport";
import { isMemWalConfigured, memwalRemember } from "./memwal/client";
import type { AggregateResult } from "@/src/agent/schemas/aggregate-result";
import type { MemWalManifest } from "./memwal/types";

const logger = pino({ name: "mint-sequence" });

export type MintResult = {
  passportId: string;
  txDigest: string;
  mintedAt: string;
  walrusBlobIds: string[];
  memWalSpaceId: string;
  manifestHash: string;
};

export type MintError = {
  error: string;
  step: "gate" | "walrus" | "memwal" | "sui" | "db";
  retriable: boolean;
  partialState?: { walrusBlobIds?: string[]; memWalSpaceId?: string };
};

type FileCacheRow = { raw_pdf: Buffer | null };
type ShipmentFileRow = { sha256: string; doc_type: string; file_name: string; size_bytes: number };
type ValidationRunRow = { issues_json: string; overall_verdict: string };
type ExtractionRunRow = { aggregate_json: string };
type MintPointerRow = {
  passport_id: string | null;
  tx_digest: string | null;
  memwal_space_id: string | null;
  walrus_manifest_blob_id: string | null;
  manifest_hash: string | null;
  minted_at: string | null;
};

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

  // ── Gate: check for unresolved validation errors ───────────────────────────
  const latestValidation = db
    .prepare(
      `SELECT issues_json FROM validation_runs
       WHERE shipment_id = ? AND is_superseded = 0
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(shipmentId) as ValidationRunRow | undefined;

  if (latestValidation) {
    const issues = JSON.parse(latestValidation.issues_json) as { severity: string }[];
    if (issues.some((i) => i.severity === "error")) {
      return {
        error: "Mint blocked: unresolved validation errors. Fix all errors before minting.",
        step: "gate",
        retriable: false,
      };
    }
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

  // ── Step d: Sui mintPassport ───────────────────────────────────────────────
  const manifestHash = getManifestHash(shipmentId, db);
  const suiClient = getSuiPassportClient();

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
    });
    passportId = result.passportId;
    txDigest = result.txDigest;
    mintedAt = result.mintedAt;
  } catch (err) {
    logger.error({ err, shipmentId }, "Sui mintPassport failed");
    return {
      error: `Sui mint failed: ${err instanceof Error ? err.message : String(err)}`,
      step: "sui",
      retriable: true,
      partialState: { walrusBlobIds, memWalSpaceId },
    };
  }

  // ── Step e: Update SQLite ─────────────────────────────────────────────────
  try {
    updateShipmentMintPointers(shipmentId, {
      passportId,
      txDigest,
      memwalSpaceId: memWalSpaceId,
      walrusManifestBlobId: walrusBlobIds[0] ?? "",
      manifestHash,
      mintedAt,
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
  return { passportId, txDigest, mintedAt, walrusBlobIds, memWalSpaceId, manifestHash };
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
  } catch {
    logger.warn({ shipmentId }, "Manifest Walrus upload failed — continuing without manifest blob");
  }

  return { blobIds };
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

  const manifest: MemWalManifest = {
    schema_version: "1.0",
    shipment_id: shipmentId,
    passport_id: "",
    manifest_hash: "",
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

  const manifestJson = JSON.stringify(manifest);
  const manifestHash = createHash("sha256").update(manifestJson).digest("hex");
  manifest.manifest_hash = manifestHash;
  return JSON.stringify(manifest, null, 2);
}

function getManifestHash(shipmentId: string, db: ReturnType<typeof getDb>): string {
  const cached = db
    .prepare("SELECT manifest_json FROM manifest_cache WHERE shipment_id = ?")
    .get(shipmentId) as { manifest_json: string } | undefined;
  if (cached) return createHash("sha256").update(cached.manifest_json).digest("hex");
  return createHash("sha256").update(shipmentId + Date.now()).digest("hex");
}
