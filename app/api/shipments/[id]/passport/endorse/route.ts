import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { validateDemoEndorsementAttempt } from "@/lib/endorsement-flow";
import {
  getPartySlushKeypairForEndorsementRole,
  isPartySlushSigningEnabled,
} from "@/lib/party-slush-accounts";
import { writeProgressMemory } from "@/lib/memwal";
import { getSuiPassportClient } from "@/lib/sui-passport";
import { parseEd25519Keypair } from "@/lib/sui-keypair";
import { registerShipmentForTracking } from "@/lib/tracker-api/client";
import { logTrackerFailure } from "@/lib/tracker-api/retry";
import { ensureMonitoredShipment } from "@/lib/persistent-agent";

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
      action?: string;
      noteHash?: string;
      capObjectId?: string;
      requesterAddress?: string;
      signerKeyHex?: string;
      usePartySlushSigner?: boolean;
    };

    const { role, action, noteHash, capObjectId, requesterAddress, signerKeyHex, usePartySlushSigner } =
      body;
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
    const serverAddr = getServerAddress();

    let signerKeypair = signerKeyHex ? parseEd25519Keypair(signerKeyHex) : undefined;
    if (usePartySlushSigner) {
      if (!isPartySlushSigningEnabled()) {
        return NextResponse.json(
          { error: "Party slush signing is disabled (set ENABLE_PARTY_SLUSH_SIGNING=true)" },
          { status: 400 }
        );
      }
      signerKeypair = getPartySlushKeypairForEndorsementRole(role) ?? undefined;
      if (!signerKeypair) {
        return NextResponse.json(
          { error: `No slush key configured for endorsement role "${role}"` },
          { status: 400 }
        );
      }
    }

    const effectiveSigner =
      signerKeypair?.toSuiAddress() ??
      (role === "importer" && !usePartySlushSigner ? serverAddr : requesterAddress);
    const signerAddress = effectiveSigner;

    if (signerKeypair && signerKeypair.toSuiAddress().toLowerCase() !== requesterAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Signer does not match requesterAddress" },
        { status: 400 }
      );
    }

    let importerAddress: string | null = null;
    let exporterAddress: string | null = null;
    try {
      const passport = await client.getPassport(row.passport_id);
      importerAddress = passport.importer ?? null;
      exporterAddress = passport.exporter ?? null;
    } catch {
      // Best-effort enrichment only. The client/move call will still enforce signer auth.
    }

    const existingEndorsements = db.prepare(
      `SELECT role, signer_address, action, signed_at_ms, tx_digest
       FROM passport_endorsements
       WHERE shipment_id = ?
       ORDER BY signed_at_ms ASC, created_at ASC`
    ).all(shipmentId) as Array<{
      role: string;
      signer_address: string;
      action: string;
      signed_at_ms: number;
      tx_digest: string;
    }>;

    const flowCheck = validateDemoEndorsementAttempt({
      role,
      action,
      endorsements: existingEndorsements,
      signerAddress,
      importerAddress,
      exporterAddress,
    });
    if (!flowCheck.ok) {
      return NextResponse.json({ error: flowCheck.error }, { status: 409 });
    }

    let txDigest: string;

    if (role === "freight_forwarder") {
      if (!capObjectId) {
        return NextResponse.json({ error: "capObjectId required for freight_forwarder role" }, { status: 400 });
      }
      ({ txDigest } = await client.endorseAsFreightForwarder({
        logObjectId,
        capObjectId,
        action,
        noteHash,
        signerKeypair,
      }));
    } else if (role === "customs") {
      if (!capObjectId) {
        return NextResponse.json({ error: "capObjectId required for customs role" }, { status: 400 });
      }
      ({ txDigest } = await client.endorseAsCustoms({
        logObjectId,
        capObjectId,
        action,
        noteHash,
        signerKeypair,
      }));
    } else {
      ({ txDigest } = await client.endorseShipment({ logObjectId, role, action, noteHash, signerKeypair }));
    }

    const signedAtMs = Date.now();
    const timestamp = new Date(signedAtMs).toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO passport_endorsements
        (id, shipment_id, passport_id, log_object_id, role, signer_address, action, note_hash, signed_at_ms, tx_digest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), shipmentId, row.passport_id, logObjectId,
      role, signerAddress, action, noteHash ?? null,
      signedAtMs, txDigest
    );

    // When the freight forwarder signs picked_up, cargo enters physical transit.
    // Register with the mock tracker and start AIS monitoring — best-effort:
    // a failure here must never block the on-chain endorsement.
    let trackingOutcome:
      | { id: string; status: "active"; registeredAt: string }
      | { status: "registration_failed"; willRetry: true }
      | undefined;

    if (role === "freight_forwarder" && action === "picked_up") {
      try {
        const shipmentRow = db.prepare(
          "SELECT shipment_json FROM shipments WHERE id = ?"
        ).get(shipmentId) as { shipment_json: string } | undefined;

        let origin = "Singapore";
        let destination = "Los Angeles";
        if (shipmentRow?.shipment_json) {
          try {
            const parsed = JSON.parse(shipmentRow.shipment_json) as Record<string, unknown>;
            if (typeof parsed.origin === "string" && parsed.origin) origin = parsed.origin;
            if (typeof parsed.destination === "string" && parsed.destination) destination = parsed.destination;
          } catch {
            // malformed JSON — use defaults
          }
        }

        const { freight, ais } = await registerShipmentForTracking({ shipmentId, origin, destination });

        if (freight.ok) {
          const aisBase = process.env.AIS_BASE_URL ?? "http://localhost:8081";
          ensureMonitoredShipment({
            simulationId: shipmentId,
            shipmentId,
            sourceUrl: `${aisBase}/mock/ais/simulations/${shipmentId}`,
            displayName: shipmentId,
          }, db);

          // Stamp the tracking_number added by migration 017
          try {
            db.prepare(`
              UPDATE persistent_agent_monitored_shipments
              SET tracking_number = ?, last_check_status = 'monitoring',
                  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
              WHERE simulation_id = ?
            `).run(freight.trackingNumber, shipmentId);
          } catch {
            // Column may not exist in older DBs that haven't applied 017 yet
          }

          trackingOutcome = { id: freight.trackingNumber, status: "active", registeredAt: timestamp };
          console.log(
            `[endorse] FF picked_up → tracker ${freight.trackingNumber}, AIS ${ais.ok ? "started" : "skipped ("+ais.error+")"}`
          );
        } else {
          logTrackerFailure({ shipmentId, role, action, error: freight.error });
          trackingOutcome = { status: "registration_failed", willRetry: true };
          console.warn(`[endorse] Tracker registration failed for ${shipmentId}: ${freight.error}`);
        }
      } catch (err) {
        // Endorsement already succeeded on-chain — don't surface this error
        logTrackerFailure({ shipmentId, role, action, error: String(err) });
        trackingOutcome = { status: "registration_failed", willRetry: true };
        console.error("[endorse] Tracker registration threw:", err);
      }
    }

    void writeProgressMemory(shipmentId, {
      kind: "endorsement_recorded",
      passport_id: row.passport_id,
      role,
      action,
      signer: signerAddress,
      tx_digest: txDigest,
      timestamp,
      ...(trackingOutcome && "id" in trackingOutcome
        ? { tracking_number: trackingOutcome.id, ais_monitoring: true }
        : {}),
    });

    return NextResponse.json({
      txDigest,
      endorsement: { role, signer: signerAddress, action, signedAtMs },
      ...(trackingOutcome ? { tracking: trackingOutcome } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
