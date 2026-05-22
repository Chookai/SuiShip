import { NextRequest, NextResponse } from "next/server";
import { extract } from "../../../../src/index";
import { aggregate } from "../../../../src/agent/aggregator";
import type { PdfFile } from "../../../../src/types";
import type { ExtractedDoc } from "../../../../src/agent/schemas/extraction-result";
import type { AggregateResult } from "../../../../src/agent/schemas/aggregate-result";
import { computeSha256 } from "@/lib/file-hash";
import { getCachedExtraction, cacheExtraction, ensureCachedRawPdf } from "@/lib/file-cache";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function tryGetDb() {
  try {
    return getDb();
  } catch {
    return null;
  }
}

// Cache helpers now live in lib/file-cache.ts — imported above.

function recordExtractionRun(
  shipmentId: string,
  sha256Map: Map<string, string>,
  result: AggregateResult,
  pdfFiles: PdfFile[]
): void {
  try {
    const db = tryGetDb();
    if (!db) return;

    const sha256s = pdfFiles.map((f) => sha256Map.get(f.id)).filter(Boolean) as string[];

    // Mark previous runs as superseded
    db.prepare(
      "UPDATE extraction_runs SET is_superseded = 1 WHERE shipment_id = ?"
    ).run(shipmentId);

    db.prepare(`
      INSERT INTO extraction_runs (id, shipment_id, file_sha256s, aggregate_json)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), shipmentId, JSON.stringify(sha256s), JSON.stringify(result));

    // Record each file in shipment_files (upsert by sha256+shipment)
    const allDocs: { doc: ExtractedDoc; docType: string }[] = [
      ...result.detected.commercial_invoice.map((d) => ({ doc: d, docType: "commercial_invoice" })),
      ...result.detected.packing_list.map((d) => ({ doc: d, docType: "packing_list" })),
      ...result.detected.bill_of_lading.map((d) => ({ doc: d, docType: "bill_of_lading" })),
      ...result.detected.certificate_of_origin.map((d) => ({ doc: d, docType: "certificate_of_origin" })),
      ...result.garbage.map((g) => ({ doc: g.file, docType: "unknown" })),
      ...result.errors.map((d) => ({ doc: d, docType: "unknown" })),
    ];

    for (const { doc, docType } of allDocs) {
      const sha256 = sha256Map.get(doc.file_id);
      if (!sha256) continue;
      db.prepare(`
        INSERT OR IGNORE INTO shipment_files (id, shipment_id, sha256, doc_type, file_name, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), shipmentId, sha256, docType, doc.file_name, doc.file_size_bytes);
    }
  } catch {
    // non-fatal
  }
}

function mergeAggregateResults(base: AggregateResult, extraDocs: ExtractedDoc[]): AggregateResult {
  if (extraDocs.length === 0) return base;

  const merged = aggregate([
    ...base.detected.commercial_invoice,
    ...base.detected.packing_list,
    ...base.detected.bill_of_lading,
    ...base.detected.certificate_of_origin,
    ...base.garbage.map((g) => g.file),
    ...base.errors,
    ...base.low_confidence,
    ...extraDocs,
  ], base.cross_validation);

  return {
    ...merged,
    summary: {
      ...merged.summary,
      total_haiku_cost_usd: base.summary.total_haiku_cost_usd,
    },
    extractedRef: merged.extractedRef ?? base.extractedRef,
  };
}

function aggregateDocs(result: AggregateResult): ExtractedDoc[] {
  return [
    ...result.detected.commercial_invoice,
    ...result.detected.packing_list,
    ...result.detected.bill_of_lading,
    ...result.detected.certificate_of_origin,
    ...result.garbage.map((g) => g.file),
    ...result.errors,
    ...result.low_confidence,
  ];
}

