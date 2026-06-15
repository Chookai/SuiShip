import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSuiPassportClient } from "@/lib/sui-passport";

export const runtime = "nodejs";

type PassportRow = { passport_id: string | null };

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) {
  try {
    const { id: shipmentId, grantId } = await params;
    const db = getDb();

    const row = db
      .prepare("SELECT passport_id FROM shipments WHERE id = ?")
      .get(shipmentId) as PassportRow | undefined;

    if (!row?.passport_id) {
      return NextResponse.json({ error: "Shipment not minted" }, { status: 400 });
    }

    const suiClient = getSuiPassportClient();
    const result = await suiClient.revokeAccess({
      passportId: row.passport_id,
      grantId,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
