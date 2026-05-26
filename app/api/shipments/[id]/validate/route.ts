import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runShipmentValidation } from "@/lib/validate-shipment";
import { getLatestCaseFile } from "@/lib/case-files";
import { getLatestAgentRun } from "@/lib/agent-runs";

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
  field_comparisons_json: string | null;
  baseline_status: string | null;
  memory_trace_json: string | null;
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
      fieldComparisons: result.fieldComparisons,
      memoryTrace: result.memoryTrace,
      baselineStatus: result.baselineStatus,
      agentToolEvents: result.agentToolEvents,
      agentRunId: result.agentRunId,
      caseFile: result.caseFile,
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
      `SELECT id, severity, field_path, message, affected_doc_ids_json, values_json, status, finding_type
       FROM validation_findings WHERE validation_run_id = ? ORDER BY severity DESC`
    ).all(run.id) as {
      id: string;
      severity: string;
      field_path: string;
      message: string;
      affected_doc_ids_json: string;
      values_json: string;
      status: string;
      finding_type?: string;
    }[];

    const mappedFindings = findings.map(f => ({
      id: f.id,
      severity: f.severity,
      fieldPath: f.field_path,
      message: f.message,
      affectedDocIds: JSON.parse(f.affected_doc_ids_json),
      values: JSON.parse(f.values_json),
      status: f.status,
      findingType: f.finding_type ?? "consistency",
    }));
    const fieldComparisons = run.field_comparisons_json
      ? JSON.parse(run.field_comparisons_json)
      : mappedFindings
          .map((finding) => (finding.values as { field_comparison?: unknown }).field_comparison)
          .filter(Boolean);
    const baselineStatus = run.baseline_status ??
      (fieldComparisons.some(
        (c: Record<string, unknown>) => c.rememberedValue !== null && c.rememberedValue !== undefined
      ) ? "prior_memory_found" : "baseline_established");
    const memoryTrace = run.memory_trace_json ? JSON.parse(run.memory_trace_json) : [];
    const latestCaseFile = getLatestCaseFile(shipmentId, db);
    const latestRun = getLatestAgentRun(shipmentId, db);
    return NextResponse.json({
      overallVerdict: run.overall_verdict,
      verdictReason: run.verdict_reason,
      docSetHash: run.doc_set_hash,
      model: run.model,
      issues: JSON.parse(run.issues_json),
      findings: mappedFindings,
      fieldComparisons,
      baselineStatus,
      memoryTrace,
      agentToolEvents: [],
      agentRunId: latestRun?.id,
      caseFile: latestCaseFile?.artifact ?? null,
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
