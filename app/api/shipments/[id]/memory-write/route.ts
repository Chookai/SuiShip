import { NextRequest, NextResponse } from "next/server";
import { writeProgressMemory } from "@/lib/memwal";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = await request.json();
    await writeProgressMemory(shipmentId, body);

    // For trackable events, also insert a row into validation_runs so the
    // activity log can display them without depending on MemWal recall latency.
    if (body.kind === "documents_cleared") {
      const db = getDb();
      const clearedNames = (body.cleared_documents as string[]) ?? [];
      db.prepare(`
        INSERT INTO validation_runs
          (id, shipment_id, issues_json, overall_verdict, verdict_reason,
           input_manifest_json, token_count_in, token_count_out, model)
        VALUES (?, ?, '[]', 'documents_cleared', ?, ?, 0, 0, 'system')
      `).run(
        randomUUID(),
        shipmentId,
        `${body.actor ?? "User"} cleared ${clearedNames.length} document(s): ${clearedNames.join(", ")}`,
        JSON.stringify({ actor: body.actor, cleared: clearedNames }),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
