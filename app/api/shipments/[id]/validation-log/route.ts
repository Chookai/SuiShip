import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    const rows = db.prepare(`
      SELECT overall_verdict, verdict_reason, doc_set_hash, created_at
      FROM validation_runs
      WHERE shipment_id = ?
      ORDER BY created_at DESC
    `).all(shipmentId) as Array<{
      overall_verdict: string | null;
      verdict_reason: string | null;
      doc_set_hash: string | null;
      created_at: string;
    }>;

    const docCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM shipment_files WHERE shipment_id = ?"
    ).get(shipmentId) as { cnt: number })?.cnt ?? 0;

    const entries = rows.map((row) => ({
      docCount,
      verdict: row.overall_verdict ?? "unknown",
      reason: row.verdict_reason ?? undefined,
      timestamp: row.created_at,
    }));

    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
