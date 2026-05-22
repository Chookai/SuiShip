"use client";

import { AlertCircle, BrainCircuit, Clock3, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Panel } from "@/components/ui";

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

type MemoryResponse = {
  shipmentId: string;
  memwalConfigured: boolean;
  namespaces?: NamespaceMemories;
  queryResults?: NamespaceMemories;
};

function previewText(text: string, limit = 520) {
  const compact = text.trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit)}…`;
}

function MemorySection({ title, items }: { title: string; items: MemoryItem[] }) {
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-sui" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-pearl">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-steel">
          No memories available.
        </div>
      ) : (
        items.map((item, index) => (
          <div key={`${title}-${item.kind}-${index}`} className="min-w-0 overflow-hidden rounded-2xl border border-blue-100 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-steel">
              <span>{item.kind.replace(/_/g, " ")}</span>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[#4DA2FF]">
                {item.source}
              </span>
              {typeof item.distance === "number" ? (
                <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-amber-700">
                  score {(1 - item.distance).toFixed(2)}
                </span>
              ) : null}
            </div>
            <div className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-steel">
              {previewText(item.text)}
            </div>
            {item.blobId ? (
              <p className="mt-3 break-all text-[11px] font-semibold text-[#4DA2FF]">{item.blobId}</p>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

export function MemWalMemoryPanel({
  shipmentId,
  refreshKey = 0,
}: {
  shipmentId: string;
  refreshKey?: number;
}) {
  const [memoryResponse, setMemoryResponse] = useState<MemoryResponse | null>(null);
  const [queryResponse, setQueryResponse] = useState<NamespaceMemories | null>(null);
  const [query, setQuery] = useState("latest endorsement and validation summary");
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentMemories() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/memory`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
        }
        if (!cancelled) {
          setMemoryResponse(payload as MemoryResponse);
          setQueryResponse(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load operational memory");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecentMemories();
    return () => {
      cancelled = true;
    };
  }, [shipmentId, refreshKey]);

  async function runRecall() {
    setQuerying(true);
    setError(null);
    try {
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
      }
      setQueryResponse((payload as MemoryResponse).queryResults ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recall memories");
    } finally {
      setQuerying(false);
    }
  }

  const activeMemories = useMemo(
    () => queryResponse ?? memoryResponse?.namespaces ?? { main: [], docs: [], progress: [] },
    [memoryResponse?.namespaces, queryResponse],
  );

  return (
    <Panel className="min-w-0 overflow-hidden">
      <div className="flex items-center gap-3">
        <BrainCircuit className="h-5 w-5 text-sui" />
        <div>
          <h2 className="text-xl font-semibold text-pearl">MemWal Memory Panel</h2>
          <p className="text-sm text-steel">Operational memory only: manifest summary, validation notes, document events, and progress/endorsement events.</p>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4">
        <label className="grid gap-2 text-sm font-medium text-steel">
          <span>Semantic recall query</span>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
            className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-pearl shadow-sm outline-none transition placeholder:text-steel/55 focus:border-sui/70 focus:bg-blue-50/50"
          />
        </label>
        <div className="flex min-w-0 flex-wrap gap-3">
          <Button onClick={runRecall} disabled={querying || !query.trim()}>
            {querying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Run recall
          </Button>
          <Button
            variant="secondary"
            onClick={() => setQueryResponse(null)}
            disabled={querying || queryResponse === null}
          >
            Show recent memories
          </Button>
          {memoryResponse ? (
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#4DA2FF]">
              {memoryResponse.memwalConfigured ? "MemWal live" : "Local fallback"}
            </span>
          ) : null}
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-steel">Loading memory...</p> : null}
      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-5 grid min-w-0 gap-5">
          <MemorySection title="Manifest + Validation" items={activeMemories.main} />
          <MemorySection title="Document Events" items={activeMemories.docs} />
          <MemorySection title="Progress + Endorsements" items={activeMemories.progress} />
        </div>
      ) : null}
    </Panel>
  );
}
