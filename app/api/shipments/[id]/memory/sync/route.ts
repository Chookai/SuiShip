import { NextRequest, NextResponse } from "next/server";
import { buildCompactManifest } from "@/lib/compact-manifest";
import { getDb } from "@/lib/db";
import { writeShipmentMemoryAfterMint } from "@/lib/agents/memory-agent";
import { getShipmentById, updateShipmentMemWalSync } from "@/lib/shipments-server";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: shipmentId } = await params;
  const db = getDb();
  const shipment = getShipmentById(shipmentId);

  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }
  if (!shipment.passportId || !shipment.txDigest) {
    return NextResponse.json({ error: "Shipment must be minted before memory sync" }, { status: 400 });
  }

  const walrusBlobIds = shipment.walrusBlobIds ?? [shipment.walrusManifestBlobId].filter((id): id is string => Boolean(id));
  if (walrusBlobIds.length === 0) {
    return NextResponse.json({ error: "Shipment has no Walrus blob IDs to anchor memory" }, { status: 400 });
  }

  updateShipmentMemWalSync(shipmentId, {
    memWalSpaceId: shipment.memWalSpaceId,
    status: "pending",
    error: null,
    syncedAt: null,
  });

  try {
    await writeShipmentMemoryAfterMint({
      shipment,
      compactManifest: buildCompactManifest(shipmentId, db),
      passportId: shipment.passportId,
      txDigest: shipment.txDigest,
      walrusBlobIds,
    });
    updateShipmentMemWalSync(shipmentId, {
      memWalSpaceId: shipment.memWalSpaceId,
      status: "synced",
      error: null,
      syncedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, status: "synced" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateShipmentMemWalSync(shipmentId, {
      memWalSpaceId: shipment.memWalSpaceId,
      status: "failed",
      error: message,
      syncedAt: null,
    });
    return NextResponse.json({ error: message, status: "failed" }, { status: 500 });
  }
}
