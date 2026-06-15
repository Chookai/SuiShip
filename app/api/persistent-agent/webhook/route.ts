import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestPersistentAgentWebhook, listPersistentAgentShipments } from "@/lib/persistent-agent";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const result = await ingestPersistentAgentWebhook(payload, getDb());
    return NextResponse.json({
      ...result,
      shipments: listPersistentAgentShipments(getDb()),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
