// Modeled on app/api/shipments/[id]/chat/route.ts (context assembly)
// and lib/agents/validation-agent.ts (agent loop invocation).
// Feature-flagged: requires CHAT_AGENT_MODE=true env var.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/db";
import { runAgentLoop } from "@/lib/agents/agent-loop";
import { recordAgentStep } from "@/lib/agent-runs";
import { recallLatestCompanyProfile } from "@/lib/profile-memwal";
import { CHAT_AGENT_TOOLS, buildChatToolExecutors } from "@/lib/chat-tools/tools";
import {
  createChatAgentRun,
  insertChatMessage,
  loadChatHistory,
} from "@/lib/chat-tools/history";
import type { ToolEvent } from "@/lib/agents/agent-loop";

export const runtime = "nodejs";

type ValidationRunRow = {
  overall_verdict: string;
  verdict_reason: string | null;
  field_comparisons_json: string | null;
  baseline_status: string | null;
};

type ShipmentRow = {
  exporter_json: string;
  importer_json: string;
  cargo_json: string;
  shipment_json: string;
  status: string;
  extraction_status: string | null;
  ai_json: string | null;
};

const CHAT_SYSTEM_PROMPT_BASE = `You are SuiShip's intelligent assistant embedded on a shipment detail page.
You have access to the full shipment data and a set of tools to retrieve live information.

CAPABILITIES:
- get_shipment_status: current status, passport, endorsement chain, validation verdict
- compare_documents: field-level comparisons between entered data, extracted data, and MemWal memory
- query_memwal: search long-term memory for historical party/document/risk records
- search_similar_shipments: find other shipments by the same parties or route
- run_risk_scan: run or retrieve a risk scan (MemWal + live news)
- generate_case_summary: retrieve the latest case file with Walrus blob links
- propose_endorsement: draft the next endorsement step — NEVER auto-signs on-chain

RULES:
- Only call a tool when it would provide better information than what is already in the context below.
- For simple questions about the current shipment data (exporter, importer, cargo), answer directly without tools.
- propose_endorsement NEVER submits to the blockchain. It creates a draft that the user must confirm.
- Stop after at most 6 tool calls per user message.
- Be concise: 2-4 sentences unless the user asks for detail.
- If a tool returns an error, explain it clearly and suggest next steps.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.CHAT_AGENT_MODE !== "true") {
    return NextResponse.json({ error: "Agent mode not enabled" }, { status: 404 });
  }

  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const db = getDb();

    // ── Assemble shipment context (mirrors chat/route.ts lines 40-103) ────────
    const shipment = db
      .prepare(
        `SELECT exporter_json, importer_json, cargo_json, shipment_json,
                status, extraction_status, ai_json
         FROM shipments WHERE id = ?`
      )
      .get(shipmentId) as ShipmentRow | undefined;

    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }

    const exporter = JSON.parse(shipment.exporter_json);
    const importer = JSON.parse(shipment.importer_json);
    const cargo = JSON.parse(shipment.cargo_json);
    const shipmentDetails = JSON.parse(shipment.shipment_json);
    const ai = shipment.ai_json ? JSON.parse(shipment.ai_json) : null;

    const validation = db
      .prepare(
        `SELECT overall_verdict, verdict_reason, field_comparisons_json, baseline_status
         FROM validation_runs
         WHERE shipment_id = ? AND is_superseded = 0
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(shipmentId) as ValidationRunRow | undefined;

    const fieldComparisons = validation?.field_comparisons_json
      ? JSON.parse(validation.field_comparisons_json)
      : [];

    let memwalContext = "";
    try {
      const [exporterProfile, importerProfile] = await Promise.all([
        recallLatestCompanyProfile({ company: exporter.company, taxId: exporter.taxId ?? "" }),
        recallLatestCompanyProfile({ company: importer.company, taxId: importer.taxId ?? "" }),
      ]);
      const profiles: string[] = [];
      if (exporterProfile) profiles.push(`Exporter MemWal profile:\n${JSON.stringify(exporterProfile, null, 2)}`);
      if (importerProfile) profiles.push(`Importer MemWal profile:\n${JSON.stringify(importerProfile, null, 2)}`);
      if (profiles.length > 0) memwalContext = "\n\n" + profiles.join("\n\n");
    } catch {
      // MemWal not configured or unavailable
    }

    const context = `
SHIPMENT DATA:
- Status: ${shipment.status}
- Extraction: ${shipment.extraction_status ?? "pending"}

EXPORTER: ${JSON.stringify(exporter, null, 2)}
IMPORTER: ${JSON.stringify(importer, null, 2)}
CARGO: ${JSON.stringify(cargo, null, 2)}
SHIPMENT DETAILS: ${JSON.stringify(shipmentDetails, null, 2)}

${ai ? `AI VERIFICATION RESULT:\n- Risk Level: ${ai.riskLevel}\n- Summary: ${ai.summary ?? "N/A"}` : "AI verification not yet run."}

${validation ? `VALIDATION:\n- Verdict: ${validation.overall_verdict}\n- Reason: ${validation.verdict_reason ?? "N/A"}\n- Baseline: ${validation.baseline_status ?? "N/A"}` : "Validation not yet run."}

${fieldComparisons.length > 0 ? `FIELD COMPARISONS (entered vs extracted vs MemWal remembered):\n${JSON.stringify(fieldComparisons, null, 2)}` : ""}
${memwalContext}
    `.trim();

    const systemPrompt = `${CHAT_SYSTEM_PROMPT_BASE}\n\nSHIPMENT CONTEXT:\n${context}`;

    // ── Persist user message ──────────────────────────────────────────────────
    const agentRunId = createChatAgentRun(shipmentId, db);
    insertChatMessage({ shipmentId, role: "user", content: message, agentRunId }, db);

    // ── Build message history for the agent loop ──────────────────────────────
    // Load from DB (last 20), excluding internal tool_call/tool_result rows,
    // then append the new user message.
    const storedHistory = loadChatHistory(shipmentId, 40, db);
    const apiMessages: Anthropic.MessageParam[] = storedHistory
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-18) // keep last 18 turns before new message
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // The user message was just inserted, so the last entry is the current one.
    // Ensure we don't duplicate if history already included it.
    const lastStored = apiMessages[apiMessages.length - 1];
    if (!lastStored || lastStored.role !== "user" || lastStored.content !== message) {
      apiMessages.push({ role: "user", content: message });
    }

    // ── Run the agent loop ────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const toolExecutors = buildChatToolExecutors(shipmentId, db);

    type AgentResult = { reply: string; toolEvents: ToolEvent[] };

    const result = await runAgentLoop<AgentResult>({
      client,
      model: "claude-haiku-4-5",
      system: systemPrompt,
      messages: apiMessages,
      tools: CHAT_AGENT_TOOLS,
      toolExecutors,
      maxToolCalls: 6,
      timeoutMs: 20_000,
      extractFinal: (messages, toolEvents) => {
        const lastMsg = messages[messages.length - 1];
        let reply = "";
        if (lastMsg?.role === "assistant") {
          const content = lastMsg.content;
          if (typeof content === "string") {
            reply = content;
          } else if (Array.isArray(content)) {
            reply = content
              .filter((b): b is Anthropic.TextBlock => b.type === "text")
              .map((b) => b.text)
              .join("");
          }
        }
        return { reply: reply || "I processed your request.", toolEvents };
      },
    });

    // ── Persist tool events and assistant reply ───────────────────────────────
    for (const event of result.toolEvents) {
      insertChatMessage({
        shipmentId,
        role: "tool_call",
        content: "",
        toolName: event.name,
        toolInputJson: JSON.stringify(event.input),
        agentRunId,
      }, db);
      const isError = typeof event.result === "object" &&
        event.result !== null &&
        "error" in (event.result as Record<string, unknown>);
      insertChatMessage({
        shipmentId,
        role: "tool_result",
        content: "",
        toolName: event.name,
        toolResultJson: JSON.stringify(event.result),
        isError,
        agentRunId,
      }, db);

      // Log to agent_steps for audit trail
      recordAgentStep({
        runId: agentRunId,
        shipmentId,
        agentName: "Orchestrator",
        stepName: `tool:${event.name}`,
        status: isError ? "failed" : "completed",
        message: isError
          ? `Tool error: ${(event.result as { error?: string }).error ?? "unknown"}`
          : `Tool ${event.name} succeeded`,
        inputArtifacts: [event.input],
        outputArtifacts: [event.result],
      }, db);
    }

    insertChatMessage({ shipmentId, role: "assistant", content: result.reply, agentRunId }, db);

    return NextResponse.json({
      reply: result.reply,
      toolEvents: result.toolEvents.map((e) => ({
        name: e.name,
        input: e.input,
        result: e.result,
      })),
      agentRunId,
    });
  } catch (err) {
    console.error("[chat/agent] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
