"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  Route,
  Satellite,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { cn } from "@/lib/utils";

type PersistentAgentEvent = {
  id?: string;
  simulationId: string;
  shipmentId: string;
  status: string;
  actualLocationLabel: string;
  latitude: number | null;
  longitude: number | null;
  progressPercent: number;
  rawPayload: unknown;
  observedAt: string;
  receivedAt?: string;
};

type PersistentAgentAlert = {
  id: string;
  simulationId: string;
  shipmentId: string;
  eventId?: string | null;
  status: "active" | "resolved";
  severity: "critical" | "warning" | "info";
  summary: string;
  likelyCause: string;
  recommendedAction: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

type PersistentAgentShipment = {
  simulationId: string;
  shipmentId: string;
  sourceUrl: string;
  displayName?: string | null;
  lastCheckStatus: string | null;
  lastCheckError: string | null;
  lastCheckedAt: string | null;
  latestEvent: PersistentAgentEvent | null;
  latestAlert: PersistentAgentAlert | null;
};

type ShipmentsPayload = {
  shipments: PersistentAgentShipment[];
  error?: string;
};

export default function PersistentAgentPage() {
  const [shipments, setShipments] = useState<PersistentAgentShipment[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/persistent-agent/shipments", { cache: "no-store" });
      const payload = (await response.json()) as ShipmentsPayload;
      if (!response.ok) throw new Error(payload.error ?? `Persistent Agent HTTP ${response.status}`);
      setShipments(payload.shipments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load persistent agent shipments");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function checkLive() {
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/persistent-agent/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as ShipmentsPayload;
      if (!response.ok) throw new Error(payload.error ?? `Check HTTP ${response.status}`);
      setShipments(payload.shipments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check live AIS");
      await load({ quiet: true });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load({ quiet: true }), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeIssues = useMemo(
    () => shipments.filter((shipment) => shipment.latestAlert?.status === "active").length,
    [shipments]
  );

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 lg:px-10">
      <div className="mb-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-pearl">Persistent Agent</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => load()} disabled={loading || checking}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button onClick={checkLive} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Satellite className="h-4 w-4" />}
              Check Live AIS
            </Button>
          </div>
        </div>
        <p className="mt-2 w-full text-xs text-steel sm:text-sm lg:whitespace-nowrap">
          Track live shipment locations, detect paused AIS issues, and wake the issue agent when intervention is needed.
        </p>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <SummaryTile label="Monitored" value={shipments.length} detail="simulation source(s)" />
        <SummaryTile label="Active Issues" value={activeIssues} detail="pause_issue alert(s)" tone={activeIssues > 0 ? "warning" : "ok"} />
        <SummaryTile label="Polling" value="10s" detail="page refresh interval" />
      </div>

      {error ? (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <Panel>
          <div className="flex items-center gap-2 text-sm font-semibold text-steel">
            <Loader2 className="h-4 w-4 animate-spin text-sui" />
            Loading persistent agent tracker...
          </div>
        </Panel>
      ) : shipments.length > 0 ? (
        <div className="grid gap-4">
          {shipments.map((shipment) => {
            const isExpanded = expanded === shipment.simulationId;
            return (
              <ShipmentTracker
                key={shipment.simulationId}
                shipment={shipment}
                expanded={isExpanded}
                onToggle={() => setExpanded(isExpanded ? null : shipment.simulationId)}
              />
            );
          })}
        </div>
      ) : (
        <Panel>
          <div className="flex items-start gap-3">
            <Satellite className="mt-0.5 h-5 w-5 text-sui" />
            <div>
              <p className="font-black text-pearl">No monitored shipments configured.</p>
              <p className="mt-1 text-sm font-semibold text-steel">The default SF-2026-LIVE simulation should appear after migrations run.</p>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function ShipmentTracker({
  shipment,
  expanded,
  onToggle,
}: {
  shipment: PersistentAgentShipment;
  expanded: boolean;
  onToggle: () => void;
}) {
  const event = shipment.latestEvent;
  const alert = shipment.latestAlert;
  const hasIssue = event?.status === "pause_issue" || alert?.status === "active";
  const progress = event?.progressPercent ?? 0;

  return (
    <Panel className={cn("overflow-hidden border", hasIssue ? "border-amber-200 bg-amber-50/60" : "border-white/70")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-black text-pearl">{shipment.displayName || shipment.simulationId}</span>
            <StatusPill status={event?.status ?? "waiting"} />
            {hasIssue ? <IssuePill /> : null}
          </div>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-steel md:grid-cols-3">
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-sui" />
              <span className="truncate">{event?.actualLocationLabel ?? "Waiting for first AIS event"}</span>
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-sui" />
              {formatDate(shipment.lastCheckedAt ?? event?.receivedAt ?? event?.observedAt)}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <Route className="h-4 w-4 shrink-0 text-sui" />
              <span className="truncate">{shipment.shipmentId}</span>
            </span>
          </div>
        </div>
        <ChevronDown className={cn("mt-1 h-5 w-5 shrink-0 text-steel transition", expanded && "rotate-180")} />
      </button>

      <div className="mt-5">
        <ProgressBar progress={progress} issue={hasIssue} />
      </div>

      {expanded ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4">
            <div className="rounded-xl border border-blue-100 bg-white/85 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sui">Actual Location</p>
              <h2 className="mt-2 text-2xl font-black text-pearl">{event?.actualLocationLabel ?? "No AIS event yet"}</h2>
              <div className="mt-3 grid gap-2 text-sm font-semibold text-steel sm:grid-cols-2">
                <p>Latitude: <span className="text-pearl">{event?.latitude ?? "unknown"}</span></p>
                <p>Longitude: <span className="text-pearl">{event?.longitude ?? "unknown"}</span></p>
                <p>Observed: <span className="text-pearl">{formatDate(event?.observedAt)}</span></p>
                <p>Source: <span className="break-all text-pearl">{shipment.sourceUrl}</span></p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-white/85 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sui">Raw Latest AIS Event</p>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-xs leading-5 text-steel">
                {event ? JSON.stringify(event.rawPayload, null, 2) : "No event has been received yet."}
              </pre>
            </div>
          </div>

          <div className="grid gap-4">
            <IssuePanel alert={alert} hasIssue={hasIssue} />
            <div className="rounded-xl border border-blue-100 bg-white/85 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sui">Webhook / Check Health</p>
              <div className="mt-3 grid gap-2 text-sm font-semibold text-steel">
                <p>Status: <span className="text-pearl">{shipment.lastCheckStatus ?? "pending"}</span></p>
                <p>Last checked: <span className="text-pearl">{formatDate(shipment.lastCheckedAt)}</span></p>
                <p>Last error: <span className={cn(shipment.lastCheckError ? "text-red-600" : "text-pearl")}>{shipment.lastCheckError ?? "none"}</span></p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function SummaryTile({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: "neutral" | "ok" | "warning" }) {
  return (
    <Panel className={cn("border", tone === "warning" ? "border-amber-100 bg-amber-50" : tone === "ok" ? "border-emerald-100 bg-emerald-50" : "border-white/70")}>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-steel">{label}</p>
      <p className="mt-2 text-3xl font-black text-pearl">{value}</p>
      <p className="mt-1 text-sm font-semibold text-steel">{detail}</p>
    </Panel>
  );
}

function StatusPill({ status }: { status: string }) {
  const issue = status === "pause_issue";
  return (
    <span className={cn(
      "rounded-full border px-2.5 py-1 text-xs font-black uppercase",
      issue ? "border-amber-200 bg-amber-100 text-amber-800" : "border-emerald-100 bg-emerald-50 text-emerald-700"
    )}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function IssuePill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-black uppercase text-red-600">
      <AlertTriangle className="h-3 w-3" />
      Agent flagged
    </span>
  );
}

function ProgressBar({ progress, issue }: { progress: number; issue: boolean }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs font-black uppercase text-steel">
        <span>Origin</span>
        <span>{progress}% complete</span>
        <span>Destination</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white shadow-inner">
        <div
          className={cn("h-full rounded-full transition-all", issue ? "bg-amber-500" : "bg-[#4DA2FF]")}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
}

function IssuePanel({ alert, hasIssue }: { alert: PersistentAgentAlert | null; hasIssue: boolean }) {
  if (!hasIssue) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <div className="flex items-center gap-2 font-black text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          No active issue
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-steel">
          The persistent agent has not detected a pause_issue for this shipment.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
      <div className="flex items-center gap-2 font-black text-amber-800">
        <AlertTriangle className="h-5 w-5" />
        Issue Agent Analysis
      </div>
      <p className="mt-3 text-sm font-black text-pearl">{alert?.summary ?? "AIS reported pause_issue. Agent analysis is pending."}</p>
      <div className="mt-3 grid gap-3 text-sm font-semibold leading-6 text-steel">
        <p><span className="font-black text-pearl">Likely cause:</span> {alert?.likelyCause ?? "The shipment is paused in the live tracker."}</p>
        <p><span className="font-black text-pearl">Recommended action:</span> {alert?.recommendedAction ?? "Contact carrier operations for revised ETA and pause reason."}</p>
        <p><span className="font-black text-pearl">Model:</span> {alert?.model ?? "pending"}</p>
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "not checked yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
