import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildTxDigestMap } from "@/lib/endorsement-flow";
import { getSuiPassportClient } from "@/lib/sui-passport";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const skipChain = request.nextUrl.searchParams.get("source") === "db";
    const db = getDb();

    const row = db.prepare(
      `SELECT passport_id, endorsement_log_object_id, seal_object_id,
              encrypted_walrus_blob_id, tx_digest, minted_at
       FROM shipments WHERE id = ?`
    ).get(shipmentId) as {
      passport_id: string | null;
      endorsement_log_object_id: string | null;
      seal_object_id: string | null;
      encrypted_walrus_blob_id: string | null;
      tx_digest: string | null;
      minted_at: string | null;
    } | undefined;

    if (!row?.passport_id) {
      return NextResponse.json({ error: "Shipment has not been minted yet" }, { status: 404 });
    }

    // Read SQLite-mirrored endorsements (fast path)
    const endorsements = db.prepare(
      `SELECT role, signer_address, action, note_hash, signed_at_ms, tx_digest, created_at
       FROM passport_endorsements WHERE shipment_id = ? ORDER BY signed_at_ms ASC`
    ).all(shipmentId) as Array<{
      role: string;
      signer_address: string;
      action: string;
      note_hash: string | null;
      signed_at_ms: number;
      tx_digest: string;
      created_at: string;
    }>;
    const txDigestByKey = buildTxDigestMap(endorsements);

    // Optionally enrich from on-chain if endorsement log ID is known.
    // Skipped when ?source=db is set (e.g. immediately after an endorsement,
    // before the chain has finalized — SQLite mirror is always up-to-date).
    let onChainEndorsements: typeof endorsements | null = null;
    let importerAddress: string | null = null;
    let exporterAddress: string | null = null;
    let ownerAddress: string | null = null;
    try {
      const client = getSuiPassportClient();
      const passport = await client.getPassport(row.passport_id);
      ownerAddress = passport.owner;
      importerAddress = passport.importer ?? null;
      exporterAddress = passport.exporter ?? null;
    } catch {
      // Optional enrichment only
    }
    if (!skipChain && row.endorsement_log_object_id) {
      try {
        const client = getSuiPassportClient();
        const log = await client.getEndorsementLog(row.endorsement_log_object_id);
        importerAddress = log.importer;
        exporterAddress = log.exporter;
        onChainEndorsements = log.endorsements.map((e) => ({
          role: e.role,
          signer_address: e.signer,
          action: e.action,
          note_hash: e.noteHash || null,
          signed_at_ms: e.signedAtMs,
          tx_digest: txDigestByKey.get(`${e.role}:${e.signer.toLowerCase()}:${e.action}`) ?? "",
          created_at: new Date(e.signedAtMs).toISOString(),
        }));
      } catch {
        // Fall back to SQLite mirror if on-chain read fails
      }
    }

    return NextResponse.json({
      passportId: row.passport_id,
      txDigest: row.tx_digest,
      mintedAt: row.minted_at,
      endorsementLogId: row.endorsement_log_object_id,
      sealObjectId: row.seal_object_id,
      encryptedWalrusBlobId: row.encrypted_walrus_blob_id,
      ownerAddress,
      importerAddress,
      exporterAddress,
      endorsements: onChainEndorsements ?? endorsements,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
