import { getDb } from "./db";
import type { ExtractedDoc } from "@/src/agent/schemas/extraction-result";

type FileCacheRow = {
  sha256: string;
  file_name: string;
  size_bytes: number;
  extraction_json: string;
  haiku_input_tokens: number;
  haiku_output_tokens: number;
  haiku_latency_ms: number;
};

function tryGetDb() {
  try {
    return getDb();
  } catch {
    return null;
  }
}

export function getCachedExtraction(sha256: string): ExtractedDoc | null {
  try {
    const db = tryGetDb();
    if (!db) return null;
    const row = db
      .prepare("SELECT * FROM file_cache WHERE sha256 = ?")
      .get(sha256) as FileCacheRow | undefined;
    if (!row) return null;
    db.prepare(
      "UPDATE file_cache SET last_hit_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE sha256 = ?"
    ).run(sha256);
    return JSON.parse(row.extraction_json) as ExtractedDoc;
  } catch {
    return null;
  }
}

export function cacheExtraction(
  sha256: string,
  fileName: string,
  sizeBytes: number,
  rawPdf: Buffer,
  doc: ExtractedDoc
): void {
  try {
    const db = tryGetDb();
    if (!db) return;
    db.prepare(`
      INSERT OR REPLACE INTO file_cache
        (sha256, file_name, size_bytes, raw_pdf, extraction_json,
         haiku_input_tokens, haiku_output_tokens, haiku_latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sha256,
      fileName,
      sizeBytes,
      rawPdf,
      JSON.stringify(doc),
      doc.haiku_input_tokens,
      doc.haiku_output_tokens,
      doc.haiku_latency_ms
    );
  } catch {
    // non-fatal
  }
}

export function ensureCachedRawPdf(
  sha256: string,
  fileName: string,
  sizeBytes: number,
  rawPdf: Buffer
): void {
  try {
    const db = tryGetDb();
    if (!db) return;
    db.prepare(`
      UPDATE file_cache
      SET raw_pdf = COALESCE(raw_pdf, ?),
          file_name = ?,
          size_bytes = ?,
          last_hit_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE sha256 = ?
    `).run(rawPdf, fileName, sizeBytes, sha256);
  } catch {
    // non-fatal
  }
}
