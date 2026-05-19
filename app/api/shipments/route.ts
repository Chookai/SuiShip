import { NextRequest, NextResponse } from "next/server";
import { listShipments, upsertShipment } from "@/lib/shipments-server";
import type { ShipmentRecord } from "@/lib/shipments-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const shipments = listShipments();
    return NextResponse.json(shipments);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const record = (await request.json()) as ShipmentRecord;
    if (!record?.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    upsertShipment(record);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
