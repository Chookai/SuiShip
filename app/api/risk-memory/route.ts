import { NextRequest, NextResponse } from "next/server";
import {
  RISK_EVENTS_NAMESPACE,
  RISK_OBSERVATIONS_NAMESPACE,
} from "@/lib/agents/risk-types";
import { isMemWalConfigured, memwalRecall } from "@/lib/memwal/client";

export const runtime = "nodejs";

const DEFAULT_RISK_MEMORY_QUERY = [
  "SUISHIP risk memory",
  "logistics delay disruption route carrier ETA customs port",
  "weather typhoon piracy canal geopolitical strike congestion schedule rollback",
].join(" ");

type RiskMemoryRecord = {
  namespace: string;
  blobId: string;
  text: string;
  distance: number;
};

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("query")?.trim() || DEFAULT_RISK_MEMORY_QUERY;
    const limit = Math.max(1, Math.min(50, Number(request.nextUrl.searchParams.get("limit") ?? 25)));
    const namespaces = [RISK_EVENTS_NAMESPACE, RISK_OBSERVATIONS_NAMESPACE];

    if (!isMemWalConfigured()) {
      return NextResponse.json({
        memwalConfigured: false,
        query,
        namespaces,
        memories: [] satisfies RiskMemoryRecord[],
      });
    }

    const batches = await Promise.all(
      namespaces.map(async (namespace) => {
        const memories = await memwalRecall(query, namespace, limit);
        return memories.map((memory) => ({
          namespace,
          blobId: memory.blobId,
          text: memory.text,
          distance: memory.distance,
        }));
      })
    );

    const seen = new Set<string>();
    const memories = batches.flat().filter((memory) => {
      const key = `${memory.namespace}:${memory.blobId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      memwalConfigured: true,
      query,
      namespaces,
      memories,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
