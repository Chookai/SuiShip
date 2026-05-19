import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildCompactManifest } from "@/lib/compact-manifest";
import { retrieveRelevantChunks } from "@/lib/chunk-retriever";
import { llmCrossValidateCompact } from "@/src/agent/llm-cross-validator";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

type ExtractionRunRow = { aggregate_json: string; created_at: string };
type ValidationRunRow = { is_superseded: number };

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    // Get the latest extraction run for compact manifest
    const compactManifest = buildCompactManifest(shipmentId, db);
    if (!compactManifest) {
      return NextResponse.json(
        { error: "No extraction runs found for this shipment. Upload documents first." },
        { status: 400 }
      );
    }

    // Get retrieved chunks for context
    const retrievedChunks = retrieveRelevantChunks(
      shipmentId,
      "invoice consignee shipper hs_code country_of_origin weight",
      db,
      6
    );

    // Get any new extractions from the latest run (to include full detail for new docs)
    const latestRun = db
      .prepare(
        `SELECT aggregate_json, created_at FROM extraction_runs
         WHERE shipment_id = ? AND is_superseded = 0
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(shipmentId) as ExtractionRunRow | undefined;

    const newExtractionsJson = latestRun
      ? JSON.stringify(JSON.parse(latestRun.aggregate_json).detected, null, 2).slice(0, 6000)
      : "";

    if (process.env.MOCK_DOC_AI === "true") {
      // Return a mock passing validation in mock mode
      const mockResult = {
        issues: [],
        overallVerdict: "aligned" as const,
        verdictReason: "Mock validation: all documents aligned",
        inputTokens: 0,
        outputTokens: 0,
      };
      saveValidationRun(db, shipmentId, mockResult, compactManifest);
      return NextResponse.json({
        issues: [],
        overallVerdict: "aligned",
        verdictReason: mockResult.verdictReason,
        tokenEfficiency: { compactManifestTokens: 0, newExtractionTokens: 0, retrievedChunkTokens: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const result = await llmCrossValidateCompact(
      compactManifest,
      newExtractionsJson,
      retrievedChunks,
      client
    );

    saveValidationRun(db, shipmentId, result, compactManifest);

    return NextResponse.json({
      issues: result.issues,
      overallVerdict: result.overallVerdict,
      verdictReason: result.verdictReason,
      tokenEfficiency: {
        compactManifestTokens: Math.round(compactManifest.length / 4),
        newExtractionTokens: Math.round(newExtractionsJson.length / 4),
        retrievedChunkTokens: Math.round(retrievedChunks.length / 4),
        totalInputTokens: result.inputTokens,
        totalOutputTokens: result.outputTokens,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function saveValidationRun(
  db: ReturnType<typeof getDb>,
  shipmentId: string,
  result: { issues: unknown[]; overallVerdict: string; verdictReason: string; inputTokens: number; outputTokens: number },
  compactManifest: string
): void {
  // Mark previous validation runs as superseded
  db.prepare(
    "UPDATE validation_runs SET is_superseded = 1 WHERE shipment_id = ?"
  ).run(shipmentId);

  db.prepare(`
    INSERT INTO validation_runs
      (id, shipment_id, issues_json, overall_verdict, verdict_reason,
       input_manifest_json, token_count_in, token_count_out)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    shipmentId,
    JSON.stringify(result.issues),
    result.overallVerdict,
    result.verdictReason,
    compactManifest,
    result.inputTokens,
    result.outputTokens
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    const run = db
      .prepare(
        `SELECT * FROM validation_runs
         WHERE shipment_id = ? AND is_superseded = 0
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(shipmentId) as ValidationRunRow | undefined;

    if (!run) {
      return NextResponse.json({ error: "No validation run found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
