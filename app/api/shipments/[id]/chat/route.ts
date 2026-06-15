import { NextRequest, NextResponse } from "next/server";
import pino from "pino";
import { getDb } from "@/lib/db";

const logger = pino({ name: "chat" });
import { insertChatMessage } from "@/lib/chat-tools/history";
import { recallLatestCompanyProfile } from "@/lib/profile-memwal";
import { normalizeRole, getChatAccessLevel } from "@/lib/auth/chat-policy";
import type { DemoEndorsementRecord } from "@/lib/endorsement-flow";
import { redactParty, redactShipmentInfo, redactFieldComparisons } from "@/lib/auth/redact";
import { normalizeNamespaceKey } from "@/lib/agents/memory-agent";
import { getAisPosition } from "@/lib/tracker-api/client";
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
      role?: string;
    };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const rawActorRole = body.role ?? null;
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

    const chatRole = normalizeRole(rawActorRole);
    let accessState = undefined as import("@/lib/auth/chat-policy").AccessState | undefined;

    // ── Role-based access gating ──────────────────────────────────────────────
    if (process.env.CHAT_ROLE_GATING === "true") {
      const endorsements = db.prepare(
        "SELECT role, action FROM passport_endorsements WHERE shipment_id = ? ORDER BY signed_at_ms ASC"
      ).all(shipmentId) as DemoEndorsementRecord[];

      const actorCompany =
        chatRole === "exporter" ? (exporter.company as string | undefined)
        : chatRole === "importer" ? (importer.company as string | undefined)
        : undefined;
      const actorTaxId =
        chatRole === "exporter" ? (exporter.taxId as string | undefined)
        : chatRole === "importer" ? (importer.taxId as string | undefined)
        : undefined;
      const actorNamespaceKey = actorCompany
        ? normalizeNamespaceKey(actorTaxId, actorCompany)
        : undefined;

      const access = getChatAccessLevel(chatRole, endorsements, { company: actorCompany, namespaceKey: actorNamespaceKey });
      if (access.level === "locked") {
        insertChatMessage({
          shipmentId,
          role: "user",
          content: message,
          actorRole: rawActorRole,
        });
        return NextResponse.json({
          locked: true,
          reason: access.lockInfo!.reason,
          unlocksWhen: access.lockInfo!.unlocksWhen,
        });
      }
      accessState = access.accessState;
    }

    const validation = db
      .prepare(
        `SELECT overall_verdict, verdict_reason, field_comparisons_json, baseline_status
         FROM validation_runs
         WHERE shipment_id = ? AND is_superseded = 0
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(shipmentId) as ValidationRunRow | undefined;

    const rawFieldComparisons = validation?.field_comparisons_json
      ? JSON.parse(validation.field_comparisons_json)
      : [];

    // ── Apply field-level redaction ───────────────────────────────────────────
    const isRedactionEnabled =
      process.env.CHAT_ROLE_GATING === "true" &&
      process.env.CHAT_REDACTION_MODE !== "permissive" &&
      process.env.CHAT_REDACTION_MODE !== "off" &&
      !!chatRole &&
      !!accessState;

    const contextExporter = isRedactionEnabled
      ? redactParty({ ...exporter }, "exporter", chatRole!)
      : exporter;
    const contextImporter = isRedactionEnabled
      ? redactParty({ ...importer }, "importer", chatRole!)
      : importer;
    const contextShipmentDetails = isRedactionEnabled
      ? redactShipmentInfo({ ...shipmentDetails }, chatRole!)
      : shipmentDetails;
    const fieldComparisons = isRedactionEnabled
      ? redactFieldComparisons(rawFieldComparisons, chatRole!)
      : rawFieldComparisons;

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

    const allEndorsements = db.prepare(
      "SELECT role, action, signed_at_ms FROM passport_endorsements WHERE shipment_id = ? ORDER BY signed_at_ms ASC"
    ).all(shipmentId) as Array<{ role: string; action: string; signed_at_ms: number }>;

    const endorsementContext = allEndorsements.length > 0
      ? `CUSTODY CHAIN (completed endorsements):\n${allEndorsements.map((e, i) =>
          `  ${i + 1}. ${e.role} → ${e.action} (at ${new Date(e.signed_at_ms).toISOString()})`
        ).join("\n")}`
      : "CUSTODY CHAIN: No endorsements signed yet.";

    const aisPosition = await getAisPosition(shipmentId);
    const aisContext = aisPosition.ok
      ? `LIVE VESSEL POSITION (AIS):
- Vessel: ${aisPosition.vesselName}
- Origin → Destination: ${aisPosition.origin} → ${aisPosition.destination}
- Current Position: lat ${aisPosition.lat.toFixed(4)}, lng ${aisPosition.lng.toFixed(4)}
- Heading: ${aisPosition.headingDeg}°
- Progress: ${aisPosition.progressPercent}%
- Status: ${aisPosition.status}
- As of: ${aisPosition.timestamp}`
      : "LIVE VESSEL POSITION: No active AIS simulation running for this shipment.";

    const context = `
SHIPMENT DATA:
- Status: ${shipment.status}
- Extraction: ${shipment.extraction_status ?? "pending"}

EXPORTER: ${JSON.stringify(contextExporter, null, 2)}
IMPORTER: ${JSON.stringify(contextImporter, null, 2)}
CARGO: ${JSON.stringify(cargo, null, 2)}
SHIPMENT DETAILS: ${JSON.stringify(contextShipmentDetails, null, 2)}

${ai ? `AI VERIFICATION RESULT:\n- Risk Level: ${ai.riskLevel}\n- Summary: ${ai.summary ?? "N/A"}` : "AI verification not yet run."}

${validation ? `VALIDATION:\n- Verdict: ${validation.overall_verdict}\n- Reason: ${validation.verdict_reason ?? "N/A"}\n- Baseline: ${validation.baseline_status ?? "N/A"}` : "Validation not yet run."}

${fieldComparisons.length > 0 ? `FIELD COMPARISONS (entered vs extracted vs MemWal remembered):\n${JSON.stringify(fieldComparisons, null, 2)}` : ""}
${memwalContext}

${endorsementContext}

${aisContext}
`.trim();

    if (process.env.MOCK_DOC_AI === "true") {
      const mockReply = `[Mock] Based on the shipment data for ${exporter.company} → ${importer.company}, here's a mock answer to: "${message}"`;
      insertChatMessage({ shipmentId, role: "user", content: message, actorRole: rawActorRole });
      insertChatMessage({ shipmentId, role: "assistant", content: mockReply, actorRole: rawActorRole });
      return NextResponse.json({ reply: mockReply });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const chatHistory: Anthropic.MessageParam[] = (body.history ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    chatHistory.push({ role: "user", content: message });

    const redactionParagraph = isRedactionEnabled ? `

REDACTION POLICY:
Fields you do not have access to are replaced with a marker object:
  { "redacted": true, "reason": "<reason>", "visibleTo": ["<roles>"] }

Rules — strictly follow all of these:
1. NEVER infer or calculate the value of a redacted field from other visible fields.
2. NEVER refuse to acknowledge that a field exists — acknowledge it and explain the access boundary.
3. When asked about a redacted field, state the role constraint: "The [field] is not visible to the [role] role. [Visible parties] have access to this information."
4. Do NOT repeat the raw marker object to the user; translate it into natural language.` : "";

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
- Keep answers concise (2-4 sentences unless the user asks for detail).${redactionParagraph}

SHIPMENT CONTEXT:
${context}`,
      messages: chatHistory,
    });

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    insertChatMessage({ shipmentId, role: "user", content: message, actorRole: rawActorRole });
    insertChatMessage({ shipmentId, role: "assistant", content: reply, actorRole: rawActorRole });

    return NextResponse.json({ reply });
  } catch (err) {
    logger.error({ err }, "chat handler error");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
