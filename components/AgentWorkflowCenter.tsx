"use client";

import {
  Archive,
  Brain,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileText,
  Fingerprint,
  GitCompareArrows,
  PackageCheck,
  Route,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Panel } from "@/components/ui";
import type { ShipmentRecord } from "@/lib/shipments-store";
import { cn } from "@/lib/utils";

type ArtifactRef = {
  artifactId: string;
  shipmentId: string;
  type: string;
  label: string;
  status: string;
  walrusBlobId?: string | null;
  walrusUrl?: string | null;
  relatedMemWalNamespace?: string | null;
  relatedSuiTxDigest?: string | null;
  createdAt: string;
};

type AgentStep = {
  id: string;
  agentName: string;
  stepName: string;
  status: string;
  message?: string | null;
  memoryReads: unknown[];
  memoryWrites: unknown[];
  walrusBlobIds: string[];
  suiTxDigests: string[];
  startedAt: string;
  completedAt?: string | null;
};

type AgentRun = {
  id: string;
  status: string;
  currentStep?: string | null;
  riskLevel?: string | null;
  startedAt: string;
  completedAt?: string | null;
  steps: AgentStep[];
};

type CaseFile = {
  caseFileId: string;
  finalDecision: string;
  riskLevel: string;
  customsReadinessScore: number;
  recommendedAction: string;
  memoryProvenance: Array<{
    field: string;
    rememberedValue: string | number | null;
    sourceShipmentId: string | null;
    memwalNamespace: string;
    memwalBlobId?: string | null;
    walrusBlobId?: string | null;
    suiObjectId?: string | null;
    suiTxDigest?: string | null;
    confidence: number;
    explanation: string;
  }>;
  evidenceChain: {
    walrusBlobIds: string[];
    memwalNamespaces: string[];
    suiPassportId?: string | null;
    suiTxDigest?: string | null;
  };
  artifacts: Record<string, unknown>;
};

type Readiness = {
  memwal: { mode: string; connected: boolean; baselineMemorySynced: boolean; syncStatus?: string | null };
  walrus: { mode: string; caseFileStored: boolean; caseFileBlobId?: string | null; manifestBlobId?: string | null };
  sui: { mode: string; passportId?: string | null; txDigest?: string | null };
  seal: { enabled: boolean };
  latestAgentRun?: AgentRun | null;
};

type ExporterProfile = {
  memwalConfigured: boolean;
  namespace: string;
  profile?: {
    shipmentCount: number;
    sourceShipments: string[];
    commonHsCodes: string[];
    commonOrigins: string[];
    paymentOrBankSignals: string[];
    documentFingerprints: string[];
  } | null;
};

