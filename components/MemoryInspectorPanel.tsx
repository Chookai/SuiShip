"use client";

import {
  AlertTriangle,
  Brain,
  ExternalLink,
  FileSearch,
  GitCompareArrows,
  History,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { maskAccount, type AgentMemoryTraceStep, type FieldComparison } from "@/lib/agents/field-comparisons";
import type { ShipmentRecord } from "@/lib/shipments-store";

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

function aggregatorUrl(blobId: string) {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
}

type Memory = {
  namespace?: string;
  blobId?: string;
  text: string;
  distance?: number;
};

type PartyResponse = {
  namespace: string;
  namespaceKey: string;
  memories: Memory[];
};

type DocumentResponse = {
  namespace: string;
  memories: Memory[];
};

type SearchResponse = {
  memories: Memory[];
};

type ValidationResponse = {
  fieldComparisons?: FieldComparison[];
  memoryTrace?: AgentMemoryTraceStep[];
  baselineStatus?: "baseline_established" | "prior_memory_found";
};

type Tab = "diff" | "timeline" | "raw";

export function MemoryInspectorPanel({ shipment, refreshKey = 0 }: { shipment: ShipmentRecord; refreshKey?: number }) {
  const [tab, setTab] = useState<Tab>("diff");
  const [partyMemories, setPartyMemories] = useState<Array<PartyResponse & { role: string; company: string }>>([]);
  const [documentMemories, setDocumentMemories] = useState<Memory[]>([]);
  const [comparisons, setComparisons] = useState<FieldComparison[]>([]);
  const [memoryTrace, setMemoryTrace] = useState<AgentMemoryTraceStep[]>([]);
  const [baselineStatus, setBaselineStatus] = useState<"baseline_established" | "prior_memory_found">("baseline_established");
  const [searchNamespace, setSearchNamespace] = useState("global:documents");
  const [searchQuery, setSearchQuery] = useState("duplicate invoice BOL party history");
  const [searchResults, setSearchResults] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionableComparisons = useMemo(
    () => comparisons.filter((item) => item.findingType !== "missing_data" || item.severity !== "info"),
    [comparisons]
  );
  const criticalCount = actionableComparisons.filter((item) => item.severity === "critical").length;
  const warningCount = actionableComparisons.filter((item) => item.severity === "warning").length;
  const hasPriorMemory = baselineStatus === "prior_memory_found" || comparisons.some((item) => item.rememberedValue != null);

  const documentQuery = useMemo(() => {
    return {
      invoice: shipment.extractedRef,
      bol: shipment.shipment.bookingRef,
    };
  }, [shipment.extractedRef, shipment.shipment.bookingRef]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const parties = [
          { role: "Exporter", party: shipment.exporter },
          { role: "Importer", party: shipment.importer },
        ];
        const [partyPayloads, docPayload, validationPayload] = await Promise.all([
          Promise.all(parties.map(async ({ role, party }) => {
            const key = encodeURIComponent(party.taxId || party.company);
            const response = await fetch(`/api/memory/party/${key}?company=${encodeURIComponent(party.company)}`);
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error ?? `Party memory HTTP ${response.status}`);
            return { ...(payload as PartyResponse), role, company: party.company };
          })),
          fetchDocumentMemory(documentQuery.invoice, documentQuery.bol),
          fetchValidation(shipment.id),
        ]);

        if (!cancelled) {
          const nextComparisons = validationPayload.fieldComparisons ?? [];
          setPartyMemories(partyPayloads);
          setDocumentMemories(docPayload.memories ?? []);
          setComparisons(nextComparisons);
          setMemoryTrace(validationPayload.memoryTrace?.length ? validationPayload.memoryTrace : fallbackTrace(nextComparisons, docPayload.memories ?? []));
          setBaselineStatus(validationPayload.baselineStatus ?? inferBaselineStatus(nextComparisons, partyPayloads));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load memory inspector");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [documentQuery.bol, documentQuery.invoice, refreshKey, shipment.exporter, shipment.id, shipment.importer]);

  async function runSearch() {
    setQuerying(true);
    setError(null);
    try {
      const response = await fetch("/api/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace: searchNamespace, query: searchQuery, limit: 10 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? `Search HTTP ${response.status}`);
      setSearchResults((payload as SearchResponse).memories ?? []);
      setTab("raw");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search memory");
    } finally {
      setQuerying(false);
    }
  }

  async function retryMemorySync() {
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/memory/sync`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? `Memory sync HTTP ${response.status}`);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry memory sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Panel className="min-w-0 overflow-hidden border-blue-200 bg-gradient-to-br from-white via-blue-50/40 to-emerald-50/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0B1F33] text-white shadow-sm">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#4DA2FF]">MemWal Agent Memory</p>
            <h2 className="text-2xl font-black text-pearl">AI Memory & Evidence Diff</h2>
            <p className="mt-1 text-sm text-steel">
              Live extraction, form-vs-document checks, cross-shipment recall, and verifiable Walrus/Sui evidence.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {shipment.memWalSyncStatus === "failed" ? (
            <Button variant="secondary" onClick={retryMemorySync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              Retry memory sync
            </Button>
          ) : null}
          <div className="flex rounded-xl border border-blue-100 bg-white p-1 shadow-sm">
            {(["diff", "timeline", "raw"] as Tab[]).map((value) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`rounded-lg px-3 py-2 text-xs font-black uppercase ${tab === value ? "bg-[#0B1F33] text-white" : "text-steel hover:bg-blue-50"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`mt-5 rounded-2xl border p-4 ${hasPriorMemory ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {hasPriorMemory ? <History className="mt-0.5 h-5 w-5 text-emerald-600" /> : <Sparkles className="mt-0.5 h-5 w-5 text-[#4DA2FF]" />}
            <div>
              <p className="text-sm font-black text-pearl">
                {hasPriorMemory
                  ? "Prior exporter memory found. Comparing against historical baseline."
                  : "No prior history found. Establishing exporter baseline."}
              </p>
              <p className="mt-1 text-xs font-semibold text-steel">
                {hasPriorMemory
                  ? "The validation agent recalled structured MemWal facts and compared remembered values against the current form and extracted documents."
                  : "After mint, this shipment writes structured exporter facts and document fingerprints to MemWal for the next run."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricPill label="Critical" value={criticalCount} tone="critical" />
            <MetricPill label="Warnings" value={warningCount} tone="warning" />
            <MetricPill label="Recalled" value={partyMemories.reduce((sum, item) => sum + item.memories.length, 0)} tone="info" />
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-steel"><Loader2 className="h-4 w-4 animate-spin" /> Loading agent memory diff...</p>
      ) : null}

      {!loading && tab === "diff" ? (
        <div className="mt-5 grid gap-5">
          <DiffTable comparisons={comparisons} />
          <ComparisonGroup
            title="Intra-shipment inconsistency"
            subtitle="Entered form values compared against facts extracted from this shipment's documents."
            empty="No form-vs-document differences detected."
            comparisons={actionableComparisons.filter((item) => item.findingType === "entered_vs_extracted")}
          />
          <ComparisonGroup
            title="Cross-shipment memory anomaly"
            subtitle="Current identity and document-integrity values compared against this exporter's remembered MemWal baseline."
            empty={hasPriorMemory ? "No remembered baseline differences detected." : "No prior baseline yet. This run establishes memory."}
            comparisons={actionableComparisons.filter((item) => item.findingType === "cross_shipment_memory")}
          />
          <ComparisonGroup
            title="Duplicate document / fingerprint anomaly"
            subtitle="Invoice and BOL identifiers compared against global document fingerprints."
            empty="No duplicate invoice or BOL fingerprint found."
            comparisons={actionableComparisons.filter((item) => item.findingType === "duplicate_document")}
          />
          <ComparisonGroup
            title="Missing evidence"
            subtitle="Important values the agent could not confirm from form data or extracted documents."
            empty="No missing key evidence detected."
            comparisons={comparisons.filter((item) => item.findingType === "missing_data")}
          />
        </div>
      ) : null}

      {!loading && tab === "timeline" ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Timeline trace={memoryTrace} />
          <MemoryGrowth partyMemories={partyMemories} documentMemories={documentMemories} shipment={shipment} />
        </div>
      ) : null}

      {tab === "raw" ? (
        <div className="mt-5 grid gap-5">
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
            <input
              value={searchNamespace}
              onChange={(event) => setSearchNamespace(event.target.value)}
              className="min-h-11 rounded-lg border border-blue-100 bg-white px-3 text-sm font-semibold text-pearl outline-none focus:border-sui/70"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="min-h-11 rounded-lg border border-blue-100 bg-white px-3 text-sm font-semibold text-pearl outline-none focus:border-sui/70"
            />
            <Button onClick={runSearch} disabled={querying || !searchNamespace || !searchQuery}>
              {querying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {partyMemories.map((party) => (
              <MemoryGroup key={party.namespace} title={`${party.role}: ${party.company}`} subtitle={party.namespace} memories={party.memories} />
            ))}
            <MemoryGroup title="Document Fingerprints" subtitle="global:documents" memories={documentMemories} duplicateMode />
            <MemoryGroup title="Search Results" subtitle={searchNamespace} memories={searchResults} />
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

async function fetchDocumentMemory(invoice?: string, bol?: string): Promise<DocumentResponse> {
  const params = new URLSearchParams();
  if (invoice) params.set("invoice", invoice);
  if (bol) params.set("bol", bol);
  const response = await fetch(`/api/memory/documents?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? `Document memory HTTP ${response.status}`);
  return payload as DocumentResponse;
}

async function fetchValidation(shipmentId: string): Promise<ValidationResponse> {
  const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/validate`);
  if (response.status === 404) return {};
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? `Validation HTTP ${response.status}`);
  return payload as ValidationResponse;
}

function inferBaselineStatus(
  comparisons: FieldComparison[],
  parties: Array<PartyResponse & { role: string; company: string }>
): "baseline_established" | "prior_memory_found" {
  if (comparisons.some((item) => item.rememberedValue != null)) return "prior_memory_found";
  if (parties.some((party) => party.memories.length > 0)) return "prior_memory_found";
  return "baseline_established";
}

function fallbackTrace(comparisons: FieldComparison[], documentMemories: Memory[]): AgentMemoryTraceStep[] {
  const hasMemory = comparisons.some((item) => item.rememberedValue != null);
  return [
    { id: "documents_extracted", label: "Documents extracted", status: "complete", detail: "Uploaded PDFs were extracted into normalized shipment facts." },
    {
      id: "entered_extracted_compared",
      label: "Entered fields compared with extracted facts",
      status: comparisons.some((item) => item.findingType === "entered_vs_extracted" && item.severity === "critical") ? "critical" : "complete",
      detail: `${comparisons.filter((item) => item.findingType === "entered_vs_extracted").length} form-vs-document difference(s) found.`,
    },
    {
      id: "memwal_recall",
      label: hasMemory ? "MemWal recalled exporter baseline" : "No prior exporter memory found",
      status: "complete",
      detail: hasMemory ? "Structured exporter facts were recalled from MemWal." : "This shipment can become the exporter baseline after mint.",
    },
    {
      id: "memory_comparison",
      label: "Differences detected",
      status: comparisons.some((item) => item.severity === "critical") ? "critical" : comparisons.some((item) => item.severity === "warning") ? "warning" : "complete",
      detail: `${comparisons.filter((item) => item.findingType !== "missing_data").length} actionable comparison(s) found.`,
    },
    {
      id: "evidence_anchored",
      label: "Evidence anchored to Walrus/Sui",
      status: documentMemories.length > 0 ? "complete" : "warning",
      detail: documentMemories.length > 0 ? `${documentMemories.length} document fingerprint memory record(s) recalled.` : "Walrus/Sui provenance appears after mint and memory sync.",
    },
  ];
}

function MetricPill({ label, value, tone }: { label: string; value: number; tone: "critical" | "warning" | "info" }) {
  const classes = tone === "critical"
    ? "border-red-200 bg-red-50 text-red-600"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-blue-200 bg-white text-[#4DA2FF]";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${classes}`}>
      {label}: {value}
    </span>
  );
}

function DiffTable({ comparisons }: { comparisons: FieldComparison[] }) {
  const identityFields = new Set(["exporter.name", "exporter.bank_beneficiary_name", "exporter.bank_account", "exporter.registered_address", "cargo.country_of_origin", "documents.invoice_number", "shipment.bl_number", "documents.coo_number"]);
  const rows = comparisons.filter((item) =>
    item.findingType === "entered_vs_extracted" ||
    item.findingType === "duplicate_document" ||
    identityFields.has(item.field)
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-blue-50 px-4 py-3">
        <GitCompareArrows className="h-4 w-4 text-[#4DA2FF]" />
        <h3 className="font-black text-pearl">Identity Memory and Document Evidence Diff</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-blue-50/70 text-xs font-black uppercase tracking-wide text-steel">
            <tr>
              <th className="px-4 py-3">Field</th>
              <th className="px-4 py-3">Entered Now</th>
              <th className="px-4 py-3">Extracted From Docs</th>
              <th className="px-4 py-3">Remembered Baseline</th>
              <th className="px-4 py-3">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm font-semibold text-steel">
                  Run validation to populate the live field diff.
                </td>
              </tr>
            ) : rows.map((item, index) => (
              <tr key={`${item.field}-${item.findingType}-${index}`} className="align-top">
                <td className="px-4 py-3 font-black text-pearl">{item.label}</td>
                <td className="px-4 py-3 font-semibold text-steel">{formatDiffValue(item.field, item.enteredValue)}</td>
                <td className="px-4 py-3 font-semibold text-steel">{formatDiffValue(item.field, item.extractedValue)}</td>
                <td className="px-4 py-3 font-semibold text-steel">{formatDiffValue(item.field, item.rememberedValue)}</td>
                <td className="px-4 py-3"><SeverityBadge severity={item.severity} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonGroup({
  title,
  subtitle,
  empty,
  comparisons,
}: {
  title: string;
  subtitle: string;
  empty: string;
  comparisons: FieldComparison[];
}) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-pearl">{title}</h3>
          <p className="mt-1 text-xs font-semibold text-steel">{subtitle}</p>
        </div>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-[#4DA2FF]">
          {comparisons.length} finding{comparisons.length === 1 ? "" : "s"}
        </span>
      </div>
      {comparisons.length === 0 ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-steel">{empty}</div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {comparisons.map((item, index) => <AnomalyCard key={`${item.field}-${index}`} comparison={item} />)}
        </div>
      )}
    </div>
  );
}

function AnomalyCard({ comparison }: { comparison: FieldComparison }) {
  const critical = comparison.severity === "critical";
  return (
    <div className={`rounded-2xl border p-4 ${critical ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start gap-3">
        {critical ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black text-pearl">{comparison.label}</h4>
            <SeverityBadge severity={comparison.severity} />
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-steel">{comparison.explanation}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 rounded-xl bg-white/80 p-3 text-xs font-semibold">
        <DiffLine label="Entered" value={comparison.enteredValue} />
        <DiffLine label="Extracted" value={comparison.extractedValue} />
        <DiffLine label="Remembered" value={comparison.rememberedValue} />
      </div>
      <div className="mt-3 rounded-xl border border-white/80 bg-white/60 p-3">
        <p className="text-[10px] font-black uppercase tracking-wide text-steel">Recommended action</p>
        <p className="mt-1 text-sm font-bold leading-6 text-pearl">{comparison.recommendedAction}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {comparison.sourceDocuments.map((doc) => <span key={doc} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-steel">{formatDocName(doc)}</span>)}
        {(comparison.evidence ?? []).map((evidence) => <EvidencePill key={`${evidence.kind}-${evidence.value}`} evidence={evidence} />)}
      </div>
    </div>
  );
}

function Timeline({ trace }: { trace: AgentMemoryTraceStep[] }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-[#4DA2FF]" />
        <h3 className="font-black text-pearl">Agent Reasoning Trace</h3>
      </div>
      <div className="mt-4 grid gap-3">
        {trace.map((step, index) => (
          <div key={step.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${traceTone(step.status)}`}>
              {index + 1}
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <p className="font-black text-pearl">{step.label}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-steel">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MemoryGrowth({
  partyMemories,
  documentMemories,
  shipment,
}: {
  partyMemories: Array<PartyResponse & { role: string; company: string }>;
  documentMemories: Memory[];
  shipment: ShipmentRecord;
}) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <FileSearch className="h-4 w-4 text-[#4DA2FF]" />
        <h3 className="font-black text-pearl">Memory Growth & Provenance</h3>
      </div>
      <div className="mt-4 grid gap-3">
        {partyMemories.map((party) => (
          <div key={party.namespace} className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-black text-pearl">{party.role}: {party.company}</p>
                <p className="break-all text-xs font-semibold text-steel">{party.namespace}</p>
              </div>
              <MetricPill label="Memories" value={party.memories.length} tone="info" />
            </div>
            <p className="mt-2 text-sm font-semibold text-steel">
              {party.memories.length > 0
                ? "Exporter profile facts are available for cross-shipment recall."
                : "No recalled profile yet. Minting this shipment establishes the baseline."}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
          <p className="font-black text-pearl">Document fingerprint memory</p>
          <p className="mt-1 text-sm font-semibold text-steel">
            {documentMemories.length} fingerprint record{documentMemories.length === 1 ? "" : "s"} recalled for invoice/BOL duplicate checks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shipment.walrusBlobIds?.slice(0, 3).map((blob) => <ExternalPill key={blob} href={aggregatorUrl(blob)} label={`Walrus ${truncate(blob)}`} />)}
          {shipment.txDigest ? <ExternalPill href={`https://suiscan.xyz/testnet/tx/${shipment.txDigest}`} label="Mint transaction" /> : null}
          {shipment.passportId ? <ExternalPill href={`https://suiscan.xyz/testnet/object/${shipment.passportId}`} label="Sui passport" /> : null}
        </div>
      </div>
    </div>
  );
}

function MemoryGroup({
  title,
  subtitle,
  memories,
  duplicateMode = false,
}: {
  title: string;
  subtitle: string;
  memories: Memory[];
  duplicateMode?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-black text-pearl">{title}</h3>
          <p className="break-all text-xs font-semibold text-steel">{subtitle}</p>
        </div>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-black text-[#4DA2FF]">
          {memories.length} recalled
        </span>
      </div>
      {memories.length === 0 ? (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-steel">
          No MemWal memory found for this query.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {memories.map((memory, index) => (
            <MemoryCard key={`${memory.blobId ?? "local"}-${index}`} memory={memory} duplicateMode={duplicateMode} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryCard({ memory, duplicateMode }: { memory: Memory; duplicateMode: boolean }) {
  const walrusIds = extractList(memory.text, /walrus(?:_evidence| blobs?)?[=:]?\s*([A-Za-z0-9_,\s-]+)/i);
  const tx = extractOne(memory.text, /sui_tx[=:]\s*([A-Za-z0-9]+)/i) ?? extractOne(memory.text, /transaction\s+([A-Za-z0-9]+)/i);
  const passport = extractOne(memory.text, /sui_passport[=:]\s*([A-Za-z0-9]+)/i) ?? extractOne(memory.text, /passport\s+([A-Za-z0-9]+)/i);

  return (
    <div className={`rounded-lg border p-4 ${duplicateMode ? "border-red-200 bg-red-50" : "border-blue-100 bg-blue-50/40"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <FileSearch className="h-4 w-4 text-[#4DA2FF]" />
        {duplicateMode ? (
          <span className="rounded-full bg-red-600 px-2 py-1 text-xs font-black uppercase text-white">Fingerprint memory</span>
        ) : null}
        {typeof memory.distance === "number" ? (
          <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">
            score {(1 - memory.distance).toFixed(2)}
          </span>
        ) : null}
      </div>
      <p className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-steel">{memory.text.slice(0, 900)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {memory.blobId ? <ExternalPill href={aggregatorUrl(memory.blobId)} label="MemWal blob" /> : null}
        {walrusIds.slice(0, 3).map((id) => <ExternalPill key={id} href={aggregatorUrl(id)} label={`Walrus ${truncate(id)}`} />)}
        {tx ? <ExternalPill href={`https://suiscan.xyz/testnet/tx/${tx}`} label="Sui tx" /> : null}
        {passport ? <ExternalPill href={`https://suiscan.xyz/testnet/object/${passport}`} label="Passport" /> : null}
      </div>
    </div>
  );
}

function DiffLine({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
      <span className="text-steel">{label}</span>
      <span className="break-words font-black text-pearl">{formatValue(value)}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: FieldComparison["severity"] }) {
  const classes = severity === "critical"
    ? "bg-red-600 text-white"
    : severity === "warning"
      ? "bg-amber-100 text-amber-800"
      : "bg-blue-100 text-[#4DA2FF]";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${classes}`}>{severity}</span>;
}

function EvidencePill({ evidence }: { evidence: NonNullable<FieldComparison["evidence"]>[number] }) {
  const href = evidence.kind === "walrus" || evidence.kind === "memwal"
    ? aggregatorUrl(evidence.value)
    : evidence.kind === "sui_tx"
      ? `https://suiscan.xyz/testnet/tx/${evidence.value}`
      : evidence.kind === "sui_object"
        ? `https://suiscan.xyz/testnet/object/${evidence.value}`
        : null;
  if (!href) return <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-steel">{evidence.label}</span>;
  return <ExternalPill href={href} label={evidence.label} />;
}

function ExternalPill({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-xs font-black text-[#4DA2FF]">
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function traceTone(status: AgentMemoryTraceStep["status"]) {
  if (status === "critical") return "bg-red-600 text-white";
  if (status === "warning") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-700";
}

function formatValue(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}

function formatDiffValue(field: string, value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return field.includes("bank_account") ? maskAccount(value) : String(value);
}

function formatDocName(value: string) {
  return value.replace(/_/g, " ");
}

function extractOne(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

function extractList(text: string, pattern: RegExp): string[] {
  const raw = extractOne(text, pattern);
  if (!raw) return [];
  return raw.split(/[,\s]+/).map((item) => item.trim()).filter((item) => item.length > 10);
}

function truncate(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}
