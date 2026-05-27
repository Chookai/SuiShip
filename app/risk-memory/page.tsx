"use client";

import {
  AlertTriangle,
  BrainCircuit,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { RISK_EVENTS_NAMESPACE, RISK_OBSERVATIONS_NAMESPACE } from "@/lib/agents/risk-types";
import { cn } from "@/lib/utils";

type RiskMemoryRecord = {
  namespace: string;
  blobId: string;
  text: string;
  distance: number;
};

type RiskMemoryResponse = {
  memwalConfigured: boolean;
  query: string;
  namespaces: string[];
  memories: RiskMemoryRecord[];
  error?: string;
};

const DEFAULT_QUERY = "risk delay disruption route carrier ETA customs port weather piracy canal geopolitical";

export default function RiskMemoryPage() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [submittedQuery, setSubmittedQuery] = useState(DEFAULT_QUERY);
  const [payload, setPayload] = useState<RiskMemoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextQuery = submittedQuery) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ query: nextQuery, limit: "30" });
      const response = await fetch(`/api/risk-memory?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Risk memory HTTP ${response.status}`);
      setPayload(data as RiskMemoryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load risk memory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(DEFAULT_QUERY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim() || DEFAULT_QUERY;
    setSubmittedQuery(nextQuery);
    void load(nextQuery);
  }

  async function seedHistoricalMemory() {
    setSeeding(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/risk-memory/seed", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Seed HTTP ${response.status}`);
      await load(submittedQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seed risk memory");
    } finally {
      setSeeding(false);
    }
  }

  const grouped = useMemo(() => groupByNamespace(payload?.memories ?? []), [payload?.memories]);
  const total = payload?.memories.length ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 lg:px-10">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sui/25 bg-sui/10 px-3 py-1 text-sm font-bold text-sui">
            <BrainCircuit className="h-4 w-4" />
            MemWal Risk Memory
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-pearl">Risk Memory</h1>
          <p className="mt-3 max-w-3xl text-steel">
            Browse historical risk events and live risk observations written back by the Risk Agent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => load(submittedQuery)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={seedHistoricalMemory} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Seed Historical Risks
          </Button>
        </div>
      </div>

      <div className="grid gap-5">
        <Panel>
          <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row">
            <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4">
              <Search className="h-4 w-4 shrink-0 text-sui" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-pearl outline-none placeholder:text-steel"
                placeholder="Search risk memory..."
              />
            </label>
            <Button type="submit" disabled={loading}>
              Search
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <NamespacePill namespace={RISK_EVENTS_NAMESPACE} />
            <NamespacePill namespace={RISK_OBSERVATIONS_NAMESPACE} />
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase text-steel">
              {total} recalled
            </span>
          </div>
        </Panel>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {payload && !payload.memwalConfigured ? (
          <Panel className="border-amber-100 bg-amber-50">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="font-black text-pearl">MemWal is not configured.</p>
                <p className="mt-1 text-sm font-semibold text-steel">
                  Add MemWal credentials to `.env` to recall risk-event and risk-observation memories.
                </p>
              </div>
            </div>
          </Panel>
        ) : null}

        {loading ? (
          <Panel>
            <div className="flex items-center gap-2 text-sm font-semibold text-steel">
              <Loader2 className="h-4 w-4 animate-spin text-sui" />
              Loading risk memory...
            </div>
          </Panel>
        ) : total > 0 ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {Object.entries(grouped).map(([namespace, memories]) => (
              <Panel key={namespace} className="min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-sui">{namespace}</p>
                    <h2 className="mt-1 text-2xl font-black text-pearl">{namespaceLabel(namespace)}</h2>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase text-steel">
                    {memories.length}
                  </span>
                </div>
                <div className="mt-5 grid gap-3">
                  {memories.map((memory) => (
                    <RiskMemoryCard key={`${memory.namespace}-${memory.blobId}`} memory={memory} />
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <Panel>
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 text-sui" />
              <div>
                <p className="font-black text-pearl">No risk memories returned.</p>
                <p className="mt-1 text-sm font-semibold text-steel">
                  Try seeding historical risks or searching for broader logistics terms.
                </p>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function RiskMemoryCard({ memory }: { memory: RiskMemoryRecord }) {
  const title = extractField(memory.text, "title") ?? "Risk memory";
  const summary = extractField(memory.text, "summary") ?? memory.text.split("\n").find(Boolean) ?? "Stored risk memory";
  const category = extractField(memory.text, "category") ?? "risk";
  const sourceUrl = extractField(memory.text, "source_url");

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-sui">
            {category.replace(/_/g, " ")}
          </span>
          <h3 className="mt-3 break-words text-lg font-black text-pearl">{title}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-steel">{summary}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 rounded-lg bg-white/75 p-3 text-xs font-semibold text-steel">
        <p className="break-all">
          <span className="font-black text-pearl">Blob:</span> {memory.blobId}
        </p>
        <p>
          <span className="font-black text-pearl">Distance:</span> {memory.distance.toFixed(4)}
        </p>
        {sourceUrl && sourceUrl !== "n/a" ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-black text-sui hover:text-pearl">
            Open source <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-black uppercase text-sui">Raw memory</summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-5 text-steel">
          {memory.text}
        </pre>
      </details>
    </div>
  );
}

function NamespacePill({ namespace }: { namespace: string }) {
  return (
    <span className={cn(
      "rounded-full px-3 py-1 text-xs font-black uppercase",
      namespace === RISK_OBSERVATIONS_NAMESPACE ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-sui"
    )}>
      {namespaceLabel(namespace)}
    </span>
  );
}

function groupByNamespace(memories: RiskMemoryRecord[]) {
  return memories.reduce<Record<string, RiskMemoryRecord[]>>((groups, memory) => {
    groups[memory.namespace] = groups[memory.namespace] ?? [];
    groups[memory.namespace].push(memory);
    return groups;
  }, {});
}

function namespaceLabel(namespace: string) {
  if (namespace === RISK_EVENTS_NAMESPACE) return "Historical Events";
  if (namespace === RISK_OBSERVATIONS_NAMESPACE) return "Live Observations";
  return namespace;
}

function extractField(text: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? null;
}
