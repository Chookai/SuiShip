import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isMemWalConfigured, memwalRecall } from "@/lib/memwal";

export const runtime = "nodejs";

type MemoryItem = {
  namespace: string;
  source: "memwal" | "local";
  kind: string;
  text: string;
  blobId?: string;
  distance?: number;
  timestamp?: string;
};

type NamespaceMemories = {
  main: MemoryItem[];
  docs: MemoryItem[];
  progress: MemoryItem[];
};

function dedupeMemories(items: MemoryItem[]): MemoryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.namespace}:${item.kind}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMemWalItems(
  items: Array<{ blobId: string; text: string; distance: number }>,
  namespace: string,
  kind: string,
): MemoryItem[] {
  return items.map((item) => ({
    namespace,
    source: "memwal",
    kind,
    text: item.text,
    blobId: item.blobId,
    distance: item.distance,
  }));
}

function localNamespaceMemories(shipmentId: string): NamespaceMemories {
  const db = getDb();

  const manifestRow = db.prepare(
    "SELECT manifest_json, fetched_from FROM manifest_cache WHERE shipment_id = ?"
  ).get(shipmentId) as { manifest_json: string; fetched_from: string } | undefined;

  const validationRow = db.prepare(`
    SELECT overall_verdict, verdict_reason, doc_set_hash, created_at
    FROM validation_runs
    WHERE shipment_id = ? AND is_superseded = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(shipmentId) as {
    overall_verdict: string | null;
    verdict_reason: string | null;
    doc_set_hash: string | null;
    created_at: string;
  } | undefined;

  const docRows = db.prepare(`
    SELECT doc_type, file_name, state, uploaded_at
    FROM shipment_files
    WHERE shipment_id = ?
    ORDER BY uploaded_at DESC LIMIT 8
  `).all(shipmentId) as Array<{
    doc_type: string | null;
    file_name: string;
    state: string;
    uploaded_at: string | null;
  }>;

  const endorsementRows = db.prepare(`
    SELECT role, action, signer_address, tx_digest, signed_at_ms
    FROM passport_endorsements
    WHERE shipment_id = ?
    ORDER BY signed_at_ms DESC LIMIT 8
  `).all(shipmentId) as Array<{
    role: string;
    action: string;
    signer_address: string;
    tx_digest: string;
    signed_at_ms: number;
  }>;

  const progressRows = db.prepare(`
    SELECT stage, actor, summary, created_at
    FROM progress_manifests
    WHERE shipment_id = ?
    ORDER BY sequence DESC LIMIT 8
  `).all(shipmentId) as Array<{
    stage: string;
    actor: string;
    summary: string;
    created_at: string;
  }>;

  const main: MemoryItem[] = [];
  const docs: MemoryItem[] = [];
  const progress: MemoryItem[] = [];

  if (manifestRow?.manifest_json) {
    main.push({
      namespace: shipmentId,
      source: "local",
      kind: "manifest_summary",
      text: `SHIPMENT MANIFEST\n${manifestRow.manifest_json}`,
    });
  }

  if (validationRow) {
    main.push({
      namespace: shipmentId,
      source: "local",
      kind: "validation_summary",
      text: `VALIDATION SUMMARY\n${JSON.stringify({
        overall_verdict: validationRow.overall_verdict,
        verdict_reason: validationRow.verdict_reason,
        doc_set_hash: validationRow.doc_set_hash,
        created_at: validationRow.created_at,
      }, null, 2)}`,
      timestamp: validationRow.created_at,
    });
  }

  for (const row of docRows) {
    docs.push({
      namespace: `${shipmentId}:docs`,
      source: "local",
      kind: "document_event",
      text: `DOCUMENT EVENT\n${JSON.stringify({
        doc_type: row.doc_type,
        file_name: row.file_name,
        state: row.state,
        uploaded_at: row.uploaded_at,
      }, null, 2)}`,
      timestamp: row.uploaded_at ?? undefined,
    });
  }

  for (const row of progressRows) {
    progress.push({
      namespace: `${shipmentId}:progress`,
      source: "local",
      kind: "progress_event",
      text: `PROGRESS EVENT\n${JSON.stringify({
        stage: row.stage,
        actor: row.actor,
        summary: row.summary,
        created_at: row.created_at,
      }, null, 2)}`,
      timestamp: row.created_at,
    });
  }

  for (const row of endorsementRows) {
    progress.push({
      namespace: `${shipmentId}:progress`,
      source: "local",
      kind: "endorsement_recorded",
      text: `ENDORSEMENT EVENT\n${JSON.stringify({
        role: row.role,
        action: row.action,
        signer: row.signer_address,
        tx_digest: row.tx_digest,
        timestamp: new Date(row.signed_at_ms).toISOString(),
      }, null, 2)}`,
      timestamp: new Date(row.signed_at_ms).toISOString(),
    });
  }

  return {
    main: dedupeMemories(main),
    docs: dedupeMemories(docs),
    progress: dedupeMemories(progress),
  };
}

async function recallNamespace(
  namespace: string,
  query: string,
  limit: number,
): Promise<MemoryItem[]> {
  const recalled = await memwalRecall(query, namespace, limit);
  return normalizeMemWalItems(recalled, namespace, "recall");
}

async function recentNamespaceMemories(
  shipmentId: string,
): Promise<NamespaceMemories> {
  const local = localNamespaceMemories(shipmentId);
  if (!isMemWalConfigured()) return local;

  try {
    const [main, docs, progress] = await Promise.all([
      recallNamespace(shipmentId, "shipment manifest summary validation", 6),
      recallNamespace(`${shipmentId}:docs`, "document extracted validated conflict document event", 6),
      recallNamespace(`${shipmentId}:progress`, "progress endorsement custody timeline shipment event", 6),
    ]);

    return {
      main: dedupeMemories(main.length > 0 ? main : local.main),
      docs: dedupeMemories(docs.length > 0 ? docs : local.docs),
      progress: dedupeMemories(progress.length > 0 ? progress : local.progress),
    };
  } catch {
    return local;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const namespaces = await recentNamespaceMemories(shipmentId);
    return NextResponse.json({
      shipmentId,
      memwalConfigured: isMemWalConfigured(),
      namespaces,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params;
    const body = (await request.json()) as { query?: string };
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const local = localNamespaceMemories(shipmentId);
    if (!isMemWalConfigured()) {
      return NextResponse.json({
        shipmentId,
        memwalConfigured: false,
        query,
        queryResults: local,
      });
    }

    const [main, docs, progress] = await Promise.all([
      recallNamespace(shipmentId, query, 3),
      recallNamespace(`${shipmentId}:docs`, query, 3),
      recallNamespace(`${shipmentId}:progress`, query, 3),
    ]);

    return NextResponse.json({
      shipmentId,
      memwalConfigured: true,
      query,
      queryResults: {
        main: dedupeMemories(main.length > 0 ? main : local.main),
        docs: dedupeMemories(docs.length > 0 ? docs : local.docs),
        progress: dedupeMemories(progress.length > 0 ? progress : local.progress),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
