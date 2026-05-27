import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLatestRiskScan, runRiskScanForShipment } from "@/lib/agents/risk-agent";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();
    const scan = getLatestRiskScan(shipmentId, db);
    if (!scan) {
      return NextResponse.json({ error: "No risk scan found" }, { status: 404 });
    }
    return NextResponse.json(scan);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();
    const scan = await runRiskScanForShipment(shipmentId, db);
    const status = scan.status === "failed" ? 502 : 200;
    return NextResponse.json(scan, { status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
