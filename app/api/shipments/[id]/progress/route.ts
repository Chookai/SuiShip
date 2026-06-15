import { NextRequest, NextResponse } from "next/server";
import { listProgressManifests, recordProgressManifest, type ProgressManifestInput } from "@/lib/progress-manifests";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return NextResponse.json(listProgressManifests(id));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as ProgressManifestInput;
    if (!body.stage || !body.actor || !body.summary) {
      return NextResponse.json({ error: "stage, actor, and summary are required" }, { status: 400 });
    }
    const record = await recordProgressManifest(id, body);
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
