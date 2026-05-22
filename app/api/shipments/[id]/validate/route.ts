import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runShipmentValidation } from "@/lib/validate-shipment";

export const runtime = "nodejs";

type ValidationRunRow = {
  id: string;
  overall_verdict: string;
  verdict_reason: string | null;
  issues_json: string;
  doc_set_hash: string | null;
  model: string | null;
  token_count_in: number | null;
  token_count_out: number | null;
  is_superseded: number;
  created_at: string;
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const db = getDb();

    const result = await runShipmentValidation(shipmentId, db);
    if (!result) {
      return NextResponse.json(
        { error: "No extraction runs found for this shipment. Upload documents first." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      issues: result.issues,
      findings: result.findings,
      overallVerdict: result.overallVerdict,
      verdictReason: result.verdictReason,
      docSetHash: result.docSetHash,
      model: result.model,
      tokenEfficiency: {
        totalInputTokens: result.inputTokens,
        totalOutputTokens: result.outputTokens,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
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

    const findings = db.prepare(
      `SELECT id, severity, field_path, message, affected_doc_ids_json, values_json, status
       FROM validation_findings WHERE validation_run_id = ? ORDER BY severity DESC`
    ).all(run.id) as {
      id: string;
      severity: string;
      field_path: string;
      message: string;
      affected_doc_ids_json: string;
      values_json: string;
      status: string;
    }[];

    return NextResponse.json({
      overallVerdict: run.overall_verdict,
      verdictReason: run.verdict_reason,
      docSetHash: run.doc_set_hash,
      model: run.model,
      issues: JSON.parse(run.issues_json),
      findings: findings.map(f => ({
        id: f.id,
        severity: f.severity,
        fieldPath: f.field_path,
        message: f.message,
        affectedDocIds: JSON.parse(f.affected_doc_ids_json),
        values: JSON.parse(f.values_json),
        status: f.status,
      })),
      tokenEfficiency: {
        totalInputTokens: run.token_count_in ?? 0,
        totalOutputTokens: run.token_count_out ?? 0,
      },
      ranAt: run.created_at,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