function getLatestAggregate(shipmentId: string): AggregateResult | null {
  try {
    const db = tryGetDb();
    if (!db) return null;
    const row = db
      .prepare(
        `SELECT aggregate_json FROM extraction_runs
         WHERE shipment_id = ? AND is_superseded = 0
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(shipmentId) as { aggregate_json: string } | undefined;
    return row ? (JSON.parse(row.aggregate_json) as AggregateResult) : null;
  } catch {
    return null;
  }
}

function mergeAggregateRuns(existing: AggregateResult, incoming: AggregateResult): AggregateResult {
  const docsByName = new Map<string, ExtractedDoc>();
  for (const doc of aggregateDocs(existing)) docsByName.set(doc.file_name, doc);
  for (const doc of aggregateDocs(incoming)) docsByName.set(doc.file_name, doc);

  const merged = aggregate([...docsByName.values()], incoming.cross_validation);
  return {
    ...merged,
    summary: {
      ...merged.summary,
      total_haiku_cost_usd:
        (existing.summary.total_haiku_cost_usd ?? 0) + (incoming.summary.total_haiku_cost_usd ?? 0),
    },
    extractedRef: merged.extractedRef ?? incoming.extractedRef ?? existing.extractedRef,
  };
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const shipmentId = formData.get("shipmentId") as string | null;

  const fileEntries = formData.getAll("files");
  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const pdfFiles: PdfFile[] = [];
  const sha256Map = new Map<string, string>(); // file id → sha256
  const bufferMap = new Map<string, Buffer>(); // sha256 → raw buffer (for cache misses)

  for (const entry of fileEntries) {
    if (!(entry instanceof File)) continue;
    if (entry.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${entry.name}" exceeds 20MB limit (${(entry.size / 1024 / 1024).toFixed(1)}MB)` },
        { status: 413 }
      );
    }
    const buffer = Buffer.from(await entry.arrayBuffer());
    const sha256 = computeSha256(buffer);
    sha256Map.set(entry.name, sha256);
    bufferMap.set(sha256, buffer);
    pdfFiles.push({
      id: entry.name,
      name: entry.name,
      buffer,
      sizeBytes: entry.size,
    });
  }

  if (pdfFiles.length === 0) {
    return NextResponse.json({ error: "No valid file entries found" }, { status: 400 });
  }

  // Split into cache hits and misses
  const cachedDocs = new Map<string, ExtractedDoc>(); // file id → cached doc
  const uncachedFiles: PdfFile[] = [];
  const useExtractionCache = process.env.MOCK_DOC_AI !== "true";

  for (const pdfFile of pdfFiles) {
    const sha256 = sha256Map.get(pdfFile.id);
    if (!sha256) { uncachedFiles.push(pdfFile); continue; }

    const cached = useExtractionCache ? getCachedExtraction(sha256) : null;
    if (cached) {
      const buf = bufferMap.get(sha256);
      if (buf) {
        ensureCachedRawPdf(sha256, pdfFile.name, pdfFile.sizeBytes, buf);
      }
      // Return cached result with original file name (id may differ across uploads)
      cachedDocs.set(pdfFile.id, { ...cached, file_id: pdfFile.id, file_name: pdfFile.name });
    } else {
      uncachedFiles.push(pdfFile);
    }
  }

  try {
    // Extract only uncached files. If every file was cached, rebuild the
    // aggregate from cached docs instead of calling extract([]).
    let result = uncachedFiles.length > 0
      ? await extract(uncachedFiles)
      : aggregate([]);

    // Write new extractions to cache
    for (const docList of Object.values(result.detected)) {
      for (const doc of docList as ExtractedDoc[]) {
        const sha256 = sha256Map.get(doc.file_id);
        const buf = sha256 ? bufferMap.get(sha256) : undefined;
        if (sha256 && buf) {
          cacheExtraction(sha256, doc.file_name, doc.file_size_bytes, buf, doc);
        }
      }
    }
    const otherDocs: ExtractedDoc[] = [
      ...result.garbage.map((g) => g.file),
      ...result.errors,
      ...result.low_confidence,
    ];
    for (const doc of otherDocs) {
      const sha256 = sha256Map.get(doc.file_id);
      const buf = sha256 ? bufferMap.get(sha256) : undefined;
      if (sha256 && buf) {
        cacheExtraction(sha256, doc.file_name, doc.file_size_bytes, buf, doc);
      }
    }

    // Inject cached docs back into the detected map
    if (cachedDocs.size > 0) {
      result = mergeAggregateResults(result, [...cachedDocs.values()]);
    }

    // Accumulate per-shipment extractions so counterparties can upload one
    // document at a time without replacing the earlier document set.
    if (shipmentId) {
      const existing = getLatestAggregate(shipmentId);
      if (existing) {
        result = mergeAggregateRuns(existing, result);
      }
    }

    // Record extraction run + shipment files after cached docs are merged.
    if (shipmentId) {
      recordExtractionRun(shipmentId, sha256Map, result, pdfFiles);
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
