"use client";

import {
  AlertTriangle,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Package,
  Phone,
  ShieldAlert,
  Ship,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiskAgentPanel } from "@/components/RiskAgentPanel";
import type { RiskScanResult } from "@/lib/agents/risk-types";
import { summarizeShipmentEtaRisk } from "@/lib/risk-eta-impact";
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
  kind: "created" | "validation" | "cleared" | "endorsement" | "passport_minted";
  docCount: number;
  uploadedCount: number;
  verdict?: string;
  reason?: string;
  issues?: IssueSummary[];
  clearedDocuments?: string[];
  timestamp: string;
  role?: string;
  action?: string;
  signerAddress?: string;
  txDigest?: string;
  summary?: string;
};

const SUISCAN_BASE = "https://suiscan.xyz/testnet";

function truncAddr(addr: string) {
  if (!addr || addr.length < 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

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
    const label = entry.summary ?? "Shipment created";
    return (
      <div className="w-full rounded-lg border border-blue-100 bg-blue-50/40 px-4 py-3 text-left">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-pearl">
            <span className="text-2xl font-bold text-sui">#{num}</span> {label}
          </p>
          <span className="shrink-0 text-xs text-steel/60 whitespace-nowrap">
            {new Date(entry.timestamp).toLocaleString()}
          </span>
        </div>
      </div>
    );
  }

  if (entry.kind === "endorsement" || entry.kind === "passport_minted") {
    const summary =
      entry.summary ??
      (entry.kind === "passport_minted" ? "Passport created on-chain" : "Custody step recorded on-chain");
    return (
      <div className="w-full rounded-lg border border-blue-100 bg-blue-50/40 px-4 py-3 text-left">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-pearl">
            <span className="text-2xl font-bold text-sui">#{num}</span> {summary}
          </p>
          <span className="shrink-0 text-xs text-steel/60 whitespace-nowrap">
            {new Date(entry.timestamp).toLocaleString()}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-steel">
          {entry.txDigest && (
            <a
              href={`${SUISCAN_BASE}/tx/${entry.txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-mono text-sui hover:underline"
            >
              tx: {truncAddr(entry.txDigest)}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    );
  }

  if (entry.kind === "cleared") {
    const label = entry.summary ?? "Documents cleared";
    const hasDetail = (entry.clearedDocuments?.length ?? 0) > 0;
    return (
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className={cn(
          "w-full rounded-lg border border-amber-100 bg-amber-50/40 px-4 py-3 text-left",
          hasDetail && "transition hover:bg-amber-50"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-pearl">
            <span className="text-2xl font-bold text-sui">#{num}</span> {label}
          </p>
          <span className="shrink-0 text-xs text-steel/60 whitespace-nowrap">
            {new Date(entry.timestamp).toLocaleString()}
          </span>
        </div>
        {open && entry.clearedDocuments && entry.clearedDocuments.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-sm text-steel">
            {entry.clearedDocuments.map((doc) => (
              <li key={doc}>{doc}</li>
            ))}
          </ul>
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
          {entry.uploadedCount} document{entry.uploadedCount !== 1 ? "s" : ""} uploaded and AI validation:{" "}
          <span className={matched ? "text-emerald-600" : "text-red-600"}>
            {matched ? "PASSED" : "FAILED"}
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
                  const rowBg =
                    sev === "critical"
                      ? "bg-red-50"
                      : sev === "warning"
                        ? "bg-amber-50/50"
                        : "";
                  const leadingBar =
                    sev === "critical"
                      ? "border-l-4 border-l-red-400"
                      : sev === "warning"
                        ? "border-l-4 border-l-amber-400"
                        : "border-l-4 border-l-transparent";
                  const cellPad = "px-3 py-2";
                  return (
                    <tr key={field} className={cn("border-b border-blue-50 last:border-0", rowBg)}>
                      <td className={cn(cellPad, leadingBar, "font-semibold text-pearl")}>
                        {EVIDENCE_FIELD_LABELS[field] ?? field}
                      </td>
                      <td className={cn(cellPad, "font-mono text-steel")} title={String(comparison?.enteredValue ?? "")}>
                        {formatEvidenceValue(field, comparison?.enteredValue)}
                      </td>
                      <td className={cn(cellPad, "font-mono text-steel")} title={String(comparison?.extractedValue ?? "")}>
                        {formatEvidenceValue(field, comparison?.extractedValue)}
                      </td>
                      <td className={cn(cellPad, "font-mono")} title={String(comparison?.rememberedValue ?? "")}>
                        <span className={comparison?.rememberedValue != null ? "font-bold text-emerald-700" : "text-steel"}>
                          {formatEvidenceValue(field, comparison?.rememberedValue)}
                        </span>
                      </td>
                      <td className={cellPad}>
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

const validationInflight = new Map<string, Promise<ValidationResult | null>>();

function useValidation(
  shipmentId: string,
  refreshKey = 0,
  onComplete?: () => void,
) {
  const [data, setData] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function loadOrRunValidation() {
      const inflight = validationInflight.get(shipmentId);
      if (inflight) return inflight;

      const promise = (async () => {
        const getRes = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/validate`);
        if (getRes.ok) {
          return getRes.json() as Promise<ValidationResult>;
        }
        const postRes = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/validate`, { method: "POST" });
        if (postRes.ok) {
          return postRes.json() as Promise<ValidationResult>;
        }
        return null;
      })();

      validationInflight.set(shipmentId, promise);
      try {
        return await promise;
      } finally {
        if (validationInflight.get(shipmentId) === promise) {
          validationInflight.delete(shipmentId);
        }
      }
    }

    loadOrRunValidation()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
        onCompleteRef.current?.();
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [shipmentId, refreshKey]);

  return { data, loading };
}

// ── Main export ─────────────────────────────────────────────────────────────

function formatOverviewDate(iso: string | undefined) {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatRouteDuration(etdIso: string | undefined, etaIso: string | undefined): string | null {
  if (!etdIso?.trim() || !etaIso?.trim()) return null;
  const start = new Date(etdIso);
  const end = new Date(etaIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  if (days === 0) return "Same day";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function overviewValue(value: string | undefined | null, fallback = "—") {
  const v = value?.trim();
  return v && v.length > 0 ? v : fallback;
}

function OverviewField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-blue-50/80 p-3", className)}>
      <p className="text-xs font-bold uppercase tracking-wide text-steel">{label}</p>
      <p className="mt-1 text-sm font-semibold text-pearl">{value}</p>
    </div>
  );
}

function OverviewSubheading({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-sui" />
      <h3 className="text-sm font-bold uppercase tracking-widest text-steel">{title}</h3>
    </div>
  );
}

function useRiskScan(shipmentId: string, refreshKey = 0) {
  const [scan, setScan] = useState<RiskScanResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/risk-scan`)
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return res.json() as Promise<RiskScanResult>;
      })
      .then((data) => {
        if (!cancelled) setScan(data);
      })
      .catch(() => {
        if (!cancelled) setScan(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shipmentId, refreshKey]);

  return scan;
}

function OverviewSection({
  shipment,
  riskScan,
}: {
  shipment: ShipmentRecord;
  riskScan: RiskScanResult | null;
}) {
  const s = shipment.shipment;
  const etaRisk = useMemo(
    () => summarizeShipmentEtaRisk(riskScan?.findings ?? [], shipment.shipment.eta),
    [riskScan?.findings, shipment.shipment.eta],
  );
  const c = shipment.cargo;
  const transportLabel =
    s.transportMode?.trim().toLowerCase() === "air" ? "Air Waybill (AWB)" : "Bill of Lading";
  const etd = formatOverviewDate(s.etd);
  const eta = formatOverviewDate(s.eta);
  const routeDuration = formatRouteDuration(s.etd, s.eta);
  const declared =
    s.currency && s.declaredValue
      ? `${s.currency} ${s.declaredValue}`
      : overviewValue(s.declaredValue);

  const parties = [
    {
      role: "Exporter",
      party: shipment.exporter,
      region: overviewValue(s.origin),
      port: overviewValue(s.originPort),
    },
    {
      role: "Importer",
      party: shipment.importer,
      region: overviewValue(s.destination),
      port: overviewValue(s.destinationPort),
    },
  ];

  const logisticsFields: Array<{ label: string; value: string }> = [
    { label: "Transport mode", value: overviewValue(s.transportMode) },
    { label: "Carrier", value: overviewValue(s.carrier) },
    { label: "ETD", value: etd ?? "—" },
    { label: "ETA", value: eta ?? "—" },
    { label: transportLabel + " ref", value: overviewValue(s.bookingRef) },
    { label: "B/L type", value: overviewValue(s.blType) },
    { label: "Freight forwarder", value: overviewValue(shipment.freightForwarder) },
    { label: "Customs broker", value: overviewValue(shipment.broker) },
  ];

  const commercialFields: Array<{ label: string; value: string }> = [
    { label: "Incoterm", value: overviewValue(s.incoterm) },
    { label: "Declared value", value: declared },
    { label: "Payment terms", value: overviewValue(s.paymentTerms) },
  ];

  const cargoFields: Array<{ label: string; value: string }> = [
    { label: "Product", value: overviewValue(c.description) },
    { label: "Quantity", value: overviewValue(c.quantity) },
    { label: "HS code", value: overviewValue(c.hsCode) },
    { label: "Country of origin", value: overviewValue(c.countryOfOrigin) },
    { label: "Gross weight", value: overviewValue(c.grossWeight) },
    { label: "Net weight", value: overviewValue(c.netWeight) },
    { label: "Handling units", value: overviewValue(c.handlingUnits) },
    { label: "SKU / part no.", value: overviewValue(c.sku) },
    { label: "Container", value: overviewValue(c.container) },
    { label: "Seal", value: overviewValue(c.seal) },
    { label: "Dangerous goods", value: overviewValue(c.dangerousGoods) },
    { label: "Temperature controlled", value: overviewValue(c.temperatureControlled) },
  ];

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-pearl">Overview</h2>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {parties.map(({ role, party, region, port }) => (
          <div key={role} className="rounded-lg border border-blue-100 bg-white p-4">
            <div>
              <p className="text-sm font-bold text-sui">{role}</p>
              <h3 className="mt-1 text-lg font-extrabold text-pearl">{party.company}</h3>
              <p className="mt-1 text-xs text-steel">
                {region}
                {port !== "—" ? ` · ${port}` : ""}
              </p>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {party.taxId && (
                <p>
                  <span className="font-bold text-steel">Tax ID:</span>{" "}
                  <span className="font-semibold text-pearl">{party.taxId}</span>
                </p>
              )}
              {party.registeredAddress && (
                <p>
                  <span className="font-bold text-steel">Address:</span>{" "}
                  <span className="font-semibold text-pearl">{party.registeredAddress}</span>
                </p>
              )}
              <p>
                <span className="font-bold text-steel">Contact:</span>{" "}
                <span className="font-semibold text-pearl">{party.contact}</span>
              </p>
              <div className="flex items-center gap-3 rounded-xl bg-ink p-3">
                <Mail className="h-4 w-4 shrink-0 text-sui" />
                <span className="truncate font-semibold text-pearl">{party.email}</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-ink p-3">
                <Phone className="h-4 w-4 shrink-0 text-sui" />
                <span className="font-semibold text-pearl">{party.phone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {shipment.notifyParty?.company && (
        <div className="mt-4 rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-4">
          <p className="text-sm font-bold text-sui">Notify party</p>
          <p className="mt-1 font-extrabold text-pearl">{shipment.notifyParty.company}</p>
          <p className="mt-1 text-sm text-steel">
            {shipment.notifyParty.contact}
            {shipment.notifyParty.email ? ` · ${shipment.notifyParty.email}` : ""}
          </p>
        </div>
      )}

      {/* Route summary + logistics */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-white p-4">
          <div className="flex justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-steel">Origin</p>
              <p className="mt-0.5 font-extrabold text-pearl">{overviewValue(s.origin)}</p>
              <p className="text-sm text-steel">{overviewValue(s.originPort)}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-xs font-bold uppercase text-steel">Destination</p>
              <p className="mt-0.5 font-extrabold text-pearl">{overviewValue(s.destination)}</p>
              <p className="text-sm text-steel">{overviewValue(s.destinationPort)}</p>
            </div>
          </div>
          <div className="mt-4">
            <div
              className="h-2 w-full rounded-sm bg-sui [clip-path:polygon(0_30%,calc(100%-14px)_30%,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,calc(100%-14px)_70%,0_70%)]"
              aria-hidden
            />
            {routeDuration && (
              <p className="mt-2 text-center text-xs font-bold text-steel">{routeDuration}</p>
            )}
            {eta && (
              <p className="mt-2 text-center text-xs font-semibold text-steel">
                Planned ETA: <span className="font-bold text-pearl">{eta}</span>
              </p>
            )}
            {etaRisk.atRisk && (etaRisk.delayLabel || etaRisk.revisedEtaLabel) ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2">
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-pearl" />
                  <div>
                    <p className="text-xs font-bold uppercase text-pearl">ETA at risk</p>
                    {etaRisk.delayLabel ? (
                      <p className="mt-1 text-sm font-extrabold text-pearl">{etaRisk.delayLabel}</p>
                    ) : null}
                    {etaRisk.revisedEtaLabel ? (
                      <p className="mt-1 text-sm font-semibold text-pearl">
                        Est. arrival {etaRisk.revisedEtaLabel}
                        {eta ? ` (planned ${eta})` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-white p-4">
          <OverviewSubheading icon={Ship} title="Route & logistics" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {logisticsFields.map(({ label, value }) => (
              <OverviewField key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      </div>

      {/* Commercial */}
      <div className="mt-6">
        <OverviewSubheading icon={FileText} title="Commercial terms" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {commercialFields.map(({ label, value }) => (
            <OverviewField key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      {/* Cargo */}
      <div className="mt-6">
        <OverviewSubheading icon={Package} title="Cargo" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cargoFields
            .filter(({ value }) => value !== "—")
            .map(({ label, value }) => (
              <OverviewField key={label} label={label} value={value} />
            ))}
        </div>
      </div>
    </div>
  );
}

type AgentTab = "document" | "risk";

const AGENT_TABS: Array<{ id: AgentTab; label: string; icon: React.ElementType }> = [
  { id: "document", label: "Extraction, Validation and Memory Agents", icon: FileText },
  { id: "risk", label: "Risk Agent", icon: ShieldAlert },
];

function AgentTabContent({
  tab,
  shipment,
  fieldComparisons,
  validationLoading,
  refreshKey,
}: {
  tab: AgentTab;
  shipment: ShipmentRecord;
  fieldComparisons: FieldComparison[];
  validationLoading?: boolean;
  refreshKey?: number;
}) {
  switch (tab) {
    case "document":
      if (validationLoading) {
        return (
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-sui" />
            <p className="text-sm font-semibold text-steel">
              AI is cross-validating documents against MemWal profiles and shipment data…
            </p>
          </div>
        );
      }
      return <EvidenceDiffSection fieldComparisons={fieldComparisons} />;
    case "risk":
      return <RiskAgentPanel shipment={shipment} refreshKey={refreshKey} />;
    default:
      return null;
  }
}

export function ShipmentCaseFile({ shipment, refreshKey }: ShipmentCaseFileProps) {
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const handleValidationComplete = useCallback(() => {
    setActivityRefreshKey((key) => key + 1);
  }, []);
  const { data: validation, loading } = useValidation(
    shipment.id,
    refreshKey,
    handleValidationComplete,
  );
  const [activeTab, setActiveTab] = useState<AgentTab>("document");
  const fieldComparisons: FieldComparison[] = validation?.fieldComparisons ?? [];
  const activityRefreshNonce = (refreshKey ?? 0) + activityRefreshKey;
  const riskScan = useRiskScan(shipment.id, activityRefreshNonce);

  return (
    <div className="space-y-4">

      {/* Recent Activities */}
      <RecentActivities shipmentId={shipment.id} shipment={shipment} refreshKey={activityRefreshNonce} />

      {/* Overview */}
      <OverviewSection shipment={shipment} riskScan={riskScan} />

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
            shipment={shipment}
            fieldComparisons={fieldComparisons}
            validationLoading={loading}
            refreshKey={refreshKey}
          />
        </div>
      </div>

    </div>
  );
}
