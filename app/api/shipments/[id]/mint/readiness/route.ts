import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { checkMintGate } from "@/lib/mint-sequence";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();
    const gate = checkMintGate(shipmentId, db);
    const needsRevalidate = gate.blockers.some(
      (b) =>
        b.includes("No validation run found") ||
        b.includes("Document set changed since last validation")
    );

    return NextResponse.json({
      ok: gate.ok,
      blockers: gate.blockers,
      needsRevalidate,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
