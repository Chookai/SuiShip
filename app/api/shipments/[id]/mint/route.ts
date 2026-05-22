import { NextRequest, NextResponse } from "next/server";
import { executeMintSequence } from "@/lib/mint-sequence";
import { getShipmentById } from "@/lib/shipments-server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as { ownerAddress?: string };
    const ownerAddress = body.ownerAddress;
    if (!ownerAddress || typeof ownerAddress !== "string" || ownerAddress.trim() === "") {
      return NextResponse.json(
        { error: "ownerAddress is required in the request body" },
        { status: 400 }
      );
    }

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
