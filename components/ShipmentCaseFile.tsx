"use client";

import {
  AlertTriangle,
  Building2,
  FileText,
  Loader2,
  Mail,
  Phone,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
<<<<<<< HEAD
=======
import { Button } from "@/components/ui";
import { RiskAgentPanel } from "@/components/RiskAgentPanel";
>>>>>>> 4bdaff5 (Add risk memory agent scan flow)
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

// ── Sub-components ─────────────────────────────────────────────────────────

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

type IssueSummary = { severity: string; message: string; field?: string };

type ActivityEntry = {
  kind: "created" | "validation" | "cleared";
  docCount: number;
  uploadedCount: number;
  verdict?: string;
  reason?: string;
  issues?: IssueSummary[];
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

function IssueList({ issues }: { issues: IssueSummary[] }) {
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  return (
    <div className="mt-2 space-y-1">
      {errors.map((issue, i) => (
        <div key={`e-${i}`} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <span className="text-red-700">{issue.field ? <b>{issue.field}:</b> : null} {issue.message}</span>
        </div>
      ))}
      {warnings.map((issue, i) => (
        <div key={`w-${i}`} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <span className="text-amber-700">{issue.field ? <b>{issue.field}:</b> : null} {issue.message}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityCard({
  entry,
  num,
}: {
  entry: ActivityEntry;
  num: number;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(entry.reason) || (entry.issues && entry.issues.length > 0);

  if (entry.kind === "created") {
    const hasValidation = Boolean(entry.verdict);
    const matched = entry.verdict === "consistent" || entry.verdict === "matched" || entry.verdict === "aligned";
    const errorCount = entry.issues?.filter(i => i.severity === "error").length ?? 0;
    const warnCount = entry.issues?.filter(i => i.severity === "warning").length ?? 0;
    return (
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className={cn(
          "w-full rounded-lg border border-blue-100 bg-blue-50/40 px-4 py-3 text-left",
          hasDetail && "transition hover:bg-blue-50"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-pearl">
            <span className="text-2xl font-bold text-sui">#{num}</span>{" "}
            Shipment Created{entry.uploadedCount > 0 ? `, ${entry.uploadedCount} document${entry.uploadedCount !== 1 ? "s" : ""} uploaded` : ""}{entry.docCount > 0 && entry.docCount !== entry.uploadedCount ? `, ${entry.docCount} validated` : ""}
            {hasValidation && (
              <>
                . AI validation:{" "}
                <span className={matched ? "text-emerald-600" : "text-amber-600"}>
                  {matched ? "Passed" : "Failed"}
                </span>
                {!matched && (errorCount > 0 || warnCount > 0) && (
                  <span className="text-sm font-normal text-steel ml-1">
                    ({errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? "s" : ""}` : ""}{errorCount > 0 && warnCount > 0 ? ", " : ""}{warnCount > 0 ? `${warnCount} warning${warnCount !== 1 ? "s" : ""}` : ""})
                  </span>
                )}
              </>
            )}
          </p>
          <span className="shrink-0 text-xs text-steel/60 whitespace-nowrap">
            {new Date(entry.timestamp).toLocaleString()}
          </span>
        </div>
        {open && (
          <>
            {entry.reason && <p className="mt-2 text-sm text-steel">{entry.reason}</p>}
            {entry.issues && entry.issues.length > 0 && <IssueList issues={entry.issues} />}
          </>
        )}
      </button>
    );
  }

  if (entry.kind === "cleared") {
    return (
      <button
        type="button"
        onClick={() => entry.reason && setOpen(!open)}
        className={cn(
          "w-full rounded-lg border border-amber-100 bg-amber-50/40 px-4 py-3 text-left",
          entry.reason && "transition hover:bg-amber-50"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-pearl">
            <span className="text-2xl font-bold text-sui">#{num}</span>{" "}
            Documents cleared
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

  const matched = entry.verdict === "consistent" || entry.verdict === "matched" || entry.verdict === "aligned";
  const errorCount = entry.issues?.filter(i => i.severity === "error").length ?? 0;
  const warnCount = entry.issues?.filter(i => i.severity === "warning").length ?? 0;
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className="w-full rounded-lg border border-blue-100 bg-blue-50/40 px-4 py-3 text-left transition hover:bg-blue-50"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-pearl">
          <span className="text-2xl font-bold text-sui">#{num}</span>{" "}
          {entry.uploadedCount} document{entry.uploadedCount !== 1 ? "s" : ""} uploaded{entry.docCount > entry.uploadedCount ? `, ${entry.docCount} validated` : ""}. AI validation:{" "}
          <span className={matched ? "text-emerald-600" : "text-amber-600"}>
            {matched ? "Passed" : "Failed"}
          </span>
          {!matched && (errorCount > 0 || warnCount > 0) && (
            <span className="text-sm font-normal text-steel ml-1">
              ({errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? "s" : ""}` : ""}{errorCount > 0 && warnCount > 0 ? ", " : ""}{warnCount > 0 ? `${warnCount} warning${warnCount !== 1 ? "s" : ""}` : ""})
            </span>
          )}
        </p>
        <span className="shrink-0 text-xs text-steel/60 whitespace-nowrap">
          {new Date(entry.timestamp).toLocaleString()}
        </span>
      </div>
      {open && (
        <>
          {entry.reason && <p className="mt-2 text-sm text-steel">{entry.reason}</p>}
          {entry.issues && entry.issues.length > 0 && <IssueList issues={entry.issues} />}
        </>
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

<<<<<<< HEAD
=======
type AgentTab = "document" | "proof" | "risk";

const AGENT_TABS: Array<{ id: AgentTab; label: string; icon: React.ElementType }> = [
  { id: "document", label: "Document Agent", icon: FileText },
  { id: "proof", label: "Proof Agent", icon: ShieldCheck },
  { id: "risk", label: "Risk Agent", icon: ShieldAlert },
];

function AgentTabContent({
  tab,
  shipment,
  fieldComparisons,
  refreshKey,
}: {
  tab: AgentTab;
  shipment: ShipmentRecord;
  fieldComparisons: FieldComparison[];
  refreshKey?: number;
}) {
  switch (tab) {
    case "document":
      return <EvidenceDiffSection fieldComparisons={fieldComparisons} />;
    case "proof":
      return <VerifiableProofSection shipment={shipment} />;
    case "risk":
      return <RiskAgentPanel shipment={shipment} refreshKey={refreshKey} />;
    default:
      return null;
  }
}

>>>>>>> 4bdaff5 (Add risk memory agent scan flow)
function OverviewSection({ shipment }: { shipment: ShipmentRecord }) {
  const parties = [
    {
      role: "Exporter",
      ...shipment.exporter,
      country: shipment.shipment.origin,
    },
    {
      role: "Importer",
      ...shipment.importer,
      country: shipment.shipment.destination,
    },
  ];

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

type AgentTab = "document";

const AGENT_TABS: Array<{ id: AgentTab; label: string; icon: React.ElementType }> = [
  { id: "document", label: "Document Agent", icon: FileText },
];

function AgentTabContent({
  tab,
  fieldComparisons,
}: {
  tab: AgentTab;
  fieldComparisons: FieldComparison[];
}) {
  switch (tab) {
    case "document":
      return <EvidenceDiffSection fieldComparisons={fieldComparisons} />;
    default:
      return null;
  }
<<<<<<< HEAD
=======
  if (tab === "proof") {
    if (shipment.passportId) return <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Minted</span>;
  }
  if (tab === "risk") {
    if (shipment.ai) return <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Scan</span>;
  }
  return null;
>>>>>>> 4bdaff5 (Add risk memory agent scan flow)
}

export function ShipmentCaseFile({ shipment, refreshKey }: ShipmentCaseFileProps) {
  const { data: validation, loading } = useValidation(shipment.id, refreshKey);
  const [activeTab, setActiveTab] = useState<AgentTab>("document");
  const fieldComparisons: FieldComparison[] = validation?.fieldComparisons ?? [];

  return (
    <div className="space-y-4">

      {/* Recent Activities */}
      <RecentActivities shipmentId={shipment.id} shipment={shipment} refreshKey={refreshKey} />

      {/* Overview (includes Trade Parties) */}
      <OverviewSection shipment={shipment} />

      {/* Agent Hub — tabbed */}
      <div className="rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex items-center gap-1 border-b border-blue-100 px-4 pt-4 pb-0 overflow-x-auto">
          {AGENT_TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
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
              </button>
            );
          })}
        </div>

        <div className="p-5">
          <AgentTabContent
            tab={activeTab}
            fieldComparisons={fieldComparisons}
            refreshKey={refreshKey}
          />
        </div>
      </div>

    </div>
  );
}
