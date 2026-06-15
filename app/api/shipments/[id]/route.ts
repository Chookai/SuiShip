import { NextRequest, NextResponse } from "next/server";
import {
  getShipmentById,
  upsertShipment,
  deleteShipment,
} from "@/lib/shipments-server";
import type { ShipmentRecord } from "@/lib/shipments-store";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const record = getShipmentById(id);
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = getShipmentById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const patch = (await request.json()) as Partial<ShipmentRecord>;
    const updated: ShipmentRecord = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    upsertShipment(updated);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    deleteShipment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
