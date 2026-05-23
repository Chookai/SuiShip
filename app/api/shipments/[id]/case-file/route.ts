import { NextRequest, NextResponse } from "next/server";
import { getLatestCaseFile } from "@/lib/case-files";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caseFile = getLatestCaseFile(id, getDb());
    if (!caseFile) {
      return NextResponse.json({ error: "No AI Shipment Case File found" }, { status: 404 });
    }
    return NextResponse.json({
      shipmentId: id,
      caseFile: caseFile.artifact,
      storage: {
        status: caseFile.row.status,
        walrusJsonBlobId: caseFile.row.walrus_json_blob_id,
        walrusMarkdownBlobId: caseFile.row.walrus_markdown_blob_id,
        failureReason: caseFile.row.failure_reason,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
