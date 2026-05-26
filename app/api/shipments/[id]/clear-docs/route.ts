import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const { fileNames } = (await request.json()) as { fileNames: string[] };
    if (!fileNames || fileNames.length === 0) {
      return NextResponse.json({ error: "No file names provided" }, { status: 400 });
    }

    const db = getDb();
    const placeholders = fileNames.map(() => "?").join(", ");
    const deleted = db.prepare(
      `DELETE FROM shipment_files WHERE shipment_id = ? AND file_name IN (${placeholders})`
    ).run(shipmentId, ...fileNames);

    return NextResponse.json({ ok: true, deleted: deleted.changes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
