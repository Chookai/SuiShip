import { NextRequest, NextResponse } from "next/server";
import { isMemWalConfigured } from "@/lib/memwal";
import { normalizeNamespaceKey, partyNamespace, readPartyMemory } from "@/lib/agents/memory-agent";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const exporterKey = searchParams.get("exporterKey") ?? "";
    const company = searchParams.get("company") ?? exporterKey;
    const namespaceKey = normalizeNamespaceKey(exporterKey, company);
    const namespace = partyNamespace(namespaceKey);

    if (!isMemWalConfigured()) {
      return NextResponse.json({
        memwalConfigured: false,
        namespace,
        namespaceKey,
        profile: null,
        memories: [],
        degradedReason: "MemWal credentials are not configured.",
      });
    }

    const memories = await readPartyMemory(
      namespaceKey,
      "exporter identity profile shipment history hs code value payment terms bank account anomalies provenance",
      12
    );

    const profile = summarizeMemories(memories.map((memory) => memory.text));
    return NextResponse.json({
      memwalConfigured: true,
      namespace,
      namespaceKey,
      profile,
      memories,
      provenance: memories.map((memory) => ({
        memwalNamespace: memory.namespace,
        memwalBlobId: memory.blobId,
        distance: memory.distance,
        sourceShipmentId: extractOne(memory.text, /shipment_id[=:]\s*([^;\n]+)/i),
        walrusBlobId: extractOne(memory.text, /walrus_evidence[=:]\s*([A-Za-z0-9_,\s-]+)/i),
        suiTxDigest: extractOne(memory.text, /sui_tx[=:]\s*([A-Za-z0-9]+)/i),
        suiObjectId: extractOne(memory.text, /sui_passport[=:]\s*([A-Za-z0-9x]+)/i),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function summarizeMemories(texts: string[]) {
  const values = (pattern: RegExp) => [...new Set(texts.map((text) => extractOne(text, pattern)).filter(Boolean) as string[])];
  const shipments = values(/shipment_id[=:]\s*([^;\n]+)/i);
  return {
    shipmentCount: shipments.length,
    sourceShipments: shipments,
    commonHsCodes: values(/hs_code[=:]\s*([^.;\n]+)/i),
    commonOrigins: values(/country_of_origin[=:]\s*([^.;\n]+)/i),
    paymentOrBankSignals: values(/bank_account_number[=:]\s*([^.;\n]+)/i),
    documentFingerprints: values(/DOCUMENT invoice_number:\s*([^;.\n]+)/i),
  };
}

function extractOne(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[1]?.trim().replace(/^"|"$/g, "") ?? null;
}
