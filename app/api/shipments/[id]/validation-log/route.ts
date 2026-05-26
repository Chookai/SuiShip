import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    const shipmentRow = db.prepare(
      "SELECT created_at, status FROM shipments WHERE id = ?"
    ).get(shipmentId) as { created_at: string; status: string } | undefined;

    const rows = db.prepare(`
      SELECT overall_verdict, verdict_reason, doc_set_hash, created_at,
             input_manifest_json, issues_json
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
    }>;

    const currentDocCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM shipment_files WHERE shipment_id = ?"
    ).get(shipmentId) as { cnt: number })?.cnt ?? 0;

    type Entry = {
      kind: "created" | "validation" | "cleared";
      docCount: number;
      uploadedCount: number;
      verdict?: string;
      reason?: string;
      issues?: IssueSummary[];
      timestamp: string;
    };

    const entries: Entry[] = [];

    const validationRows = rows.filter(r => r.overall_verdict !== "documents_cleared");
    const clearedRows = rows.filter(r => r.overall_verdict === "documents_cleared");

    if (validationRows.length === 0 && shipmentRow) {
      entries.push({
        kind: "created",
        docCount: currentDocCount,
        uploadedCount: currentDocCount,
        timestamp: shipmentRow.created_at,
      });
    } else {
      for (let i = 0; i < validationRows.length; i++) {
        const row = validationRows[i];
        const counts = parseCounts(row.input_manifest_json, currentDocCount);
        const issues = parseIssues(row.issues_json);
        if (i === 0) {
          entries.push({
            kind: "created",
            docCount: counts.docCount,
            uploadedCount: counts.uploadedCount,
            verdict: row.overall_verdict ?? "unknown",
            reason: row.verdict_reason ?? undefined,
            issues: issues.length > 0 ? issues : undefined,
            timestamp: shipmentRow?.created_at ?? row.created_at,
          });
        } else {
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
      }
    }

    for (const row of clearedRows) {
      entries.push({
        kind: "cleared",
        docCount: 0,
        uploadedCount: 0,
        reason: row.verdict_reason ?? undefined,
        timestamp: row.created_at,
      });
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
