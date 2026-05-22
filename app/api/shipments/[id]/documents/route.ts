import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { getDb } from "@/lib/db";
import { computeSha256 } from "@/lib/file-hash";
import { getCachedExtraction, cacheExtraction, ensureCachedRawPdf } from "@/lib/file-cache";
import { buildGroundingContext } from "@/lib/compact-manifest";
import { verifyDoc } from "@/lib/doc-verifier";
import { writeDocEvent } from "@/lib/memwal";
import { storeChunks } from "@/lib/chunk-extractor";
import { runShipmentValidation } from "@/lib/validate-shipment";
import { extractFromPdf } from "@/src/agent/haiku-client";
import { aggregate } from "@/src/agent/aggregator";
import { mockExtractPass } from "@/src/agent/mock-extractor";
import type { ExtractedDoc } from "@/src/agent/schemas/extraction-result";
import type { PdfFile } from "@/src/types";

export const runtime = "nodejs";

const logger = pino({ name: "documents-route" });

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// ── GET: list all document slots with state ────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    // Get template slots for this shipment
    const shipmentRow = db.prepare(
      "SELECT template_id FROM shipments WHERE id = ?"
    ).get(shipmentId) as { template_id: string | null } | undefined;

    if (!shipmentRow) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }

    let slots: Array<{
      slotKey: string;
      displayName: string;
      isRequired: boolean;
      assignedRole: string;
      sortOrder: number;
      document: null | {
        id: string;
        fileName: string;
        docType: string | null;
        state: string;
        confidence: number | null;
        uploadedByRole: string;
        onChainCommitmentTx: string | null;
        uploadedAt: string;
        verifyFailures?: string[];
      };
    }> = [];

    if (shipmentRow.template_id) {
      const templateSlots = db.prepare(
        `SELECT slot_key, display_name, is_required, assigned_role, sort_order
         FROM template_slots WHERE template_id = ? ORDER BY sort_order`
      ).all(shipmentRow.template_id) as {
        slot_key: string;
        display_name: string;
        is_required: number;
        assigned_role: string;
        sort_order: number;
      }[];

      for (const ts of templateSlots) {
        // Get the latest active (non-superseded) file for this slot
        const sf = db.prepare(
          `SELECT id, file_name, doc_type, state, file_size_bytes, uploaded_by_role,
                  on_chain_commitment_tx, uploaded_at
           FROM shipment_files
           WHERE shipment_id = ? AND COALESCE(slot_key, doc_type) = ?
             AND state NOT IN ('superseded')
           ORDER BY uploaded_at DESC LIMIT 1`
        ).get(shipmentId, ts.slot_key) as {
          id: string;
          file_name: string;
          doc_type: string | null;
          state: string;
          file_size_bytes: number;
          uploaded_by_role: string;
          on_chain_commitment_tx: string | null;
          uploaded_at: string;
        } | undefined;

        slots.push({
          slotKey: ts.slot_key,
          displayName: ts.display_name,
          isRequired: ts.is_required === 1,
          assignedRole: ts.assigned_role,
          sortOrder: ts.sort_order,
          document: sf ? {
            id: sf.id,
            fileName: sf.file_name,
            docType: sf.doc_type,
            state: sf.state,
            confidence: null,
            uploadedByRole: sf.uploaded_by_role,
            onChainCommitmentTx: sf.on_chain_commitment_tx,
            uploadedAt: sf.uploaded_at,
          } : null,
        });
      }
    } else {
      // No template: just return all uploaded files
      const files = db.prepare(
        `SELECT id, file_name, doc_type, state, uploaded_by_role,
                on_chain_commitment_tx, uploaded_at,
                COALESCE(slot_key, doc_type) AS slot_key
         FROM shipment_files WHERE shipment_id = ? AND state NOT IN ('superseded')
         ORDER BY uploaded_at ASC`
      ).all(shipmentId) as {
        id: string;
        file_name: string;
        doc_type: string | null;
        state: string;
        uploaded_by_role: string;
        on_chain_commitment_tx: string | null;
        uploaded_at: string;
        slot_key: string | null;
      }[];

      slots = files.map(f => ({
        slotKey: f.slot_key ?? f.doc_type ?? "unknown",
        displayName: f.slot_key ?? f.doc_type ?? "Unknown",
        isRequired: true,
        assignedRole: f.uploaded_by_role,
        sortOrder: 0,
        document: {
          id: f.id,
          fileName: f.file_name,
          docType: f.doc_type,
          state: f.state,
          confidence: null,
          uploadedByRole: f.uploaded_by_role,
          onChainCommitmentTx: f.on_chain_commitment_tx,
          uploadedAt: f.uploaded_at,
        },
      }));
    }

    // Get validation summary
    const validationRun = db.prepare(
      `SELECT overall_verdict, verdict_reason, doc_set_hash, created_at
       FROM validation_runs WHERE shipment_id = ? AND is_superseded = 0
       ORDER BY created_at DESC LIMIT 1`
    ).get(shipmentId) as {
      overall_verdict: string;
      verdict_reason: string;
      doc_set_hash: string | null;
      created_at: string;
    } | undefined;

    const findingsSummary = db.prepare(
      `SELECT severity, COUNT(*) as n FROM validation_findings
       WHERE shipment_id = ? AND status = 'unresolved' GROUP BY severity`
    ).all(shipmentId) as { severity: string; n: number }[];

    return NextResponse.json({
      shipmentId,
      slots,
      validation: validationRun ? {
        overallVerdict: validationRun.overall_verdict,
        verdictReason: validationRun.verdict_reason,
        docSetHash: validationRun.doc_set_hash,
        ranAt: validationRun.created_at,
        findingsSummary: Object.fromEntries(findingsSummary.map(r => [r.severity, r.n])),
      } : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST: upload a single document ────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    // Verify shipment exists
    const shipmentRow = db.prepare(
      "SELECT id, template_id FROM shipments WHERE id = ?"
    ).get(shipmentId) as { id: string; template_id: string | null } | undefined;

    if (!shipmentRow) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const slotKey = (formData.get("slotKey") as string | null) ?? "";
    const uploadedByRole = (formData.get("uploadedByRole") as string | null) ?? "initiator";

    // Size guard
    if (fileEntry.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File exceeds 20MB limit (${(fileEntry.size / 1024 / 1024).toFixed(1)}MB)` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const sha256 = computeSha256(buffer);
    const docId = randomUUID();

    // Supersede any previous non-committed file in the same slot
    const existingInSlot = db.prepare(
      `SELECT id FROM shipment_files
       WHERE shipment_id = ? AND COALESCE(slot_key, doc_type) = ?
         AND state NOT IN ('committed','superseded')
       LIMIT 1`
    ).get(shipmentId, slotKey) as { id: string } | undefined;

    if (existingInSlot) {
      db.prepare("UPDATE shipment_files SET state = 'superseded' WHERE id = ?")
        .run(existingInSlot.id);
      // Invalidate prior validation runs
      db.prepare("UPDATE validation_runs SET is_superseded = 1 WHERE shipment_id = ?")
        .run(shipmentId);
    }

    // Insert placeholder row
    db.prepare(`
      INSERT INTO shipment_files
        (id, shipment_id, sha256, doc_type, slot_key, file_name, size_bytes,
         state, uploaded_by_role, is_final)
      VALUES (?, ?, ?, NULL, ?, ?, ?, 'extracting', ?, 0)
    `).run(docId, shipmentId, sha256, slotKey || null, fileEntry.name, fileEntry.size, uploadedByRole);

    // ── Extraction ────────────────────────────────────────────────────────
    let doc: ExtractedDoc;
    const isMock = process.env.MOCK_DOC_AI === "true";

    if (isMock) {
      const pdfFile: PdfFile = { id: docId, name: fileEntry.name, buffer, sizeBytes: fileEntry.size };
      const mockResult = mockExtractPass([pdfFile]);
      const allDocs: ExtractedDoc[] = [
        ...mockResult.detected.commercial_invoice,
        ...mockResult.detected.packing_list,
        ...mockResult.detected.bill_of_lading,
        ...mockResult.detected.certificate_of_origin,
      ];
      doc = allDocs[0] ?? mockResult.detected.commercial_invoice[0];
    } else {
      // Cache hit check
      const cached = getCachedExtraction(sha256);
      if (cached && cached.error === null) {
        ensureCachedRawPdf(sha256, fileEntry.name, fileEntry.size, buffer);
        doc = { ...cached, file_id: docId, file_name: fileEntry.name };
      } else {
        // Build grounding context from prior docs in this shipment
        const groundingCtx = buildGroundingContext(shipmentId, db);
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const pdfFile: PdfFile = { id: docId, name: fileEntry.name, buffer, sizeBytes: fileEntry.size };

        doc = await extractFromPdf(pdfFile, client, groundingCtx);
        cacheExtraction(sha256, fileEntry.name, fileEntry.size, buffer, doc);
      }
    }

    if (doc.error) {
      db.prepare(
        "UPDATE shipment_files SET state = 'extraction_failed', doc_type = ? WHERE id = ?"
      ).run(doc.extraction_result.document_type, docId);
      return NextResponse.json(
        {
          documentId: docId,
          slotKey,
          state: "extraction_failed",
          error: doc.error,
        },
        { status: 422 }
      );
    }

    // ── Per-doc verify ────────────────────────────────────────────────────
    const verifyResult = verifyDoc(doc);
    const newState = verifyResult.passed ? "verified" : "extraction_failed";
    const detectedDocType = doc.extraction_result.document_type;

    db.prepare(
      "UPDATE shipment_files SET state = ?, doc_type = ? WHERE id = ?"
    ).run(newState, detectedDocType, docId);

    // Store embedding chunks
    storeChunks(doc, sha256, shipmentId, db);

    // Record in extraction_runs for compatibility
    recordExtractionRun(shipmentId, sha256, docId, doc, db);

    // ── Compute extraction hash for on-chain commitment ───────────────────
    const extractionHash = createHash("sha256")
      .update(JSON.stringify(doc.extraction_result))
      .digest("hex");

    // ── Fire-and-forget side effects ──────────────────────────────────────
    if (newState === "verified") {
      // MemWal doc event
      writeDocEvent(shipmentId, "doc_extracted", {
        doc_id: docId,
        slot_key: slotKey,
        sha256,
        extraction_hash: extractionHash,
        doc_type: detectedDocType,
        confidence: doc.extraction_result.confidence,
      });

      // SUI per-doc commitment
      commitDocumentOnChain(shipmentId, docId, slotKey, sha256, extractionHash, db);

      // Auto cross-validate if ≥ 2 distinct doc types are now verified/validated
      const slotTypeCount = (db.prepare(
        `SELECT COUNT(DISTINCT COALESCE(slot_key, doc_type)) as n
         FROM shipment_files WHERE shipment_id = ? AND state IN ('verified','validated','committed')`
      ).get(shipmentId) as { n: number }).n;

      if (slotTypeCount >= 2) {
        triggerAutoValidate(shipmentId, db);
      }
    }

    return NextResponse.json({
      documentId: docId,
      slotKey,
      docType: detectedDocType,
      state: newState,
      confidence: doc.extraction_result.confidence,
      fileName: fileEntry.name,
      sha256,
      extractionHash,
      verifyFailures: verifyResult.failures,
      onChainCommitmentTx: null, // filled async — poll GET /documents
    });
  } catch (err) {
    logger.error({ err }, "Document upload failed");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function recordExtractionRun(
  shipmentId: string,
  sha256: string,
  docId: string,
  doc: ExtractedDoc,
  db: ReturnType<typeof getDb>
) {
  try {
    // Build a minimal aggregate so existing extraction_runs queries still work
    const agg = aggregate([doc]);

    // Mark previous runs as superseded
    db.prepare(
      "UPDATE extraction_runs SET is_superseded = 1 WHERE shipment_id = ?"
    ).run(shipmentId);

    db.prepare(`
      INSERT INTO extraction_runs (id, shipment_id, file_sha256s, aggregate_json)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), shipmentId, JSON.stringify([sha256]), JSON.stringify(agg));

    // Update shipment_files doc_type if still null
    db.prepare(
      "UPDATE shipment_files SET doc_type = ? WHERE id = ? AND doc_type IS NULL"
    ).run(doc.extraction_result.document_type, docId);
  } catch (err) {
    logger.warn({ err, shipmentId }, "Failed to record extraction_run — non-fatal");
  }
}

