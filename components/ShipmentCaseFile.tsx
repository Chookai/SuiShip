"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Fingerprint,
  Globe2,
  History,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { ShipmentRecord } from "@/lib/shipments-store";
import { cn } from "@/lib/utils";
import { maskAccount, type FieldComparison, type AgentMemoryTraceStep } from "@/lib/agents/field-comparisons";

// ── Types ──────────────────────────────────────────────────────────────────

type AgentRunState =
  | "created"
  | "waiting_for_documents"
  | "extracting"
  | "validating"
  | "recalling_memory"
  | "risk_detected"
  | "ready_for_customs"
  | "blocked_for_review";

interface ToolEvent {
  name: string;
  input: unknown;
  result: unknown;
}

interface ValidationResult {
  fieldComparisons?: FieldComparison[];
  memoryTrace?: AgentMemoryTraceStep[];
  baselineStatus?: "baseline_established" | "prior_memory_found";
  overallVerdict?: string;
  verdictReason?: string;
  agentToolEvents?: ToolEvent[];
}

export interface SimulatedChanges {
  changeBankAccountNumber: boolean;
  changeRegisteredAddress: boolean;
  reuseInvoiceNumber: boolean;
  reuseBoLNumber: boolean;
  changeCountryOfOrigin: boolean;
}

