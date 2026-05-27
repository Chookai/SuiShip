import { NextResponse } from "next/server";
import { seedRiskEventMemories } from "@/lib/agents/risk-agent";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await seedRiskEventMemories();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
