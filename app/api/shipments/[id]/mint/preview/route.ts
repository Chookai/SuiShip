import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { estimateStorageCost, WALRUS_MINT_EPOCHS } from "@/lib/walrus";

export const runtime = "nodejs";

type ShipmentFileRow = { size_bytes: number };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    const files = db
      .prepare("SELECT size_bytes FROM shipment_files WHERE shipment_id = ?")
      .all(shipmentId) as ShipmentFileRow[];

    const totalBytes = files.reduce((sum, f) => sum + f.size_bytes, 0);
    const manifestEstimateBytes = 50_000;
    const totalWithMeta = totalBytes + manifestEstimateBytes;

    const walrusEstimate = await estimateStorageCost(totalWithMeta, WALRUS_MINT_EPOCHS);

    return NextResponse.json({
      fileCount: files.length,
      totalBytes,
      epochs: WALRUS_MINT_EPOCHS,
      walrus: walrusEstimate,
      sui: {
        estimatedGasSui: 0.1,
        note: "Testnet SUI gas is free via faucet. Mainnet estimate: ~0.05–0.15 SUI.",
      },
      total: {
        estimatedWal: walrusEstimate.estimatedWal,
        estimatedUsd: walrusEstimate.estimatedUsd + 0.1 * 0.025,
        note: "Estimates only. Actual costs depend on network conditions.",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