interface ShipmentCaseFileProps {
  shipment: ShipmentRecord;
  onSimulateFollowup?: (changes: SimulatedChanges) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SUISCAN_BASE = "https://suiscan.xyz/testnet";
const WALRUSCAN_BASE = "https://walruscan.com/testnet";

const AGENT_STATES: Array<{ id: AgentRunState; label: string; icon: React.ElementType }> = [
  { id: "created", label: "Created", icon: FileText },
  { id: "waiting_for_documents", label: "Awaiting Docs", icon: Clock3 },
  { id: "extracting", label: "Extracting", icon: Loader2 },
  { id: "validating", label: "Validating", icon: Search },
  { id: "recalling_memory", label: "Recalling", icon: Brain },
  { id: "risk_detected", label: "Anomaly", icon: AlertTriangle },
  { id: "ready_for_customs", label: "Cleared", icon: CheckCircle2 },
  { id: "blocked_for_review", label: "Blocked", icon: ShieldAlert },
];

const RECOMMENDED_ACTIONS: Record<AgentRunState, string> = {
  created: "Complete shipment setup and invite counterparty.",
  waiting_for_documents: "Upload missing required documents to proceed.",
  extracting: "AI is reading uploaded documents — please wait.",
  validating: "AI validation in progress.",
  recalling_memory: "Agent is recalling MemWal baseline — please wait.",
  risk_detected: "Review critical findings before customs submission.",
  ready_for_customs: "Shipment cleared for customs package generation.",
  blocked_for_review: "Hold for manual review — critical anomalies detected.",
};

const EVIDENCE_DIFF_FIELDS = [
  "exporter.name",
  "exporter.bank_account",
  "exporter.registered_address",
  "cargo.country_of_origin",
  "documents.invoice_number",
  "shipment.bl_number",
];

const TOOL_ICONS: Record<string, string> = {
  recall_party_memory: "🔍",
  recall_document_fingerprints: "🔍",
  flag_anomaly: "⚠️",
  done: "✓",
};

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

function deriveAgentRunState(shipment: ShipmentRecord, validation?: ValidationResult | null): AgentRunState {
  const hasCritical = validation?.fieldComparisons?.some(c => c.severity === "critical") ?? false;
  if (shipment.ai?.riskLevel === "High" || (hasCritical && validation != null)) return "blocked_for_review";
  if (shipment.ai?.riskLevel === "Low" && !hasCritical) return "ready_for_customs";
  if (shipment.ai?.riskLevel === "Medium") return "risk_detected";
  if (shipment.ai && !validation) return "recalling_memory";
  if (shipment.extractionStatus === "complete" && !shipment.ai) return "validating";
  if (shipment.extractionStatus === "extracting") return "extracting";
  if (shipment.status === "In Progress" && shipment.documents.some(d => d.required && !d.uploaded))
    return "waiting_for_documents";
  return "created";
}

function getStateIndex(state: AgentRunState): number {
  // For terminal states, map to their visual position
  if (state === "ready_for_customs") return 6;
  if (state === "blocked_for_review") return 7;
  return AGENT_STATES.findIndex(s => s.id === state);
}

function buildSyntheticTrace(
  fieldComparisons: FieldComparison[],
  baselineStatus: "baseline_established" | "prior_memory_found"
): AgentMemoryTraceStep[] {
  const priorCount = fieldComparisons.filter(c => c.rememberedValue != null).length;
  const criticalCount = fieldComparisons.filter(c => c.severity === "critical").length;
  const warningCount = fieldComparisons.filter(c => c.severity === "warning").length;
  return [
    {
      id: "documents_extracted",
      label: "Facts extracted from documents",
      status: "complete",
      detail: `AI read uploaded shipment PDFs and normalized key fields.`,
    },
    {
      id: "entered_extracted_compared",
      label: "Form vs document comparison",
      status: criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "complete",
      detail: criticalCount + warningCount > 0
        ? `${criticalCount + warningCount} difference(s) found between entered values and extracted documents.`
        : "Entered values match extracted document fields.",
    },
    {
      id: "memwal_recall",
      label: baselineStatus === "prior_memory_found"
        ? "MemWal recalled exporter baseline"
        : "No prior exporter memory found",
      status: "complete",
      detail: baselineStatus === "prior_memory_found"
        ? `${priorCount} structured fact(s) recalled from prior verified shipment.`
        : "Agent will establish baseline after this shipment is minted.",
    },
    {
      id: "memory_comparison",
      label: "Cross-shipment anomaly check",
      status: criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "complete",
      detail: priorCount > 0
        ? `${criticalCount} critical and ${warningCount} warning anomalies detected against remembered baseline.`
        : "No baseline to compare against — first shipment for this exporter.",
    },
    {
      id: "evidence_anchored",
      label: "Evidence links anchored",
      status: "complete",
      detail: "MemWal facts include Walrus blob and Sui passport references from prior verified shipment.",
    },
  ];
}

function formatToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const raw = input as Record<string, unknown>;
  if (name === "recall_party_memory") return `("${raw.namespace_key ?? ""}")`;
  if (name === "recall_document_fingerprints") return `(invoice="${raw.invoice_number ?? ""}", bol="${raw.bol_number ?? ""}")`;
  if (name === "flag_anomaly") return `(type=${raw.anomaly_type}, severity=${raw.severity})`;
  if (name === "done") return "";
  return "";
}

