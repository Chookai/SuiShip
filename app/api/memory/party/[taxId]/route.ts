import { NextRequest, NextResponse } from "next/server";
import { isMemWalConfigured } from "@/lib/memwal";
import { normalizeNamespaceKey, partyNamespace, readPartyMemory } from "@/lib/agents/memory-agent";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taxId: string }> }
) {
  try {
    const { taxId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const company = searchParams.get("company") ?? taxId;
    const query = searchParams.get("query") ?? "party profile shipping history provenance";
    const namespaceKey = normalizeNamespaceKey(taxId, company);
    const memories = await readPartyMemory(namespaceKey, query, 10);

    return NextResponse.json({
      memwalConfigured: isMemWalConfigured(),
      namespace: partyNamespace(namespaceKey),
      namespaceKey,
      memories,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
