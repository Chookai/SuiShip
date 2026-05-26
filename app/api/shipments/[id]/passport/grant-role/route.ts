import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSuiPassportClient } from "@/lib/sui-passport";
import { parseEd25519Keypair } from "@/lib/sui-keypair";

function getServerAddress(): string {
  const key = process.env.SUI_PRIVATE_KEY;
  if (!key) throw new Error("SUI_PRIVATE_KEY not set");
  return parseEd25519Keypair(key).toSuiAddress();
}

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as {
      role?: string;
      granteeAddress?: string;
      passportObjectId?: string;
    };

    const { role, granteeAddress, passportObjectId } = body;
    if (!role) {
      return NextResponse.json(
        { error: "role is required" },
        { status: 400 }
      );
    }
    const effectiveGrantee = granteeAddress || getServerAddress();
    if (role !== "freight_forwarder" && role !== "customs") {
      return NextResponse.json(
        { error: "role must be 'freight_forwarder' or 'customs'" },
        { status: 400 }
      );
    }

    const db = getDb();
    const row = db.prepare("SELECT passport_id FROM shipments WHERE id = ?")
      .get(shipmentId) as { passport_id: string | null } | undefined;

    if (!row?.passport_id) {
      return NextResponse.json({ error: "Shipment has not been minted yet" }, { status: 400 });
    }

    const resolvedPassportObjectId = passportObjectId ?? row.passport_id;
    const client = getSuiPassportClient();
    const { txDigest, capObjectId } = await client.grantRole({
      passportObjectId: resolvedPassportObjectId,
      role,
      granteeAddress: effectiveGrantee,
    });

    return NextResponse.json({ txDigest, capObjectId, role, granteeAddress: effectiveGrantee });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
