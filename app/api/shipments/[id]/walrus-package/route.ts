import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getDb } from "@/lib/db";
import { aggregatorUrl, storeBlobServer, WALRUS_AGGREGATOR, WALRUS_MINT_EPOCHS } from "@/lib/walrus";

export const runtime = "nodejs";

type ShipmentFileRow = {
  sha256: string;
  doc_type: string | null;
  file_name: string;
  size_bytes: number;
  raw_pdf: Buffer | null;
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();
    const files = db
      .prepare(
        `SELECT sf.sha256, sf.doc_type, sf.file_name, sf.size_bytes, fc.raw_pdf
         FROM shipment_files sf
         JOIN file_cache fc ON fc.sha256 = sf.sha256
         WHERE sf.shipment_id = ?
         ORDER BY sf.uploaded_at ASC`
      )
      .all(shipmentId) as ShipmentFileRow[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No uploaded PDFs found for this shipment. Upload documents before creating the passport." },
        { status: 400 }
      );
    }

    const missingFiles = files.filter((file) => !file.raw_pdf);
    if (missingFiles.length > 0) {
      return NextResponse.json(
        {
          error: `Some uploaded PDFs are missing from the local cache: ${missingFiles
            .map((file) => file.file_name)
            .join(", ")}. Please re-upload them before creating the passport.`
        },
        { status: 400 }
      );
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
        size_bytes: file.size_bytes
      };
    });

    zip.file(
      "suiship_manifest.json",
      JSON.stringify(
        {
          schema_version: "suiship.walrus_package.v1",
          shipment_id: shipmentId,
          created_at: new Date().toISOString(),
          documents
        },
        null,
        2
      )
    );

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    const packageFileName = `${shipmentId}-documents.zip`;
    const result = await storeBlobServer({
      data: zipBuffer,
      fileName: packageFileName,
      mimeType: "application/zip",
      epochs: WALRUS_MINT_EPOCHS
    });

    db.prepare(
      `INSERT OR REPLACE INTO walrus_blobs
        (blob_id, shipment_id, purpose, file_name, size_bytes, sha256, end_epoch, publisher)
       VALUES (?, ?, 'document_package', ?, ?, NULL, ?, ?)`
    ).run(result.blobId, shipmentId, packageFileName, result.sizeBytes, result.endEpoch ?? null, result.publisher);

    db.prepare(
      "UPDATE shipment_files SET is_final = 1, walrus_blob_id = ? WHERE shipment_id = ?"
    ).run(result.blobId, shipmentId);

    const clearPdf = db.prepare("UPDATE file_cache SET raw_pdf = NULL WHERE sha256 = ?");
    for (const file of files) {
      clearPdf.run(file.sha256);
    }

    return NextResponse.json({
      blobId: result.blobId,
      fileName: packageFileName,
      sizeBytes: result.sizeBytes,
      uploadedAt: new Date().toISOString(),
      endEpoch: result.endEpoch,
      publisher: result.publisher,
      aggregator: WALRUS_AGGREGATOR,
      readUrl: aggregatorUrl(result.blobId),
      documentCount: documents.length
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
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
