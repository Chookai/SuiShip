import { NextRequest, NextResponse } from "next/server";
import { listArtifacts } from "@/lib/artifacts";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return NextResponse.json({ shipmentId: id, artifacts: listArtifacts(id, getDb()) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
