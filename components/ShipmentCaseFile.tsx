"use client";

import {
  AlertTriangle,
  Brain,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Fingerprint,
  Globe2,
  Loader2,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { ShipmentRecord } from "@/lib/shipments-store";
import { cn } from "@/lib/utils";
import { maskAccount, type FieldComparison } from "@/lib/agents/field-comparisons";

// ── Types ──────────────────────────────────────────────────────────────────


interface ValidationResult {
  fieldComparisons?: FieldComparison[];
  baselineStatus?: "baseline_established" | "prior_memory_found";
  overallVerdict?: string;
  verdictReason?: string;
}

interface ShipmentCaseFileProps {
  shipment: ShipmentRecord;
  refreshKey?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SUISCAN_BASE = "https://suiscan.xyz/testnet";
const WALRUSCAN_BASE = "https://walruscan.com/testnet";

// ── Helper functions ────────────────────────────────────────────────────────

function truncateId(id: string, chars = 8) {
  if (!id || id.length <= chars * 2 + 3) return id;
  return `${id.slice(0, chars)}…${id.slice(-chars)}`;
}

function suiObjectUrl(id: string) { return `${SUISCAN_BASE}/object/${id}`; }
function walrusBlobUrl(id: string) { return `${WALRUSCAN_BASE}/blob/${id}`; }
function memwalUrl(spaceId: string) {
  const ns = spaceId.includes(":") ? spaceId.split(":").slice(1).join(":") : spaceId;
  return `https://memwal.ai?space=${encodeURIComponent(ns)}`;
}


// ── Sub-components ─────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy to clipboard"
      onClick={() => {
        navigator.clipboard.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded p-1 text-steel transition hover:text-pearl"
    >
      {copied
        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        : <Copy className="h-3.5 w-3.5" />
      }
    </button>
  );
}

function SeverityBadge({ severity }: { severity: "critical" | "warning" | "info" }) {
  const styles = {
    critical: "border-red-200 bg-red-50 text-red-600",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    info: "border-blue-100 bg-blue-50 text-steel",
  };
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wide", styles[severity])}>
      {severity}
    </span>
  );
}

// ── Section 1: Recent Activities ────────────────────────────────────────────

type ActivityEntry = {
  docCount: number;
  verdict: string;
  reason?: string;
  timestamp: string;
};

function useActivityLog(shipmentId: string, refreshKey?: number) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/validation-log`);
      if (!res.ok) return;
      const data = (await res.json()) as { entries: ActivityEntry[] };
      setEntries(data.entries ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => { fetchLog(); }, [fetchLog, refreshKey]);
  return { entries, loading };
}

function ActivityCard({
  entry,
  num,
}: {
  entry: ActivityEntry;
  num: number;
}) {
  const [open, setOpen] = useState(false);
  const matched = entry.verdict === "consistent" || entry.verdict === "matched";

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className="w-full rounded-lg border border-blue-100 bg-blue-50/40 px-4 py-3 text-left transition hover:bg-blue-50"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-pearl">
          <span className="text-2xl font-bold text-sui">#{num}</span>{" "}
          {entry.docCount} doc{entry.docCount !== 1 ? "s" : ""} uploaded, AI validated:{" "}
          <span className={matched ? "text-emerald-600" : "text-amber-600"}>
            {matched ? "matched" : entry.verdict.replace(/_/g, " ")}
          </span>
        </p>
        <span className="shrink-0 text-xs text-steel/60 whitespace-nowrap">
          {new Date(entry.timestamp).toLocaleString()}
        </span>
      </div>
      {open && entry.reason && (
        <p className="mt-2 text-sm text-steel">{entry.reason}</p>
      )}
    </button>
  );
}

function RecentActivities({
  shipmentId,
  shipment,
  refreshKey,
}: {
  shipmentId: string;
  shipment: ShipmentRecord;
  refreshKey?: number;
}) {
  const { entries, loading } = useActivityLog(shipmentId, refreshKey);
  const [showAll, setShowAll] = useState(false);

  const total = entries.length;
  const visible = showAll ? entries : entries.slice(0, 1);

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-pearl">Recent Activities</h2>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-steel">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-steel">
          {shipment.extractionStatus === "extracting"
            ? "AI is processing documents…"
            : "No activities yet."}
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {visible.map((entry, idx) => (
              <ActivityCard key={idx} entry={entry} num={total - idx} />
            ))}
          </div>
          {total > 1 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="mt-3 text-sm font-semibold text-sui hover:underline"
            >
              {showAll ? "Show latest only" : `View all (${total})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TradePartiesSection({ shipment }: { shipment: ShipmentRecord }) {
  const parties = [
    {
      role: "Exporter",
      ...shipment.exporter,
      country: shipment.shipment.origin
    },
    {
      role: "Importer",
      ...shipment.importer,
      country: shipment.shipment.destination
    }
  ];

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-pearl">Trade parties</h2>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {parties.map((party) => (
          <div key={party.role} className="rounded-lg border border-blue-100 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[#4DA2FF]">{party.role}</p>
                <h3 className="mt-1 text-lg font-extrabold text-pearl">{party.company}</h3>
              </div>
              <Building2 className="h-6 w-6 text-[#4DA2FF]" />
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <p>
                <span className="font-bold text-steel">Country:</span>{" "}
                <span className="font-semibold text-pearl">{party.country}</span>
              </p>
              <p>
                <span className="font-bold text-steel">Contact:</span>{" "}
                <span className="font-semibold text-pearl">{party.contact}</span>
              </p>
              <div className="flex items-center gap-3 rounded-2xl bg-ink p-3">
                <Mail className="h-4 w-4 text-[#4DA2FF]" />
                <span className="font-semibold text-pearl">{party.email}</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-ink p-3">
                <Phone className="h-4 w-4 text-[#4DA2FF]" />
                <span className="font-semibold text-pearl">{party.phone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section 2: Evidence Diff ────────────────────────────────────────────────

const EVIDENCE_SECTIONS: Array<{
  title: string;
  fields: string[];
}> = [
  {
    title: "Exporter",
    fields: [
      "exporter.name",
      "exporter.tax_id",
      "exporter.bank_beneficiary_name",
      "exporter.bank_account",
      "exporter.registered_address",
    ],
  },
  {
    title: "Importer",
    fields: [
      "importer.name",
      "importer.tax_id",
      "importer.bank_beneficiary_name",
      "importer.bank_account",
      "importer.registered_address",
    ],
  },
  {
    title: "Documents & Cargo",
    fields: [
      "cargo.country_of_origin",
      "documents.invoice_number",
      "shipment.bl_number",
    ],
  },
];

const EVIDENCE_FIELD_LABELS: Record<string, string> = {
  "exporter.name": "Legal name",
  "exporter.tax_id": "Tax ID",
  "exporter.bank_beneficiary_name": "Bank beneficiary",
  "exporter.bank_account": "Bank account",
  "exporter.registered_address": "Registered address",
  "importer.name": "Legal name",
  "importer.tax_id": "Tax ID",
  "importer.bank_beneficiary_name": "Bank beneficiary",
  "importer.bank_account": "Bank account",
  "importer.registered_address": "Registered address",
  "cargo.country_of_origin": "Country of origin",
  "documents.invoice_number": "Invoice number",
  "shipment.bl_number": "BOL number",
};

function EvidenceDiffSection({ fieldComparisons }: { fieldComparisons: FieldComparison[] }) {
  const comparisonMap = new Map<string, FieldComparison>();
  for (const c of fieldComparisons) {
    comparisonMap.set(c.field, c);
  }

  const hasData = fieldComparisons.length > 0;

  if (!hasData) {
    return <p className="text-sm text-steel">Validation not yet run — extract documents first.</p>;
  }

  return (
    <div className="space-y-5">
      {EVIDENCE_SECTIONS.map((section) => (
        <div key={section.title}>
          <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-steel">{section.title}</h3>
          <div className="overflow-x-auto rounded-xl border border-blue-100">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr className="border-b border-blue-100 bg-blue-50">
                  <th className="px-3 py-2 text-left font-bold text-steel">Field</th>
                  <th className="px-3 py-2 text-left font-bold text-steel">Entered</th>
                  <th className="px-3 py-2 text-left font-bold text-steel">Extracted</th>
                  <th className="px-3 py-2 text-left font-bold text-steel">Remembered</th>
                  <th className="px-3 py-2 text-left font-bold text-steel">Severity</th>
                </tr>
              </thead>
              <tbody>
                {section.fields.map((field) => {
                  const comparison = comparisonMap.get(field) ?? null;
                  const sev = comparison?.severity;
                  const rowClass = sev === "critical"
                    ? "border-l-4 border-l-red-400 bg-red-50"
                    : sev === "warning"
                      ? "border-l-4 border-l-amber-400 bg-amber-50/50"
                      : "border-l-4 border-l-transparent";
                  return (
                    <tr key={field} className={cn("border-b border-blue-50 last:border-0", rowClass)}>
                      <td className="px-3 py-2 font-semibold text-pearl">
                        {EVIDENCE_FIELD_LABELS[field] ?? field}
                      </td>
                      <td className="px-3 py-2 font-mono text-steel" title={String(comparison?.enteredValue ?? "")}>
                        {formatEvidenceValue(field, comparison?.enteredValue)}
                      </td>
                      <td className="px-3 py-2 font-mono text-steel" title={String(comparison?.extractedValue ?? "")}>
                        {formatEvidenceValue(field, comparison?.extractedValue)}
                      </td>
                      <td className="px-3 py-2 font-mono" title={String(comparison?.rememberedValue ?? "")}>
                        <span className={comparison?.rememberedValue != null ? "font-bold text-emerald-700" : "text-steel"}>
                          {formatEvidenceValue(field, comparison?.rememberedValue)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {sev ? <SeverityBadge severity={sev} /> : <span className="text-steel">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatEvidenceValue(field: string, value: unknown) {
  if (value == null || value === "") return "—";
  const display = field.includes("bank_account") ? maskAccount(value) : String(value);
  return display.slice(0, 28);
}

// ── Section 5: Verifiable Proof ─────────────────────────────────────────────

function VerifiableProofSection({ shipment }: { shipment: ShipmentRecord }) {
  const {
    passportId, txDigest, walrusManifestBlobId,
    memWalSpaceId, memWalSyncStatus,
  } = shipment;

  const syncBadge = memWalSyncStatus === "synced"
    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
    : memWalSyncStatus === "failed"
      ? "border-red-200 bg-red-50 text-red-600"
      : "border-amber-200 bg-amber-50 text-amber-600";
  const syncLabel = memWalSyncStatus === "synced" ? "Synced"
    : memWalSyncStatus === "failed" ? "Failed"
      : memWalSyncStatus === "pending" ? "Syncing…" : "Pending";

  return (
    <div className="space-y-3">
      {/* MemWal — hero badge */}
      <div className={cn(
        "rounded-xl border p-4",
        memWalSpaceId ? "border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50" : "border-slate-200 bg-slate-50"
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Brain className={cn("mt-0.5 h-7 w-7 shrink-0", memWalSpaceId ? "text-emerald-600" : "text-steel")} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-steel">MemWal Memory</p>
                {memWalSpaceId && (
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", syncBadge)}>
                    {syncLabel}
                  </span>
                )}
              </div>
              {memWalSpaceId ? (
                <>
                  <p className="mt-0.5 font-mono text-xs text-pearl">{truncateId(memWalSpaceId, 10)}</p>
                  <p className="mt-1 text-xs text-steel">Agent memory persisted and verifiable — exporter baseline stored, recalled on next shipment.</p>
                </>
              ) : (
                <p className="mt-1 text-sm font-semibold text-steel">Pending — available after shipment is minted.</p>
              )}
            </div>
          </div>
          {memWalSpaceId && (
            <div className="flex shrink-0 items-center gap-1">
              <CopyButton value={memWalSpaceId} />
              <a href={memwalUrl(memWalSpaceId)} target="_blank" rel="noopener noreferrer"
                className="rounded p-1 text-steel hover:text-sui">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Secondary badges */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {/* Walrus */}
        <div className={cn(
          "rounded-xl border p-3",
          walrusManifestBlobId ? "border-blue-100 bg-blue-50" : "border-slate-200 bg-slate-50"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe2 className={cn("h-4 w-4", walrusManifestBlobId ? "text-sui" : "text-steel")} />
              <p className="text-xs font-bold text-pearl">Walrus Evidence</p>
            </div>
            {walrusManifestBlobId && (
              <div className="flex items-center gap-0.5">
                <CopyButton value={walrusManifestBlobId} />
                <a href={walrusBlobUrl(walrusManifestBlobId)} target="_blank" rel="noopener noreferrer"
                  className="rounded p-1 text-steel hover:text-sui">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
          {walrusManifestBlobId
            ? <p className="mt-1 font-mono text-[10px] text-steel">{truncateId(walrusManifestBlobId, 6)}</p>
            : <p className="mt-1 text-xs text-steel">Pending</p>
          }
          {walrusManifestBlobId && (
            <span className="mt-1 inline-block rounded-full border border-blue-100 bg-white px-1.5 py-0.5 text-[10px] font-bold text-sui">
              Stored
            </span>
          )}
        </div>

        {/* Sui Passport */}
        <div className={cn(
          "rounded-xl border p-3",
          passportId ? "border-blue-100 bg-blue-50" : "border-slate-200 bg-slate-50"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fingerprint className={cn("h-4 w-4", passportId ? "text-sui" : "text-steel")} />
              <p className="text-xs font-bold text-pearl">Sui Passport</p>
            </div>
            {passportId && (
              <div className="flex items-center gap-0.5">
                <CopyButton value={passportId} />
                <a href={suiObjectUrl(passportId)} target="_blank" rel="noopener noreferrer"
                  className="rounded p-1 text-steel hover:text-sui">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
          {passportId
            ? <p className="mt-1 font-mono text-[10px] text-steel">{truncateId(passportId, 6)}</p>
            : <p className="mt-1 text-xs text-steel">Pending</p>
          }
          {passportId && (
            <span className="mt-1 inline-block rounded-full border border-blue-100 bg-white px-1.5 py-0.5 text-[10px] font-bold text-sui">
              Minted
            </span>
          )}
        </div>

        {/* SEAL */}
        <div className={cn(
          "rounded-xl border p-3",
          passportId ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-slate-50"
        )}>
          <div className="flex items-center gap-2">
            <ShieldCheck className={cn("h-4 w-4", passportId ? "text-emerald-600" : "text-steel")} />
            <p className="text-xs font-bold text-pearl">SEAL Privacy</p>
          </div>
          <p className="mt-1 text-xs text-steel">
            {passportId ? "Encryption active — data accessible only to authorised parties." : "Pending"}
          </p>
          {passportId && (
            <span className="mt-1 inline-block rounded-full border border-emerald-100 bg-white px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
              Active
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Missing Document Banner ─────────────────────────────────────────────────

function MissingDocsBanner({ shipment }: { shipment: ShipmentRecord }) {
  const [copied, setCopied] = useState(false);
  const missing = shipment.documents.filter(d => d.required && !d.uploaded);
  if (missing.length === 0) return null;

  const request = [
    `Subject: Document Upload Request — Shipment ${shipment.id}`,
    ``,
    `Dear ${shipment.exporter.company},`,
    ``,
    `We are processing shipment ${shipment.id} and require the following documents:`,
    ...missing.map(d => `  - ${d.name}`),
    ``,
    `Please upload at your earliest convenience.`,
    ``,
    `Best regards,`,
    shipment.importer.company,
  ].join("\n");

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-amber-800">
            Agent Waiting — {missing.length} required document{missing.length !== 1 ? "s" : ""} missing
          </p>
          <ul className="mt-2 space-y-1">
            {missing.map(d => (
              <li key={d.name} className="flex items-center gap-2 text-sm text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {d.name}
              </li>
            ))}
          </ul>
        </div>
        <Button
          variant="secondary"
          className="shrink-0 border-amber-200 text-amber-700 hover:bg-amber-100"
          onClick={() => {
            navigator.clipboard.writeText(request).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Generate Upload Request"}
        </Button>
      </div>
    </div>
  );
}


// ── Internal fetch hook ─────────────────────────────────────────────────────

function useValidation(shipmentId: string, refreshKey = 0) {
  const [data, setData] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function loadOrRunValidation() {
      const getRes = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/validate`);
      if (getRes.ok) {
        return getRes.json() as Promise<ValidationResult>;
      }
      // No cached validation — trigger a fresh run with MemWal profile recall
      const postRes = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/validate`, { method: "POST" });
      if (postRes.ok) {
        return postRes.json() as Promise<ValidationResult>;
      }
      return null;
    }

    loadOrRunValidation()
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shipmentId, refreshKey]);

  return { data, loading };
}

// ── Main export ─────────────────────────────────────────────────────────────

type AgentTab = "document" | "proof";

const AGENT_TABS: Array<{ id: AgentTab; label: string; icon: React.ElementType }> = [
  { id: "document", label: "Document Agent", icon: FileText },
  { id: "proof", label: "Proof Agent", icon: ShieldCheck },
];

function AgentTabContent({
  tab,
  shipment,
  fieldComparisons,
}: {
  tab: AgentTab;
  shipment: ShipmentRecord;
  fieldComparisons: FieldComparison[];
}) {
  switch (tab) {
    case "document":
      return <EvidenceDiffSection fieldComparisons={fieldComparisons} />;
    case "proof":
      return <VerifiableProofSection shipment={shipment} />;
    default:
      return null;
  }
}

function OverviewSection({ shipment }: { shipment: ShipmentRecord }) {
  const items = [
    ["Carrier", shipment.shipment.carrier],
    ["Incoterm", shipment.shipment.incoterm],
    ["Declared value", `${shipment.shipment.currency} ${shipment.shipment.declaredValue}`],
    ["Country of origin", shipment.cargo.countryOfOrigin],
    ["HS code", shipment.cargo.hsCode],
    ["Broker", shipment.broker || "—"],
  ];
  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-pearl">Overview</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-blue-50 p-4">
            <p className="text-sm text-steel">{label}</p>
            <p className="mt-1 font-medium text-pearl">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function agentTabBadge(
  tab: AgentTab,
  fieldComparisons: FieldComparison[],
  shipment: ShipmentRecord,
): React.ReactNode {
  if (tab === "document") {
    const count = fieldComparisons.filter(c => c.extractedValue != null).length;
    if (count > 0) return <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-sui">{count}</span>;
  }
  if (tab === "proof") {
    if (shipment.passportId) return <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Minted</span>;
  }
  return null;
}

export function ShipmentCaseFile({ shipment, refreshKey }: ShipmentCaseFileProps) {
  const { data: validation, loading } = useValidation(shipment.id, refreshKey);
  const [activeTab, setActiveTab] = useState<AgentTab>("document");

  const fieldComparisons: FieldComparison[] = validation?.fieldComparisons ?? [];

  return (
    <div className="space-y-4">
      {/* Missing docs banner */}
      <MissingDocsBanner shipment={shipment} />

      {/* Extraction in progress banner */}
      {shipment.extractionStatus === "extracting" && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-sui" />
          <p className="font-semibold text-steel">AI is reading uploaded documents — please wait.</p>
        </div>
      )}

      {/* Recent Activities */}
      <RecentActivities shipmentId={shipment.id} shipment={shipment} refreshKey={refreshKey} />

      {/* Trade Parties */}
      <TradePartiesSection shipment={shipment} />

      {/* Overview */}
      <OverviewSection shipment={shipment} />

      {/* Agent Hub — tabbed */}
      <div className="rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex items-center gap-1 border-b border-blue-100 px-4 pt-4 pb-0 overflow-x-auto">
          {AGENT_TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const badge = agentTabBadge(id, fieldComparisons, shipment);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-3 text-sm font-bold transition",
                  isActive
                    ? "border-b-2 border-sui bg-blue-50 text-sui"
                    : "text-steel hover:bg-blue-50/50 hover:text-pearl"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          <AgentTabContent
            tab={activeTab}
            shipment={shipment}
            fieldComparisons={fieldComparisons}
          />
        </div>
      </div>

    </div>
  );
}
