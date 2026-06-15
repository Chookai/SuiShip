import { NextRequest, NextResponse } from "next/server";
import { executeMintSequence } from "@/lib/mint-sequence";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { shipmentId?: string; ownerAddress?: string };
    const shipmentId = body.shipmentId?.trim();

    if (!shipmentId) {
      return NextResponse.json({ error: "shipmentId is required" }, { status: 400 });
    }

    const ownerAddress = body.ownerAddress ?? "0xmock_owner_address";
    const result = await executeMintSequence(shipmentId, ownerAddress);

    if ("error" in result) {
      const statusCode = result.retriable ? 500 : 400;
      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
