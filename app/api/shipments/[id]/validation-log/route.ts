import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { formatEndorsementActivityLabel } from "@/lib/endorsement-flow";

export const runtime = "nodejs";

function parseCounts(manifestJson: string | null, fallbackTotal: number): { docCount: number; uploadedCount: number } {
  if (!manifestJson) return { docCount: fallbackTotal, uploadedCount: fallbackTotal };
  try {
    const parsed = JSON.parse(manifestJson);
    const docCount = typeof parsed.doc_count === "number" ? parsed.doc_count : fallbackTotal;
    const uploadedCount = typeof parsed.uploaded_count === "number" ? parsed.uploaded_count : docCount;
    return { docCount, uploadedCount };
  } catch { /* ignore */ }
  return { docCount: fallbackTotal, uploadedCount: fallbackTotal };
}

type IssueSummary = { severity: string; message: string; field?: string };

function parseIssues(issuesJson: string | null): IssueSummary[] {
  if (!issuesJson) return [];
  try {
    const arr = JSON.parse(issuesJson);
    if (!Array.isArray(arr)) return [];
    return arr.map((i: Record<string, unknown>) => ({
      severity: String(i.severity ?? "info"),
      message: String(i.message ?? i.description ?? ""),
      field: i.field ? String(i.field) : undefined,
    })).filter((i: IssueSummary) => i.message);
  } catch { return []; }
}

function creatorCompanyName(
  createdBy: string,
  importerJson: string | null,
  exporterJson: string | null,
): string {
  const json = createdBy === "importer" ? importerJson : exporterJson;
  if (json) {
    try {
      const party = JSON.parse(json) as { company?: string };
      const company = party.company?.trim();
      if (company) return company;
    } catch {
      // ignore malformed JSON
    }
  }
  return createdBy.charAt(0).toUpperCase() + createdBy.slice(1);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    const shipmentRow = db.prepare(
      "SELECT created_at, status, created_by, importer_json, exporter_json, minted_at, tx_digest FROM shipments WHERE id = ?"
    ).get(shipmentId) as {
      created_at: string;
      status: string;
      created_by: string;
      importer_json: string | null;
      exporter_json: string | null;
      minted_at: string | null;
      tx_digest: string | null;
    } | undefined;

    let importerCompany: string | null = null;
    if (shipmentRow?.importer_json) {
      try {
        const importer = JSON.parse(shipmentRow.importer_json) as { company?: string };
        importerCompany = importer.company?.trim() || null;
      } catch {
        // ignore malformed JSON
      }
    }

    const rows = db.prepare(`
      SELECT overall_verdict, verdict_reason, doc_set_hash, created_at,
             input_manifest_json, issues_json, is_superseded
      FROM validation_runs
      WHERE shipment_id = ?
      ORDER BY created_at ASC
    `).all(shipmentId) as Array<{
      overall_verdict: string | null;
      verdict_reason: string | null;
      doc_set_hash: string | null;
      created_at: string;
      input_manifest_json: string | null;
      issues_json: string | null;
      is_superseded: number;
    }>;

    const currentDocCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM shipment_files WHERE shipment_id = ?"
    ).get(shipmentId) as { cnt: number })?.cnt ?? 0;

    type Entry = {
      kind: "created" | "validation" | "cleared" | "endorsement" | "passport_minted";
      docCount: number;
      uploadedCount: number;
      verdict?: string;
      reason?: string;
      issues?: IssueSummary[];
      clearedDocuments?: string[];
      timestamp: string;
      role?: string;
      action?: string;
      signerAddress?: string;
      txDigest?: string;
      summary?: string;
    };

    const entries: Entry[] = [];

    const validationRows = rows.filter(
      (r) => r.overall_verdict !== "documents_cleared" && r.is_superseded === 0,
    );
    const clearedRows = rows.filter((r) => r.overall_verdict === "documents_cleared");

    if (shipmentRow) {
      entries.push({
        kind: "created",
        docCount: 0,
        uploadedCount: 0,
        summary: `Shipment created by ${creatorCompanyName(
          shipmentRow.created_by,
          shipmentRow.importer_json,
          shipmentRow.exporter_json,
        )}`,
        timestamp: shipmentRow.created_at,
      });
    }

    for (const row of validationRows) {
      const counts = parseCounts(row.input_manifest_json, currentDocCount);
      const issues = parseIssues(row.issues_json);
      entries.push({
        kind: "validation",
        docCount: counts.docCount,
        uploadedCount: counts.uploadedCount,
        verdict: row.overall_verdict ?? "unknown",
        reason: row.verdict_reason ?? undefined,
        issues: issues.length > 0 ? issues : undefined,
        timestamp: row.created_at,
      });
    }

    for (const row of clearedRows) {
      let actor = "User";
      let cleared: string[] = [];
      if (row.input_manifest_json) {
        try {
          const manifest = JSON.parse(row.input_manifest_json) as { actor?: string; cleared?: string[] };
          actor = manifest.actor?.trim() || actor;
          cleared = Array.isArray(manifest.cleared) ? manifest.cleared.filter(Boolean) : [];
        } catch {
          // ignore malformed JSON
        }
      }
      const count = cleared.length;
      entries.push({
        kind: "cleared",
        docCount: 0,
        uploadedCount: 0,
        summary: `${count} document${count !== 1 ? "s" : ""} cleared by ${actor}`,
        clearedDocuments: cleared,
        reason: cleared.length > 0 ? cleared.join(", ") : row.verdict_reason ?? undefined,
        timestamp: row.created_at,
      });
    }

    const endorsementRows = db.prepare(`
      SELECT role, signer_address, action, signed_at_ms, tx_digest, created_at
      FROM passport_endorsements
      WHERE shipment_id = ?
      ORDER BY signed_at_ms ASC
    `).all(shipmentId) as Array<{
      role: string;
      signer_address: string;
      action: string;
      signed_at_ms: number;
      tx_digest: string;
      created_at: string;
    }>;

    for (const row of endorsementRows) {
      const timestamp = row.signed_at_ms
        ? new Date(row.signed_at_ms).toISOString()
        : row.created_at;
      entries.push({
        kind: "endorsement",
        docCount: 0,
        uploadedCount: 0,
        role: row.role,
        action: row.action,
        signerAddress: row.signer_address,
        txDigest: row.tx_digest,
        summary: formatEndorsementActivityLabel(row.action, importerCompany),
        timestamp,
      });
    }

    if (shipmentRow?.minted_at) {
      entries.push({
        kind: "passport_minted",
        docCount: 0,
        uploadedCount: 0,
        txDigest: shipmentRow.tx_digest ?? undefined,
        summary: `Passport created by ${creatorCompanyName(
          shipmentRow.created_by,
          shipmentRow.importer_json,
          shipmentRow.exporter_json,
        )}`,
        timestamp: shipmentRow.minted_at,
      });
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
