import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  checkAllPersistentAgentShipments,
  checkPersistentAgentShipment,
  listPersistentAgentShipments,
} from "@/lib/persistent-agent";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json().catch(() => ({})) as { simulationId?: string };
    const rows = listPersistentAgentShipments(db);
    const target = body.simulationId
      ? rows.find((row) => row.simulationId === body.simulationId)
      : null;
    const results = target
      ? [{ simulationId: target.simulationId, ...(await checkPersistentAgentShipment(target, db)) }]
      : await checkAllPersistentAgentShipments(db);

    return NextResponse.json({
      results,
      shipments: listPersistentAgentShipments(db),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
