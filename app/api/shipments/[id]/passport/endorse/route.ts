import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getSuiPassportClient } from "@/lib/sui-passport";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as {
      role?: string;
      action?: string;
      noteHash?: string;
      capObjectId?: string;
      requesterAddress?: string;
    };

    const { role, action, noteHash, capObjectId, requesterAddress } = body;
    if (!role || !action || !requesterAddress) {
      return NextResponse.json(
        { error: "role, action, and requesterAddress are required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const row = db.prepare(
      "SELECT passport_id, endorsement_log_object_id FROM shipments WHERE id = ?"
    ).get(shipmentId) as { passport_id: string | null; endorsement_log_object_id: string | null } | undefined;

    if (!row?.passport_id) {
      return NextResponse.json({ error: "Shipment has not been minted yet" }, { status: 400 });
    }
    if (!row.endorsement_log_object_id) {
      return NextResponse.json(
        { error: "Endorsement log object ID not recorded — mint may have used an older contract" },
        { status: 400 }
      );
    }

    const client = getSuiPassportClient();
    const logObjectId = row.endorsement_log_object_id;
    let txDigest: string;

    if (role === "freight_forwarder") {
      if (!capObjectId) {
        return NextResponse.json({ error: "capObjectId required for freight_forwarder role" }, { status: 400 });
      }
      ({ txDigest } = await client.endorseAsFreightForwarder({ logObjectId, capObjectId, action, noteHash }));
    } else if (role === "customs") {
      if (!capObjectId) {
        return NextResponse.json({ error: "capObjectId required for customs role" }, { status: 400 });
      }
      ({ txDigest } = await client.endorseAsCustoms({ logObjectId, capObjectId, action, noteHash }));
    } else {
      ({ txDigest } = await client.endorseShipment({ logObjectId, role, action, noteHash }));
    }

    const signedAtMs = Date.now();
    db.prepare(`
      INSERT OR IGNORE INTO passport_endorsements
        (id, shipment_id, passport_id, log_object_id, role, signer_address, action, note_hash, signed_at_ms, tx_digest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), shipmentId, row.passport_id, logObjectId,
      role, requesterAddress, action, noteHash ?? null,
      signedAtMs, txDigest
    );

    return NextResponse.json({ txDigest, endorsement: { role, signer: requesterAddress, action, signedAtMs } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
