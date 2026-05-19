import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSuiPassportClient } from "@/lib/sui-passport";
import { readManifestFromMemWal, memwalRecall, isMemWalConfigured } from "@/lib/memwal/index";
import type { MemWalAccessScope } from "@/lib/memwal/types";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

type ShipmentPassportRow = {
  passport_id: string | null;
  memwal_space_id: string | null;
};

function inferScope(query: string): MemWalAccessScope {
  const q = query.toLowerCase();
  if (q.match(/invoice|payment|amount|value|currency|price|commercial/)) return "commercial_fields";
  if (q.match(/origin|country|hs.?code|certificate|coo/)) return "origin_fields";
  if (q.match(/port|carrier|vessel|loading|discharge|eta|etd|bl|lading|transport/)) return "transport_fields";
  if (q.match(/blob|hash|document|file/)) return "document_hashes_only";
  return "full";
}

function filterManifestByScope(manifestJson: string, scope: MemWalAccessScope): string {
  if (scope === "full") return manifestJson;

  try {
    const manifest = JSON.parse(manifestJson);
    switch (scope) {
      case "commercial_fields":
        return JSON.stringify({
          parties: manifest.parties,
          cargo: { declared_value: manifest.cargo?.declared_value, currency: manifest.cargo?.currency, hs_code: manifest.cargo?.hs_code },
          ai_verification: manifest.ai_verification,
          documents: manifest.documents?.map((d: { doc_type: string; file_name: string }) => ({ doc_type: d.doc_type, file_name: d.file_name })),
        }, null, 2);
      case "origin_fields":
        return JSON.stringify({
          cargo: { hs_code: manifest.cargo?.hs_code, country_of_origin: manifest.cargo?.country_of_origin },
          documents: manifest.documents?.map((d: { doc_type: string }) => ({ doc_type: d.doc_type })),
        }, null, 2);
      case "transport_fields":
        return JSON.stringify({
          shipment: manifest.shipment,
          documents: manifest.documents?.map((d: { doc_type: string; file_name: string }) => ({ doc_type: d.doc_type, file_name: d.file_name })),
        }, null, 2);
      case "document_hashes_only":
        return JSON.stringify({
          documents: manifest.documents?.map((d: { doc_type: string; sha256: string; walrus_blob_id: string }) => ({
            doc_type: d.doc_type, sha256: d.sha256, walrus_blob_id: d.walrus_blob_id,
          })),
        }, null, 2);
    }
  } catch {
    return manifestJson;
  }
  return manifestJson;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as { query?: string; requestorAddress?: string };
    const query = body.query?.trim();
    const requestorAddress = body.requestorAddress ?? "0x_owner";

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const db = getDb();

    const row = db
      .prepare("SELECT passport_id, memwal_space_id FROM shipments WHERE id = ?")
      .get(shipmentId) as ShipmentPassportRow | undefined;

    if (!row?.passport_id) {
      return NextResponse.json(
        { error: "Shipment has not been minted yet. Mint first to enable 'Ask this shipment'." },
        { status: 400 }
      );
    }

    const scope = inferScope(query);
    const suiClient = getSuiPassportClient();

    const hasAccess = await suiClient.checkScope(requestorAddress, row.passport_id, scope);
    if (!hasAccess) {
      return NextResponse.json(
        {
          error: `Access denied. Your grant does not cover the '${scope}' scope needed to answer: "${query}".`,
          requiredScope: scope,
        },
        { status: 403 }
      );
    }

    // Read manifest (SQLite cache first, then MemWal)
    let manifestJson: string | null = null;

    const cached = db
      .prepare("SELECT manifest_json FROM manifest_cache WHERE shipment_id = ?")
      .get(shipmentId) as { manifest_json: string } | undefined;
    manifestJson = cached?.manifest_json ?? null;

    if (!manifestJson && row.memwal_space_id) {
      manifestJson = await readManifestFromMemWal(row.memwal_space_id, shipmentId);
      if (manifestJson) {
        db.prepare(`
          INSERT OR REPLACE INTO manifest_cache (shipment_id, manifest_json, fetched_from)
          VALUES (?, ?, 'memwal')
        `).run(shipmentId, manifestJson);
      }
    }

    if (!manifestJson) {
      return NextResponse.json({ error: "Manifest not available" }, { status: 500 });
    }

    const scopedManifest = filterManifestByScope(manifestJson, scope);

    // If MemWal is configured, do a semantic recall first to enrich context
    let memwalContext = "";
    if (isMemWalConfigured() && row.memwal_space_id) {
      const parts = row.memwal_space_id.split(":");
      const namespace = parts.length === 2 ? parts[1] : shipmentId;
      try {
        const recalled = await memwalRecall(query, namespace, 3);
        if (recalled.length > 0) {
          memwalContext = "\n\nAdditional recalled context from MemWal:\n" +
            recalled.map((r, i) => `[${i + 1}] ${r.text.slice(0, 400)}`).join("\n");
        }
      } catch {
        // non-fatal — continue without MemWal context
      }
    }

    if (process.env.MOCK_DOC_AI === "true") {
      return NextResponse.json({
        answer: `[Mock answer] Based on the shipment manifest, the answer to "${query}" is: (mock data — enable real AI for actual answers).`,
        scope,
        requestorAddress,
      });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: `You are a shipment passport assistant. You have access to a structured shipment manifest
and must answer questions accurately based only on the data in the manifest.
Be concise. If the information is not in the manifest, say so.`,
      messages: [
        {
          role: "user",
          content: `Shipment manifest:\n${scopedManifest}${memwalContext}\n\nQuestion: ${query}`,
        },
      ],
    });

    const answer = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    return NextResponse.json({ answer, scope, requestorAddress });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
