import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listAgentRuns, listAgentSteps } from "@/lib/agent-runs";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const runs = listAgentRuns(id, db).map((run) => ({
      ...run,
      steps: listAgentSteps(id, run.id, db),
    }));
    return NextResponse.json({ shipmentId: id, runs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