function commitDocumentOnChain(
  shipmentId: string,
  docId: string,
  slotKey: string,
  sha256: string,
  extractionHash: string,
  db: ReturnType<typeof getDb>
) {
  const isMockSui = process.env.SUI_CLIENT !== "real";

  if (isMockSui) {
    // Mock: write a fake tx digest immediately
    const mockTx = `0xmock_commit_${docId.slice(0, 8)}_${Date.now().toString(16)}`;
    db.prepare(
      "UPDATE shipment_files SET on_chain_commitment_tx = ? WHERE id = ?"
    ).run(mockTx, docId);
    return;
  }

  // Real SUI: fire-and-forget
  import("@/lib/sui-passport")
    .then(({ getSuiPassportClient }) => {
      const client = getSuiPassportClient() as unknown as {
        commitDocument?: (
          shipmentId: string,
          docId: string,
          slotKey: string,
          sha256: string,
          extractionHash: string
        ) => Promise<{ txDigest: string }>;
      };
      if (typeof client.commitDocument !== "function") return;
      return client.commitDocument(shipmentId, docId, slotKey, sha256, extractionHash);
    })
    .then((result) => {
      if (result?.txDigest) {
        db.prepare(
          "UPDATE shipment_files SET on_chain_commitment_tx = ? WHERE id = ?"
        ).run(result.txDigest, docId);
        logger.info({ docId, txDigest: result.txDigest }, "SUI commitDocument success");
      }
    })
    .catch((err) => {
      logger.error({ err, docId }, "SUI commitDocument failed — doc still usable");
    });
}

function triggerAutoValidate(shipmentId: string, db: ReturnType<typeof getDb>) {
  // Non-blocking: run cross-validation in background
  runShipmentValidation(shipmentId, db)
    .then((result) => {
      if (result) {
        writeDocEvent(shipmentId, "doc_validated", {
          overall_verdict: result.overallVerdict,
          finding_count: result.findings.length,
          doc_set_hash: result.docSetHash,
        });
        logger.info(
          { shipmentId, verdict: result.overallVerdict, findings: result.findings.length },
          "Auto-validation complete"
        );
      }
    })
    .catch((err) => {
      logger.warn({ err, shipmentId }, "Auto-validation failed — non-blocking");
    });
}
