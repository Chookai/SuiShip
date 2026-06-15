import { NextRequest, NextResponse, after } from "next/server";
import { getDb } from "@/lib/db";
import { getLatestRiskScan, runRiskScanForShipment } from "@/lib/agents/risk-agent";

export const runtime = "nodejs";

async function readBackgroundFlag(request: NextRequest): Promise<boolean> {
  try {
    const body = (await request.json()) as { background?: unknown } | null;
    return body?.background === true;
  } catch {
    return false;
  }
}

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    // Background mode: kick the scan off after responding so callers (e.g. the
    // create flow) can trigger it and navigate away without waiting for the
    // full MemWal + live-search pipeline to finish.
    if (await readBackgroundFlag(request)) {
      after(async () => {
        try {
          await runRiskScanForShipment(shipmentId, db);
        } catch {
          // Scan failures are persisted by runRiskScanForShipment; nothing to surface here.
        }
      });
      return NextResponse.json({ shipmentId, status: "scanning" }, { status: 202 });
    }

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
