import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listPersistentAgentShipments } from "@/lib/persistent-agent";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ shipments: listPersistentAgentShipments(getDb()) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
