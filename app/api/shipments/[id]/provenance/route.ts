import { NextRequest, NextResponse } from "next/server";
import { answerProvenanceQuestion } from "@/lib/agents/provenance-agent";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as { question?: string; requesterAddress?: string };

    const { question, requesterAddress } = body;
    if (!question || !requesterAddress) {
      return NextResponse.json(
        { error: "question and requesterAddress are required" },
        { status: 400 }
      );
    }

    const result = await answerProvenanceQuestion(shipmentId, question, requesterAddress);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
