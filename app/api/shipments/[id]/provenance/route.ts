import { NextRequest, NextResponse } from "next/server";
import { answerProvenanceQuestion } from "@/lib/agents/provenance-agent";
import { parseEd25519Keypair } from "@/lib/sui-keypair";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as {
      question?: string;
      requesterAddress?: string;
      requesterKeyHex?: string;
    };

    const { question, requesterAddress, requesterKeyHex } = body;
    if (!question || !requesterAddress) {
      return NextResponse.json(
        { error: "question and requesterAddress are required" },
        { status: 400 }
      );
    }

    const requesterKeypair = requesterKeyHex ? parseEd25519Keypair(requesterKeyHex) : undefined;
    if (requesterKeypair && requesterKeypair.toSuiAddress() !== requesterAddress) {
      return NextResponse.json(
        { error: "requesterKeyHex does not match requesterAddress" },
        { status: 400 }
      );
    }

    const result = await answerProvenanceQuestion(
      shipmentId,
      question,
      requesterAddress,
      requesterKeypair,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