function formatToolResult(name: string, result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const raw = result as Record<string, unknown>;
  if (name === "recall_party_memory") {
    if (!raw.found) return "→ No prior record found — first shipment";
    const count = Array.isArray(raw.records) ? raw.records.length : 0;
    return `→ Found ${count} prior record(s)`;
  }
  if (name === "recall_document_fingerprints") {
    return raw.found ? "→ Duplicate detected!" : "→ No duplicates found";
  }
  if (name === "flag_anomaly") {
    const anomaly = raw.anomaly as Record<string, unknown> | undefined;
    return `→ Recalled: ${anomaly?.recalled_value ?? "?"} · Current: ${anomaly?.current_value ?? "?"}`;
  }
  if (name === "done") {
    const summary = raw.summary as Record<string, unknown> | undefined;
    return `→ ${summary?.anomaly_summary ?? "Complete"}`;
  }
  return "";
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

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  badge,
  accentClass,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  accentClass?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-blue-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4"
      >
        <div className="flex items-center gap-3">
          <Icon className={cn("h-5 w-5", accentClass ?? "text-sui")} />
          <h3 className="text-base font-black text-pearl">{title}</h3>
          {badge}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-steel transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Section 1: Status Strip ─────────────────────────────────────────────────

function AgentStatusStrip({
  state,
  shipment,
  verdictReason,
}: {
  state: AgentRunState;
  shipment: ShipmentRecord;
  verdictReason?: string;
}) {
  const currentIdx = getStateIndex(state);
  const score = shipment.ai?.score;
  const risk = shipment.ai?.riskLevel;
  const scoreColor = score == null ? "text-steel" : score >= 85 ? "text-emerald-600" : score >= 65 ? "text-amber-600" : "text-red-600";
  const action = verdictReason || RECOMMENDED_ACTIONS[state];

  // For display, merge the two terminal states into one row of 8
  const displayStates = AGENT_STATES;

  return (
    <div className="rounded-2xl border border-blue-100 bg-white px-5 py-4 shadow-sm">
      {/* Stepper */}
      <div className="flex max-w-full items-start gap-1 overflow-x-auto pb-1">
        {displayStates.map((s, idx) => {
          const isCurrent = s.id === state;
          const isPast = idx < currentIdx;
          const isTerminal = s.id === "ready_for_customs" || s.id === "blocked_for_review";
          const isActiveTerminal = isCurrent && isTerminal;
          const Icon = s.icon;

          const dotClass = isCurrent
            ? state === "blocked_for_review"
              ? "bg-red-500 text-white animate-pulse"
              : state === "ready_for_customs"
                ? "bg-emerald-500 text-white animate-pulse"
                : "bg-[#4DA2FF] text-white animate-pulse"
            : isPast
              ? "bg-emerald-500 text-white"
              : "bg-slate-200 text-slate-400";

          return (
            <div key={s.id} className="flex min-w-[58px] flex-none flex-col items-center gap-1 sm:min-w-[72px] sm:flex-1">
              <div className="flex items-center w-full">
                {idx > 0 && (
                  <div className={cn("h-0.5 flex-1", isPast || isCurrent ? "bg-emerald-300" : "bg-slate-200")} />
                )}
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs", dotClass)}>
                  <Icon className={cn("h-3.5 w-3.5", isCurrent && (s.id === "extracting") && "animate-spin")} />
                </div>
                {idx < displayStates.length - 1 && (
                  <div className={cn("h-0.5 flex-1", isPast ? "bg-emerald-300" : "bg-slate-200")} />
                )}
              </div>
              <span className={cn(
                "text-center text-[10px] font-semibold leading-tight",
                isCurrent ? "text-pearl" : "text-steel"
              )}>{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Summary chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {risk && (
          <span className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-bold",
            risk === "Low" ? "border-emerald-100 bg-emerald-50 text-emerald-600"
              : risk === "Medium" ? "border-amber-100 bg-amber-50 text-amber-600"
                : "border-red-100 bg-red-50 text-red-500"
          )}>
            {risk} risk
          </span>
        )}
        {score != null && (
          <span className={cn("rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold", scoreColor)}>
            Score: {score}/100
          </span>
        )}
        <span className="text-xs text-steel">{action}</span>
      </div>
    </div>
  );
}

// ── Section 2: Trade Memory (HERO) ─────────────────────────────────────────

function TradeMemorySection({
  shipment,
  fieldComparisons,
  baselineStatus,
  memoryTrace,
  syncStatus,
}: {
  shipment: ShipmentRecord;
  fieldComparisons: FieldComparison[];
  baselineStatus: "baseline_established" | "prior_memory_found";
  memoryTrace: AgentMemoryTraceStep[];
  syncStatus?: string;
}) {
  const [devOpen, setDevOpen] = useState(false);
  const priorFields = fieldComparisons.filter(c =>
    c.rememberedValue != null &&
    ["exporter.name", "exporter.bank_beneficiary_name", "exporter.bank_account", "exporter.registered_address", "cargo.country_of_origin", "documents.invoice_number", "shipment.bl_number"].includes(c.field)
  );
  const firstEvidence = priorFields.find(c => c.evidence && c.evidence.length > 0)?.evidence;
  const walrusRef = firstEvidence?.find(e => e.kind === "walrus")?.value;
  const suiRef = firstEvidence?.find(e => e.kind === "sui_object" || e.kind === "sui_tx")?.value;

  const badge = baselineStatus === "prior_memory_found"
    ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">Memory Recalled</span>
    : <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-bold text-steel">Establishing Baseline</span>;

  return (
    <CollapsibleSection
      title="Trade Memory"
      icon={Brain}
      defaultOpen={true}
      badge={badge}
      accentClass="text-emerald-600"
    >
      {/* Baseline Banner */}
      {baselineStatus === "prior_memory_found" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <History className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Memory Recalled</p>
              <p className="mt-0.5 text-base font-bold text-pearl">
                {shipment.exporter.company} — Agent compared {priorFields.length} field{priorFields.length !== 1 ? "s" : ""} against remembered baseline.
              </p>
              {(walrusRef || suiRef) && (
                <p className="mt-1 text-xs text-steel">
                  Baseline from: {walrusRef && `Walrus ${truncateId(walrusRef, 6)}`}
                  {walrusRef && suiRef && " · "}
                  {suiRef && `Sui ${truncateId(suiRef, 6)}`}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-sui" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-sui">Establishing Baseline</p>
              <p className="mt-0.5 text-base font-bold text-pearl">
                No prior exporter memory found for {shipment.exporter.company}.
              </p>
              <p className="mt-1 text-sm text-steel">
                This shipment will establish the trusted identity baseline. After mint, the agent will remember exporter legal identity, bank details, registered address, country of origin, and document fingerprints.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MemWal sync gate */}
      {syncStatus === "pending" && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            <p className="text-sm font-semibold text-amber-700">
              Agent memory sync in progress — follow-up shipment will be enabled once memory is persisted to MemWal.
            </p>
          </div>
        </div>
      )}

      {/* Accumulated memory table */}
      {baselineStatus === "prior_memory_found" && priorFields.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-steel">
            Agent Remembers ({priorFields.length} field{priorFields.length !== 1 ? "s" : ""} from prior verified shipment)
          </p>
          <div className="overflow-hidden rounded-xl border border-blue-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-100 bg-blue-50">
                  <th className="px-4 py-2 text-left text-xs font-bold text-steel">Field</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-steel">Remembered Baseline</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-steel">Current</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-steel">Status</th>
                </tr>
              </thead>
              <tbody>
                {priorFields.map((c, i) => {
                  const match = String(c.rememberedValue ?? "").toLowerCase() === String(c.enteredValue ?? "").toLowerCase();
                  const currentVal = c.finalValue ?? c.enteredValue ?? c.extractedValue;
                  return (
                    <tr key={i} className={cn(
                      "border-b border-blue-50 last:border-0",
                      c.severity === "critical" && "bg-red-50",
                      c.severity === "warning" && "bg-amber-50/50",
                    )}>
                      <td className="px-4 py-2 font-semibold text-pearl">{c.label}</td>
                      <td className="px-4 py-2 font-mono text-xs text-steel">{String(c.rememberedValue ?? "—")}</td>
                      <td className="px-4 py-2 font-mono text-xs text-pearl">{String(currentVal ?? "—")}</td>
                      <td className="px-4 py-2">
                        {match
                          ? <span className="text-xs font-bold text-emerald-600">✓ confirmed</span>
                          : <span className={cn(
                              "text-xs font-bold",
                              c.severity === "critical" ? "text-red-600" : "text-amber-700"
                            )}>⚠ changed</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Memory Timeline */}
      {memoryTrace.length > 0 && (
        <div className="mt-4">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-steel">Agent Validation Steps</p>
          <div className="relative space-y-3 pl-6">
            <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-blue-100" />
            {memoryTrace.map((step, i) => {
              const dotColor =
                step.status === "critical" ? "bg-red-500" :
                step.status === "warning" ? "bg-amber-400" : "bg-emerald-500";
              const isMemWalStep = step.id === "memwal_recall";
              return (
                <div key={step.id} className="relative">
                  <div className={cn(
                    "absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-white",
                    dotColor,
                    isMemWalStep && "ring-2 ring-sui/40"
                  )} />
                  <div className={cn(
                    "rounded-lg p-2.5",
                    isMemWalStep && "border border-blue-100 bg-blue-50"
                  )}>
                    <p className={cn(
                      "text-sm font-bold",
                      isMemWalStep ? "text-sui" : "text-pearl"
                    )}>
                      {isMemWalStep && "🧠 "}{step.label}
                    </p>
                    <p className="text-xs text-steel">{step.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Developer Details */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setDevOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold text-steel hover:text-pearl"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", devOpen && "rotate-180")} />
          Developer details
        </button>
        <AnimatePresence initial={false}>
          {devOpen && (
            <motion.div
              key="dev"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-steel">
                {JSON.stringify({ baselineStatus, memoryTrace, fieldComparisons }, null, 2)}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CollapsibleSection>
  );
}

// ── Section 3: Agent Reasoning ──────────────────────────────────────────────

function AgentReasoningSection({
  fieldComparisons,
  toolEvents,
}: {
  fieldComparisons: FieldComparison[];
  toolEvents: ToolEvent[];
}) {
  const findings = fieldComparisons.filter(c => c.severity === "critical" || c.severity === "warning");
  const criticalCount = fieldComparisons.filter(c => c.severity === "critical").length;

  const badge = criticalCount > 0
    ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">{criticalCount} critical</span>
    : null;

  return (
    <CollapsibleSection
      title="Agent Reasoning"
      icon={Zap}
      defaultOpen={findings.length > 0}
      badge={badge}
      accentClass={criticalCount > 0 ? "text-red-500" : "text-amber-500"}
    >
      {/* Tool-call trace */}
      {toolEvents.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-sui">Agent Tool-Call Trace</p>
          <div className="space-y-1.5">
            {toolEvents.map((event, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.12 }}
                className="flex items-start gap-2 font-mono text-xs"
              >
                <span className="shrink-0 text-base leading-tight">
                  {TOOL_ICONS[event.name] ?? "○"}
                </span>
                <div>
                  <span className="font-bold text-pearl">{event.name}</span>
                  <span className="text-steel">{formatToolInput(event.name, event.input)}</span>
                  {formatToolResult(event.name, event.result) && (
                    <div className={cn(
                      "ml-4 text-xs",
                      event.name === "flag_anomaly" ? "text-red-600 font-bold" : "text-emerald-600"
                    )}>
                      {formatToolResult(event.name, event.result)}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Findings cards */}
      {findings.length === 0 ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500" />
          <p className="mt-2 font-semibold text-emerald-700">No critical or warning findings — shipment data is consistent.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {findings.map((c, i) => {
            const isPayment = c.field.includes("bank");
            const cardBorder = c.severity === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
            return (
              <div key={i} className={cn("rounded-xl border p-4", cardBorder)}>
                {/* Payment anomaly callout */}
                {isPayment && c.severity === "critical" && (
                  <div className="mb-3 rounded-lg border border-red-300 bg-red-100 px-3 py-2">
                    <p className="text-xs font-black text-red-700">
                      Payment diversion risk — bank beneficiary details changed from remembered exporter identity.
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={c.severity} />
                  <span className="font-bold text-pearl">{c.label}</span>
                </div>
                <p className="mt-2 text-sm text-steel">{c.explanation}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.enteredValue != null && (
                    <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-xs font-mono">
                      Entered: {formatEvidenceValue(c.field, c.enteredValue)}
                    </span>
                  )}
                  {c.extractedValue != null && (
                    <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-xs font-mono">
                      Extracted: {formatEvidenceValue(c.field, c.extractedValue)}
                    </span>
                  )}
                  {c.rememberedValue != null && (
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-mono font-bold text-emerald-700">
                      Remembered: {formatEvidenceValue(c.field, c.rememberedValue)}
                    </span>
                  )}
                </div>
                {c.recommendedAction && (
                  <p className="mt-2 text-xs font-semibold text-steel">→ {c.recommendedAction}</p>
                )}
                {c.evidence && c.evidence.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.evidence.map((ev, j) => (
                      <a
                        key={j}
                        href={ev.kind === "walrus" ? walrusBlobUrl(ev.value) : ev.kind === "sui_object" ? suiObjectUrl(ev.value) : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-white px-2 py-0.5 text-xs text-sui hover:bg-blue-50"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        {ev.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

// ── Section 4: Evidence Diff ────────────────────────────────────────────────

function EvidenceDiffSection({ fieldComparisons }: { fieldComparisons: FieldComparison[] }) {
  const comparisonMap = new Map<string, FieldComparison>();
  for (const c of fieldComparisons) {
    comparisonMap.set(c.field, c);
  }

  const rows = EVIDENCE_DIFF_FIELDS.map(field => ({
    field,
    label: evidenceFieldLabel(field),
    comparison: comparisonMap.get(field) ?? null,
  }));

  const hasData = fieldComparisons.length > 0;

  return (
    <CollapsibleSection title="Evidence Diff" icon={FileText} defaultOpen={false} accentClass="text-steel">
      {!hasData ? (
        <p className="text-sm text-steel">Validation not yet run — extract documents first.</p>
      ) : (
        <div className="overflow-x-auto">
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
              {rows.map(({ field, label, comparison }) => {
                const sev = comparison?.severity;
                const rowClass = sev === "critical"
                  ? "border-l-4 border-l-red-400 bg-red-50"
                  : sev === "warning"
                    ? "border-l-4 border-l-amber-400 bg-amber-50/50"
                    : "border-l-4 border-l-transparent";
                return (
                  <tr key={field} className={cn("border-b border-blue-50 last:border-0", rowClass)}>
                    <td className="px-3 py-2 font-semibold text-pearl">{label}</td>
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
      )}
    </CollapsibleSection>
  );
}

function evidenceFieldLabel(field: string) {
  const labels: Record<string, string> = {
    "exporter.name": "Exporter legal name",
    "exporter.bank_account": "Exporter bank account",
    "exporter.registered_address": "Exporter registered address",
    "cargo.country_of_origin": "Country of origin",
    "documents.invoice_number": "Invoice number",
    "shipment.bl_number": "BOL number",
  };
  return labels[field] ?? field.split(".").pop()?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) ?? field;
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
    <CollapsibleSection title="Verifiable Proof" icon={ShieldCheck} defaultOpen={true} accentClass="text-emerald-600">
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
    </CollapsibleSection>
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

// ── Simulate Follow-up Panel ────────────────────────────────────────────────

function SimulateFollowupPanel({
  shipment,
  fieldComparisons,
  onSimulate,
}: {
  shipment: ShipmentRecord;
  fieldComparisons: FieldComparison[];
  onSimulate: (changes: SimulatedChanges) => void;
}) {
  const [changes, setChanges] = useState<SimulatedChanges>({
    changeBankAccountNumber: false,
    changeRegisteredAddress: false,
    reuseInvoiceNumber: false,
    reuseBoLNumber: false,
    changeCountryOfOrigin: false,
  });

  const compByField = new Map(fieldComparisons.map(c => [c.field, c]));
  const priorShipmentCount = Math.max(1, fieldComparisons.filter((item) => item.rememberedValue != null).length ? 2 : 1);
  const identityValue = (field: string, fallback?: string | number | null) => {
    const comparison = compByField.get(field);
    return comparison?.rememberedValue ?? comparison?.finalValue ?? comparison?.extractedValue ?? comparison?.enteredValue ?? fallback ?? null;
  };
  const legalName = identityValue("exporter.name", shipment.exporter.company);
  const beneficiary = identityValue("exporter.bank_beneficiary_name", shipment.exporter.bankBeneficiaryName ?? shipment.exporter.company);
  const bankAccount = identityValue("exporter.bank_account", shipment.exporter.bankAccountNumber ?? shipment.exporter.bankIban ?? shipment.exporter.bankSwift);
  const address = identityValue("exporter.registered_address", shipment.exporter.registeredAddress);
  const origin = identityValue("cargo.country_of_origin", shipment.cargo.countryOfOrigin || shipment.shipment.origin);
  const invoiceNumber = identityValue("documents.invoice_number", shipment.extractedRef);
  const bolNumber = identityValue("shipment.bl_number", shipment.shipment.bookingRef);

  const options: Array<{
    key: keyof SimulatedChanges;
    label: string;
    description: string;
    remembered?: string | number | null;
  }> = [
    {
      key: "changeBankAccountNumber",
      label: "Change bank account number",
      description: "Payment diversion fraud: the #1 mechanism in trade finance fraud globally. The exporter's payment beneficiary account changes, a common indicator of account takeover or invoice manipulation.",
      remembered: bankAccount ? maskAccount(bankAccount) : null,
    },
    {
      key: "changeRegisteredAddress",
      label: "Change registered address",
      description: "Identity fraud: same exporter name, different registered address. Common in impersonation and shell company fraud.",
      remembered: address,
    },
    {
      key: "reuseInvoiceNumber",
      label: "Reuse invoice number",
      description: "Double-financing fraud: the same invoice presented to multiple banks or buyers to obtain financing twice.",
      remembered: invoiceNumber,
    },
    {
      key: "reuseBoLNumber",
      label: "Reuse bill of lading number",
      description: "Cargo fraud: the same BOL presented multiple times. A BOL that appears twice means the cargo either doesn't exist or has already been claimed.",
      remembered: bolNumber,
    },
    {
      key: "changeCountryOfOrigin",
      label: "Change country of origin",
      description: "Origin fraud / tariff evasion: goods laundered through a different origin country to avoid duties or sanctions.",
      remembered: origin,
    },
  ];

  const anySelected = Object.values(changes).some(Boolean);

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-blue-50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">Demo: Trigger Cross-Shipment Memory Recall</p>
          <h2 className="mt-1 text-base font-black text-pearl">Prepare Follow-up Shipment</h2>
          <p className="mt-1 max-w-2xl text-sm text-steel">
            The agent doesn{"'"}t care what you{"'"}re shipping or what it{"'"}s worth — those change legitimately every shipment. It remembers WHO this exporter IS: their bank, their address, their document identity. Choose a change that would be suspicious regardless of what{"'"}s being shipped:
          </p>
        </div>
        <Brain className="h-6 w-6 shrink-0 text-amber-600" />
      </div>

      <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-4">
        <p className="text-sm font-semibold leading-6 text-steel">
          The validation agent has memorized this exporter{"'"}s IDENTITY profile from {priorShipmentCount} prior shipment(s) — not the cargo, which changes every shipment, but WHO this exporter is: their bank details, registered address, and document numbers. Any deviation in these identity fields is a potential fraud signal.
        </p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
          <IdentityPill label="Legal name" value={legalName} />
          <IdentityPill label="Beneficiary" value={beneficiary} />
          <IdentityPill label="Bank account" value={bankAccount ? maskAccount(bankAccount) : null} />
          <IdentityPill label="Registered address" value={address} />
          <IdentityPill label="Country of origin" value={origin} />
          <IdentityPill label="Document fingerprints" value={`Invoice ${invoiceNumber ?? "unknown"} / BOL ${bolNumber ?? "unknown"}`} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {options.map(({ key, label, description, remembered }) => (
          <label
            key={key}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
              changes[key]
                ? "border-amber-300 bg-amber-100"
                : "border-blue-100 bg-white hover:border-blue-200"
            )}
          >
            <input
              type="checkbox"
              checked={changes[key]}
              onChange={e => setChanges(prev => ({ ...prev, [key]: e.target.checked }))}
              className="mt-0.5 accent-amber-500"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-pearl">{label}</p>
              <p className="text-xs text-steel">{description}</p>
              {remembered != null && String(remembered) !== "—" && (
                <p className="mt-1 text-xs text-emerald-700">
                  Agent remembers: <span className="font-mono font-bold">{String(remembered).slice(0, 24)}</span>
                </p>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-4">
        <Button
          onClick={() => onSimulate(changes)}
          disabled={!anySelected}
          className="shrink-0"
        >
          <Brain className="h-4 w-4" />
          Prepare Follow-up Shipment
        </Button>
        <p className="text-xs text-steel leading-relaxed">
          Shipment 1 from {shipment.exporter.company} establishes baseline identity. Shipment 2 can have completely different cargo, value, HS code, destination, or route; the agent only flags identity and document-integrity deviations.
        </p>
      </div>
    </div>
  );
}

function IdentityPill({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
      <p className="font-black uppercase text-steel">{label}</p>
      <p className="mt-1 truncate font-mono font-bold text-pearl" title={String(value ?? "Not captured")}>
        {String(value ?? "Not captured")}
      </p>
    </div>
  );
}

// ── Internal fetch hook ─────────────────────────────────────────────────────

function useValidation(shipmentId: string) {
  const [data, setData] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/validate`)
      .then(r => r.ok ? r.json() as Promise<ValidationResult> : null)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shipmentId]);

  return { data, loading };
}

// ── Main export ─────────────────────────────────────────────────────────────

export function ShipmentCaseFile({ shipment, onSimulateFollowup }: ShipmentCaseFileProps) {
  const { data: validation, loading } = useValidation(shipment.id);

  const fieldComparisons: FieldComparison[] = validation?.fieldComparisons ?? [];
  const toolEvents: ToolEvent[] = validation?.agentToolEvents ?? [];

  const baselineStatus: "baseline_established" | "prior_memory_found" =
    validation?.baselineStatus ??
    (fieldComparisons.some(c => c.rememberedValue != null) ? "prior_memory_found" : "baseline_established");

  const memoryTrace: AgentMemoryTraceStep[] =
    validation?.memoryTrace && validation.memoryTrace.length > 0
      ? validation.memoryTrace
      : fieldComparisons.length > 0
        ? buildSyntheticTrace(fieldComparisons, baselineStatus)
        : [];

  const agentState = deriveAgentRunState(shipment, validation);

  const showSimulate =
    shipment.memWalSyncStatus === "synced" ||
    (baselineStatus === "prior_memory_found" && !loading);

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

      {/* Section 1: Status Strip */}
      <AgentStatusStrip
        state={agentState}
        shipment={shipment}
        verdictReason={validation?.verdictReason ?? undefined}
      />

      {/* Section 2: Trade Memory (HERO) */}
      <TradeMemorySection
        shipment={shipment}
        fieldComparisons={fieldComparisons}
        baselineStatus={baselineStatus}
        memoryTrace={memoryTrace}
        syncStatus={shipment.memWalSyncStatus}
      />

      {/* Section 3: Agent Reasoning */}
      <AgentReasoningSection fieldComparisons={fieldComparisons} toolEvents={toolEvents} />

      {/* Section 4: Evidence Diff */}
      <EvidenceDiffSection fieldComparisons={fieldComparisons} />

      {/* Section 5: Verifiable Proof */}
      <VerifiableProofSection shipment={shipment} />

      {/* Simulate follow-up (below sections, gated on sync) */}
      {showSimulate && onSimulateFollowup && (
        <SimulateFollowupPanel
          shipment={shipment}
          fieldComparisons={fieldComparisons}
          onSimulate={onSimulateFollowup}
        />
      )}
    </div>
  );
}
