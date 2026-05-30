import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { insertChatMessage } from "@/lib/chat-tools/history";
import { recallLatestCompanyProfile } from "@/lib/profile-memwal";
import Anthropic from "@anthropic-ai/sdk";

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const shipment = db
      .prepare(
        `SELECT exporter_json, importer_json, cargo_json, shipment_json,
                status, extraction_status, ai_json
         FROM shipments WHERE id = ?`,
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
         ORDER BY created_at DESC LIMIT 1`,
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

    if (process.env.MOCK_DOC_AI === "true") {
      const mockReply = `[Mock] Based on the shipment data for ${exporter.company} → ${importer.company}, here's a mock answer to: "${message}"`;
      insertChatMessage({ shipmentId, role: "user", content: message });
      insertChatMessage({ shipmentId, role: "assistant", content: mockReply });
      return NextResponse.json({ reply: mockReply });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const chatHistory: Anthropic.MessageParam[] = (body.history ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    chatHistory.push({ role: "user", content: message });

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: `You are SuiShip's intelligent assistant embedded on a shipment detail page.
You have access to the full shipment data, AI validation results, field-level comparisons (entered vs document-extracted vs MemWal-remembered values), and company profiles stored in MemWal.

Your job:
- Answer questions about this specific shipment clearly and concisely.
- Highlight any discrepancies, risks, or anomalies found during validation.
- If the user asks about changes (e.g. "did they change their bank?"), compare the MemWal remembered values with the current entered/extracted values.
- If a field has severity "critical" or "warning" in the comparisons, mention it.
- Be helpful, specific, and cite the actual data values when relevant.
- Keep answers concise (2-4 sentences unless the user asks for detail).

SHIPMENT CONTEXT:
${context}`,
      messages: chatHistory,
    });

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    insertChatMessage({ shipmentId, role: "user", content: message });
    insertChatMessage({ shipmentId, role: "assistant", content: reply });

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[chat] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
