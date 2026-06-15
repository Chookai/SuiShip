import { NextRequest, NextResponse } from "next/server";
import { isMemWalConfigured } from "@/lib/memwal";
import { documentNamespace, readDocumentFingerprints } from "@/lib/agents/memory-agent";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const invoice = searchParams.get("invoice") ?? undefined;
    const bol = searchParams.get("bol") ?? undefined;
    const coo = searchParams.get("coo") ?? undefined;
    const memories = await readDocumentFingerprints(invoice, bol, coo, 10);

    return NextResponse.json({
      memwalConfigured: isMemWalConfigured(),
      namespace: documentNamespace(),
      query: { invoice, bol, coo },
      memories,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