export function AgentWorkflowCenter({ shipment, refreshKey = 0 }: { shipment: ShipmentRecord; refreshKey?: number }) {
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);
  const [caseFile, setCaseFile] = useState<CaseFile | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [exporterProfile, setExporterProfile] = useState<ExporterProfile | null>(null);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const exporterKey = shipment.exporter.taxId || shipment.exporter.company;
      const [runs, artifactPayload, casePayload, readinessPayload, profilePayload] = await Promise.all([
        fetchJson<{ runs: AgentRun[] }>(`/api/shipments/${encodeURIComponent(shipment.id)}/agent-runs`),
        fetchJson<{ artifacts: ArtifactRef[] }>(`/api/shipments/${encodeURIComponent(shipment.id)}/artifacts`),
        fetchJson<{ caseFile: CaseFile }>(`/api/shipments/${encodeURIComponent(shipment.id)}/case-file`).catch(() => null),
        fetchJson<Readiness>(`/api/shipments/${encodeURIComponent(shipment.id)}/demo-readiness`),
        fetchJson<ExporterProfile>(`/api/memory/exporter-profile?exporterKey=${encodeURIComponent(exporterKey)}&company=${encodeURIComponent(shipment.exporter.company)}`).catch(() => null),
      ]);
      if (!cancelled) {
        setAgentRuns(runs.runs ?? []);
        setArtifacts(artifactPayload.artifacts ?? []);
        setCaseFile(casePayload?.caseFile ?? null);
        setReadiness(readinessPayload);
        setExporterProfile(profilePayload);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [shipment.exporter.company, shipment.exporter.taxId, shipment.id, refreshKey]);

  const latestRun = agentRuns[agentRuns.length - 1] ?? null;
  const missingDocs = useMemo(
    () => shipment.documents.filter((doc) => doc.required && !doc.uploaded).map((doc) => doc.name),
    [shipment.documents]
  );
  const agentSummaries = summarizeAgents(latestRun?.steps ?? []);
  const caseFileJson = artifacts.find((artifact) => artifact.type === "ai_case_file_json");
  const caseFileMarkdown = artifacts.find((artifact) => artifact.type === "ai_case_file_markdown");

  return (
    <div className="grid gap-5">
      <Panel className={cn("border-blue-200", caseFile?.finalDecision === "blocked_for_review" ? "bg-red-50" : "bg-white")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#4DA2FF]">AI Shipment Case File</p>
            <h2 className="mt-1 text-3xl font-black text-pearl">
              {caseFile ? decisionLabel(caseFile.finalDecision) : loading ? "Agent workflow loading..." : "Case file pending"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-steel">
              {caseFile?.recommendedAction ?? "Run validation to generate a durable AI Shipment Case File and store it on Walrus."}
            </p>
          </div>
          <div className="grid min-w-[220px] gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-black uppercase text-steel">Customs readiness</p>
            <p className="text-4xl font-black text-pearl">{caseFile?.customsReadinessScore ?? "--"}</p>
            <p className="text-xs font-bold uppercase text-steel">Risk {caseFile?.riskLevel ?? "pending"}</p>
          </div>
        </div>
        {caseFileJson ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-bold text-pearl">AI Shipment Case File stored on Walrus.</p>
            <CopyPill value={caseFileJson.walrusBlobId ?? ""} />
            {caseFileJson.walrusUrl ? <ExternalPill href={caseFileJson.walrusUrl} label="Open JSON" /> : null}
            {caseFileMarkdown?.walrusUrl ? <ExternalPill href={caseFileMarkdown.walrusUrl} label="Open Markdown" /> : null}
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.5fr)]">
        <Panel>
          <SectionTitle icon={Route} title="Agent Run State" />
          {missingDocs.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="font-black text-pearl">Agent paused: waiting for {missingDocs[0]}.</p>
              <p className="mt-1 text-sm font-semibold text-steel">{missingDocs.join(", ")}</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => navigator.clipboard?.writeText(buildSupplierRequest(shipment, missingDocs))}
              >
                <ClipboardList className="h-4 w-4" />
                Copy supplier upload request
              </Button>
            </div>
          ) : latestRun ? (
            <div className="mt-4 grid gap-3">
              <RunHeader run={latestRun} />
              {latestRun.steps.slice(-8).map((step) => <StepRow key={step.id} step={step} />)}
            </div>
          ) : (
            <EmptyLine text="No durable agent run has started yet." />
          )}
        </Panel>

        <Panel>
          <SectionTitle icon={Users} title="Agent Team Execution" />
          <div className="mt-4 grid gap-3">
            {agentSummaries.map((item) => {
              const Icon = item.icon;
              return (
              <div key={item.name} className="rounded-2xl border border-blue-100 bg-white p-3">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 text-[#4DA2FF]" />
                  <div>
                    <p className="font-black text-pearl">{item.name}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-steel">{item.message}</p>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionTitle icon={Brain} title="Trade Memory" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-black uppercase text-steel">Exporter intelligence</p>
            <p className="mt-2 text-2xl font-black text-pearl">{exporterProfile?.profile?.shipmentCount ?? 0} recalled shipment(s)</p>
            <p className="mt-2 break-all text-xs font-semibold text-steel">{exporterProfile?.namespace ?? "MemWal namespace pending"}</p>
          </div>
          <div className="grid gap-3">
            {(caseFile?.memoryProvenance ?? []).length > 0 ? (
              caseFile!.memoryProvenance.map((item) => <MemoryProvenanceRow key={`${item.field}-${item.memwalBlobId ?? item.sourceShipmentId}`} item={item} />)
            ) : (
              <EmptyLine text="No prior memory was used for this validation. This shipment can become the baseline after mint and memory sync." />
            )}
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle icon={Archive} title="Walrus Artifact Browser" />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {artifacts.length > 0 ? artifacts.map((artifact) => <ArtifactCard key={artifact.artifactId} artifact={artifact} />) : <EmptyLine text="No artifacts registered yet." />}
        </div>
      </Panel>

      <Panel>
        <SectionTitle icon={Fingerprint} title="Verifiable Proof Chain" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ProofTile label="MemWal" value={readiness?.memwal.mode ?? "pending"} detail={readiness?.memwal.syncStatus ?? "memory status pending"} ok={readiness?.memwal.connected || readiness?.memwal.baselineMemorySynced} />
          <ProofTile label="Walrus" value={readiness?.walrus.caseFileStored ? "case file stored" : readiness?.walrus.mode ?? "pending"} detail={readiness?.walrus.caseFileBlobId ?? readiness?.walrus.manifestBlobId ?? "artifact pending"} ok={Boolean(readiness?.walrus.caseFileStored || readiness?.walrus.manifestBlobId)} />
          <ProofTile label="Sui" value={readiness?.sui.mode ?? "pending"} detail={readiness?.sui.passportId ?? "passport pending"} ok={Boolean(readiness?.sui.passportId)} />
        </div>
      </Panel>

      <Panel>
        <button type="button" onClick={() => setDeveloperOpen((open) => !open)} className="flex w-full items-center justify-between text-left">
          <SectionTitle icon={ChevronDown} title="Developer Details" />
          <ChevronDown className={cn("h-4 w-4 text-steel transition", developerOpen && "rotate-180")} />
        </button>
        {developerOpen ? (
          <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-ink p-4 text-xs text-steel">
            {JSON.stringify({ readiness, latestRun, artifacts, caseFile, exporterProfile }, null, 2)}
          </pre>
        ) : null}
      </Panel>
    </div>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
  return payload as T;
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-[#4DA2FF]" />
      <h2 className="text-xl font-black text-pearl">{title}</h2>
    </div>
  );
}

function RunHeader({ run }: { run: AgentRun }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <p className="text-xs font-black uppercase text-steel">Latest run</p>
      <p className="mt-1 font-black text-pearl">{run.status.replace(/_/g, " ")}</p>
      <p className="mt-1 text-sm font-semibold text-steel">{run.currentStep}</p>
    </div>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase text-[#4DA2FF]">{step.agentName}</p>
          <p className="mt-1 font-black text-pearl">{step.stepName}</p>
          {step.message ? <p className="mt-1 text-xs font-semibold leading-5 text-steel">{step.message}</p> : null}
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black uppercase text-steel">{step.status}</span>
      </div>
      {(step.memoryReads.length > 0 || step.memoryWrites.length > 0 || step.walrusBlobIds.length > 0 || step.suiTxDigests.length > 0) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {step.memoryReads.length > 0 ? <MiniPill label={`${step.memoryReads.length} memory reads`} /> : null}
          {step.memoryWrites.length > 0 ? <MiniPill label={`${step.memoryWrites.length} memory writes`} /> : null}
          {step.walrusBlobIds.length > 0 ? <MiniPill label={`${step.walrusBlobIds.length} Walrus artifacts`} /> : null}
          {step.suiTxDigests.length > 0 ? <MiniPill label={`${step.suiTxDigests.length} Sui tx`} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function MemoryProvenanceRow({ item }: { item: NonNullable<CaseFile["memoryProvenance"]>[number] }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#0B1F33] px-2.5 py-1 text-xs font-black uppercase text-white">{item.field}</span>
        <span className="text-xs font-bold text-steel">confidence {Math.round(item.confidence * 100)}%</span>
      </div>
      <p className="mt-3 text-sm font-black text-pearl">Remembered {String(item.rememberedValue ?? "unknown")}</p>
      <p className="mt-1 text-xs font-semibold text-steel">from {item.sourceShipmentId ?? "unknown source"} via {item.memwalNamespace}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.memwalBlobId ? <MiniPill label={`MemWal ${truncate(item.memwalBlobId)}`} /> : <MiniPill label="MemWal pending" />}
        {item.walrusBlobId ? <MiniPill label={`Walrus ${truncate(item.walrusBlobId)}`} /> : <MiniPill label="Walrus unavailable" />}
        {item.suiObjectId ? <MiniPill label={`Sui ${truncate(item.suiObjectId)}`} /> : <MiniPill label="Sui pending" />}
      </div>
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: ArtifactRef }) {
  return (
    <div className="min-w-0 rounded-2xl border border-blue-100 bg-white p-4">
      <p className="text-xs font-black uppercase text-[#4DA2FF]">{artifact.type.replace(/_/g, " ")}</p>
      <p className="mt-1 truncate font-black text-pearl">{artifact.label}</p>
      <p className="mt-2 text-xs font-bold uppercase text-steel">{artifact.status.replace(/_/g, " ")}</p>
      {artifact.walrusBlobId ? <p className="mt-2 break-all font-mono text-[11px] text-steel">{artifact.walrusBlobId}</p> : null}
      {artifact.walrusUrl ? <ExternalPill href={artifact.walrusUrl} label="Open artifact" /> : null}
    </div>
  );
}

function ProofTile({ label, value, detail, ok }: { label: string; value: string; detail: string; ok?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", ok ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50")}>
      <p className="text-xs font-black uppercase text-steel">{label}</p>
      <p className="mt-1 font-black text-pearl">{value}</p>
      <p className="mt-2 break-all text-xs font-semibold text-steel">{detail}</p>
    </div>
  );
}

function MiniPill({ label }: { label: string }) {
  return <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-black text-steel">{label}</span>;
}

function ExternalPill({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#4DA2FF] px-3 py-1.5 text-xs font-black text-white">
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function CopyPill({ value }: { value: string }) {
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(value)} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#4DA2FF]">
      Copy {truncate(value)}
    </button>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-steel">{text}</div>;
}

function decisionLabel(value: string) {
  if (value === "ready_for_customs") return "Ready for customs";
  if (value === "blocked_for_review") return "Blocked for review";
  return "Needs human review";
}

function truncate(value: string, chars = 6) {
  if (value.length <= chars * 2 + 3) return value;
  return `${value.slice(0, chars)}...${value.slice(-chars)}`;
}

function buildSupplierRequest(shipment: ShipmentRecord, missingDocs: string[]) {
  return [
    `Shipment ${shipment.id} is paused pending required documents.`,
    "",
    `Please upload: ${missingDocs.join(", ")}.`,
    "",
    "The SuiShip compliance agent will resume extraction and validation after receipt.",
  ].join("\n");
}

function summarizeAgents(steps: AgentStep[]) {
  const latestByAgent = (name: string) => [...steps].reverse().find((step) => step.agentName === name);
  return [
    { name: "Document Agent", icon: FileText, message: latestByAgent("Document Agent")?.message ?? "Waiting for uploaded documents to extract invoice, BOL, packing, and origin facts." },
    { name: "Memory Agent", icon: Brain, message: latestByAgent("Memory Agent")?.message ?? "Ready to recall exporter/importer memory from MemWal." },
    { name: "Risk Agent", icon: GitCompareArrows, message: latestByAgent("Risk Agent")?.message ?? "Compares entered, extracted, and remembered facts." },
    { name: "Proof Agent", icon: PackageCheck, message: latestByAgent("Proof Agent")?.message ?? "Stores artifacts on Walrus and links Sui proof." },
    { name: "Orchestrator", icon: ShieldCheck, message: latestByAgent("Orchestrator")?.message ?? "Coordinates the long-running shipment compliance workflow." },
  ];
}
