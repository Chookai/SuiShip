"use client";

import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import type { RiskFinding, RiskScanResult } from "@/lib/agents/risk-types";
import type { ShipmentRecord } from "@/lib/shipments-store";
import { cn } from "@/lib/utils";

export function RiskAgentPanel({
  shipment,
  refreshKey = 0,
}: {
  shipment: ShipmentRecord;
  refreshKey?: number;
}) {
  const [scan, setScan] = useState<RiskScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const legacyRefreshAttempted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/risk-scan`);
      const payload = await response.json();
      if (response.status === 404) {
        setScan(null);
        return;
      }
      if (!response.ok) throw new Error(payload?.error ?? `Risk scan HTTP ${response.status}`);
      setScan(payload as RiskScanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load risk scan");
    } finally {
      setLoading(false);
    }
  }, [shipment.id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function runScan() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/risk-scan`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok && response.status !== 502) {
        throw new Error(payload?.error ?? `Risk scan HTTP ${response.status}`);
      }
      setScan(payload as RiskScanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run risk scan");
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }

  const counts = useMemo(() => summarizeCounts(scan?.findings ?? []), [scan?.findings]);
  const hasLegacyFindings = Boolean(
    scan?.findings.length && scan.findings.some((finding) => !finding.correlation)
  );

  useEffect(() => {
    if (!hasLegacyFindings || loading || running || legacyRefreshAttempted.current) return;
    legacyRefreshAttempted.current = true;
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLegacyFindings, loading, running]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1F33] text-white">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-xl font-black text-pearl">Risk Agent</h3>
              <p className="mt-1 text-sm font-semibold text-steel">
                {scan
                  ? `Last scan ${new Date(scan.generatedAt).toLocaleString()}`
                  : "No risk scan has been recorded yet."}
              </p>
            </div>
          </div>
        </div>
        <Button onClick={runScan} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh Risk Scan
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {scan?.sourceMessages?.length ? (
        <div className="grid gap-2">
          {scan.sourceMessages.map((message) => (
            <div key={message} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              {message}
            </div>
          ))}
        </div>
      ) : null}

      {hasLegacyFindings ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          This scan predates Sonnet correlation evidence. Refresh the risk scan to re-rank findings and hide weak matches.
        </div>
      ) : null}

      {scan ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Critical" value={counts.critical} tone="critical" />
          <Metric label="Warnings" value={counts.warning} tone="warning" />
          <Metric label="Info" value={counts.info} tone="info" />
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-steel">
          <Loader2 className="h-4 w-4 animate-spin text-sui" />
          Loading risk scan...
        </div>
      ) : scan && scan.findings.length > 0 ? (
        <div className="grid gap-3">
          {scan.findings.map((finding) => (
            <RiskFindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div>
              <p className="font-black text-pearl">No external route risks flagged.</p>
              <p className="mt-1 text-sm font-semibold text-steel">
                The latest scan did not find matching MemWal risk patterns or SerpAPI-backed public signals.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RiskFindingCard({ finding }: { finding: RiskFinding }) {
  const tone = findingTone(finding.severity);
  const affectedFacts = uniqueDisplayValues(finding.affectedShipmentFacts);
  return (
    <div className={cn("rounded-xl border p-4", tone.border, tone.bg)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-black uppercase", tone.badge)}>
              {finding.severity}
            </span>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-black uppercase text-steel">
              {finding.category.replace(/_/g, " ")}
            </span>
            <MemoryStatus finding={finding} />
          </div>
          <h4 className="mt-3 text-lg font-black text-pearl">{finding.title}</h4>
          <p className="mt-2 text-sm font-semibold leading-6 text-steel">{finding.summary}</p>
        </div>
        <ShieldAlert className={cn("h-5 w-5 shrink-0", tone.icon)} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg bg-white/70 p-3">
          <p className="text-xs font-black uppercase text-steel">Affected shipment facts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {affectedFacts.map((fact, index) => (
              <span key={`${fact}-${index}`} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-pearl">
                {fact}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-white/70 p-3">
          <p className="text-xs font-black uppercase text-steel">Recommended actions</p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-pearl">
            {finding.recommendedActions.map((action) => (
              <li key={action}>- {action}</li>
            ))}
          </ul>
        </div>
      </div>

      {finding.correlation ? (
        <div className="mt-4 rounded-lg border border-blue-100 bg-white/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black uppercase text-steel">Sonnet correlation evidence</p>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-sui">
              {Math.round(finding.correlation.confidence * 100)}% confidence
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-pearl">{finding.correlation.reasoning}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <FactorList title="Matched factors" values={finding.correlation.matchedFactors} tone="matched" />
            <FactorList title="Weak or missing factors" values={finding.correlation.missingFactors} tone="missing" />
          </div>
          {finding.correlationModel ? (
            <p className="mt-3 text-[11px] font-bold uppercase text-steel">
              {finding.correlationModel}
              {finding.correlatedAt ? ` / ${new Date(finding.correlatedAt).toLocaleString()}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {finding.sources.map((source, index) => (
          <div key={`${source.kind}-${source.url ?? source.blobId ?? index}`} className="rounded-lg border border-blue-100 bg-white px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-pearl">{source.title}</p>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-sui">
                {source.kind}
              </span>
            </div>
            {source.snippet ? <p className="mt-1 text-xs font-semibold leading-5 text-steel">{source.snippet}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-steel">
              {source.publishedAt ? <span>{source.publishedAt}</span> : null}
              {source.blobId ? <span className="break-all">MemWal {source.blobId}</span> : null}
              {source.url ? (
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sui hover:text-pearl">
                  Open source <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactorList({
  title,
  values,
  tone,
}: {
  title: string;
  values: string[];
  tone: "matched" | "missing";
}) {
  const styles = tone === "matched"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-amber-50 text-amber-700";
  return (
    <div>
      <p className="text-xs font-black uppercase text-steel">{title}</p>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value, index) => (
            <span key={`${value}-${index}`} className={cn("rounded-full px-2 py-1 text-xs font-bold", styles)}>
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold text-steel">None reported</p>
      )}
    </div>
  );
}

function MemoryStatus({ finding }: { finding: RiskFinding }) {
  if (finding.memoryWriteStatus === "not_applicable") return null;
  const label = finding.memoryWriteStatus === "written"
    ? "Written to MemWal"
    : finding.memoryWriteStatus === "failed"
      ? "MemWal write failed"
      : finding.memoryWriteStatus === "deferred_until_delay_confirmed"
        ? "Stored after delay"
        : "MemWal pending";
  const tone = finding.memoryWriteStatus === "written"
    ? "bg-emerald-100 text-emerald-700"
    : finding.memoryWriteStatus === "failed"
      ? "bg-red-100 text-red-600"
      : "bg-amber-100 text-amber-700";
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-black uppercase", tone)}>{label}</span>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "critical" | "warning" | "info" }) {
  const styles = {
    critical: "border-red-100 bg-red-50 text-red-600",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    info: "border-blue-100 bg-blue-50 text-sui",
  };
  return (
    <div className={cn("rounded-xl border p-3", styles[tone])}>
      <p className="text-xs font-black uppercase">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function summarizeCounts(findings: RiskFinding[]) {
  return {
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
  };
}

function uniqueDisplayValues(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findingTone(severity: RiskFinding["severity"]) {
  if (severity === "critical") {
    return {
      bg: "bg-red-50",
      border: "border-red-100",
      badge: "bg-red-100 text-red-600",
      icon: "text-red-500",
    };
  }
  if (severity === "warning") {
    return {
      bg: "bg-amber-50",
      border: "border-amber-100",
      badge: "bg-amber-100 text-amber-700",
      icon: "text-amber-600",
    };
  }
  return {
    bg: "bg-blue-50",
    border: "border-blue-100",
    badge: "bg-blue-100 text-sui",
    icon: "text-sui",
  };
}
