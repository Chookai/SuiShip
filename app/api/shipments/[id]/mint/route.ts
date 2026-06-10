import { NextRequest, NextResponse } from "next/server";
import { executeMintSequence } from "@/lib/mint-sequence";
import { resolveMintOwnerAddress } from "@/lib/party-slush-accounts";
import { getShipmentById } from "@/lib/shipments-server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const shipment = getShipmentById(shipmentId);
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { ownerAddress?: string };
    const ownerAddress =
      typeof body.ownerAddress === "string" && body.ownerAddress.trim().length > 0
        ? body.ownerAddress.trim()
        : resolveMintOwnerAddress(shipment.workflow);

    const result = await executeMintSequence(shipmentId, ownerAddress);

    if ("error" in result) {
      const statusCode = result.retriable ? 500 : 400;
      return NextResponse.json(result, { status: statusCode });
    }

    const shipment = getShipmentById(shipmentId);
    return NextResponse.json(shipment ?? result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
