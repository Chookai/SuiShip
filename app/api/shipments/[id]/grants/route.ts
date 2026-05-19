import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSuiPassportClient } from "@/lib/sui-passport";
import type { MemWalAccessScope } from "@/lib/sui-passport/types";

export const runtime = "nodejs";

type PassportRow = { passport_id: string | null };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    const row = db
      .prepare("SELECT passport_id FROM shipments WHERE id = ?")
      .get(shipmentId) as PassportRow | undefined;

    if (!row?.passport_id) {
      return NextResponse.json({ error: "Shipment not minted" }, { status: 400 });
    }

    const suiClient = getSuiPassportClient();
    const grants = await suiClient.listGrants(row.passport_id);
    return NextResponse.json(grants);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as {
      granteeAddress?: string;
      scope?: MemWalAccessScope;
      expiresAt?: string;
    };

    if (!body.granteeAddress || !body.scope) {
      return NextResponse.json({ error: "granteeAddress and scope are required" }, { status: 400 });
    }

    const db = getDb();
    const row = db
      .prepare("SELECT passport_id FROM shipments WHERE id = ?")
      .get(shipmentId) as PassportRow | undefined;

    if (!row?.passport_id) {
      return NextResponse.json({ error: "Shipment not minted" }, { status: 400 });
    }

    const suiClient = getSuiPassportClient();
    const result = await suiClient.grantAccess({
      passportId: row.passport_id,
      granteeAddress: body.granteeAddress,
      scope: body.scope,
      expiresAt: body.expiresAt,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
