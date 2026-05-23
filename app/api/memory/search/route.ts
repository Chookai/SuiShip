import { NextRequest, NextResponse } from "next/server";
import { isMemWalConfigured, memwalRecall } from "@/lib/memwal";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { namespace?: string; query?: string; limit?: number };
    const namespace = body.namespace?.trim();
    const query = body.query?.trim();
    const limit = Math.max(1, Math.min(20, body.limit ?? 10));

    if (!namespace || !query) {
      return NextResponse.json({ error: "namespace and query are required" }, { status: 400 });
    }
    if (!isMemWalConfigured()) {
      return NextResponse.json({ memwalConfigured: false, namespace, query, memories: [] });
    }

    const memories = await memwalRecall(query, namespace, limit);
    return NextResponse.json({ memwalConfigured: true, namespace, query, memories });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
