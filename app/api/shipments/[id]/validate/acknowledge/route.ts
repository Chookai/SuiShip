import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Waive all warning-level unresolved findings so a shipment with only warnings
 * can proceed to mint. Error-severity findings cannot be waived.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    const errorCount = (db.prepare(
      `SELECT COUNT(*) as n FROM validation_findings
       WHERE shipment_id = ? AND severity = 'error' AND status = 'unresolved'`
    ).get(shipmentId) as { n: number }).n;

    if (errorCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot acknowledge: ${errorCount} unresolved error(s) remain. Only warnings can be waived.`,
          errorCount,
        },
        { status: 400 }
      );
    }

    const result = db.prepare(
      `UPDATE validation_findings SET status = 'waived'
       WHERE shipment_id = ? AND severity = 'warning' AND status = 'unresolved'`
    ).run(shipmentId);

    return NextResponse.json({
      acknowledged: true,
      waivedCount: result.changes,
      message: `${result.changes} warning finding(s) waived. Shipment can now proceed to mint.`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
