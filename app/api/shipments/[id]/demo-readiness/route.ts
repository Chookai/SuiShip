import { NextRequest, NextResponse } from "next/server";
import { getLatestAgentRun } from "@/lib/agent-runs";
import { getLatestCaseFile } from "@/lib/case-files";
import { getDb } from "@/lib/db";
import { isMemWalConfigured, memwalHealth } from "@/lib/memwal";
import { getShipmentById } from "@/lib/shipments-server";
import { SEAL_ENABLED } from "@/lib/seal-client";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const shipment = getShipmentById(id);
    const caseFile = getLatestCaseFile(id, db);
    const latestRun = getLatestAgentRun(id, db);
    const memwalConfigured = isMemWalConfigured();
    const memwalConnected = memwalConfigured ? await memwalHealth() : false;
    const walrusCaseFileStored = caseFile?.row.status === "stored_on_walrus";

    return NextResponse.json({
      shipmentId: id,
      memwal: {
        mode: memwalConfigured ? "live" : "degraded",
        connected: memwalConnected,
        baselineMemorySynced: shipment?.memWalSyncStatus === "synced",
        syncStatus: shipment?.memWalSyncStatus ?? null,
      },
      walrus: {
        mode: walrusCaseFileStored || shipment?.walrusManifestBlobId ? "live" : "pending",
        caseFileStored: walrusCaseFileStored,
        caseFileBlobId: caseFile?.row.walrus_json_blob_id ?? null,
        manifestBlobId: shipment?.walrusManifestBlobId ?? null,
      },
      sui: {
        mode: process.env.SUI_CLIENT === "real" ? "real" : "mock",
        passportId: shipment?.passportId ?? null,
        txDigest: shipment?.txDigest ?? null,
      },
      seal: {
        enabled: SEAL_ENABLED,
      },
      latestAgentRun: latestRun,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
