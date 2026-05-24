import { ArrowRight, Brain, CheckCircle2, Database, FileCheck2, Globe2, LockKeyhole } from "lucide-react";
import { LinkButton, Panel } from "@/components/ui";

const modules = [
  { icon: FileCheck2, title: "AI document intake", body: "Extracts invoice, packing, HS, origin, value, and consignee fields from trade documents using Claude Haiku." },
  { icon: LockKeyhole, title: "Sui passport anchor", body: "Mints a shared shipment object with immutable hashes, storage URIs, risk score, and status on Sui testnet." },
  { icon: Database, title: "Walrus-ready storage", body: "Keeps PDFs off-chain while anchoring verifiable document references on Sui." },
  { icon: Brain, title: "MemWal cross-shipment memory", body: "Validation agent recalls prior exporter baselines from MemWal to detect fraud across shipments." }
];

export default function LandingPage() {
  return (
    <div>
      <section className="mx-auto grid min-h-[calc(100vh-81px)] max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sui/25 bg-sui/10 px-3 py-1 text-sm text-sui">
            <Globe2 className="h-4 w-4" />
            Sui-native trade compliance infrastructure
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-pearl md:text-7xl">
            The shipment passport for global trade
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-steel">
            SuiShip turns fragmented shipping paperwork into one AI-verified, blockchain-backed digital passport for every shipment — with a tool-using validation agent that remembers exporter identity across shipments to catch fraud.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/create">
              Create Passport <ArrowRight className="h-4 w-4" />
            </LinkButton>
            <LinkButton href="/shipments" variant="secondary">
              View Shipments
            </LinkButton>
          </div>
        </div>

        <Panel className="relative overflow-hidden p-0">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-steel">Validation Agent · Tool Call Trace</p>
                <h2 className="mt-1 text-xl font-semibold text-pearl">Cross-shipment memory recall</h2>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">Live on testnet</span>
            </div>
          </div>
          <div className="p-5">
            <div className="grid gap-2">
              {[
                { icon: "🔍", tool: "recall_party_memory", input: '("acme-robotics-llc")', result: "→ 2 prior records found", status: "ok" },
                { icon: "📄", tool: "recall_document_fingerprints", input: '(bol="BL-MEM-001")', result: "→ Duplicate detected!", status: "critical" },
                { icon: "⚠️", tool: "flag_anomaly", input: "(duplicate_document, error)", result: "→ Recalled: BL-MEM-001 · Current: BL-MEM-001", status: "critical" },
                { icon: "⚠️", tool: "flag_anomaly", input: "(bank_account_changed, error)", result: "→ Recalled: IBAN-XXXX-1234 · Current: IBAN-XXXX-9999", status: "critical" },
                { icon: "✓", tool: "done", input: "", result: "→ 2 critical anomalies — shipment blocked", status: "done" },
              ].map((step, i) => (
                <div key={i} className={`rounded-xl border px-3 py-2.5 text-xs font-mono ${step.status === "critical" ? "border-red-500/30 bg-red-500/8" : step.status === "done" ? "border-emerald-500/20 bg-emerald-500/6" : "border-white/10 bg-white/4"}`}>
                  <span className="mr-1.5">{step.icon}</span>
                  <span className="font-bold text-pearl">{step.tool}</span>
                  <span className="text-steel">{step.input}</span>
                  <span className={`ml-2 ${step.status === "critical" ? "text-red-400" : "text-steel/70"}`}>{step.result}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-white/10 bg-white/6 p-3 text-xs text-steel">
              <span className="font-bold text-pearl">Anchored to:</span> MemWal persistent memory · Walrus blob storage · Sui passport (testnet)
            </div>
          </div>
        </Panel>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20">
        <div className="grid gap-4 md:grid-cols-4">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Panel key={module.title}>
                <Icon className="h-6 w-6 text-sui" />
                <h3 className="mt-5 text-lg font-semibold text-pearl">{module.title}</h3>
                <p className="mt-3 text-sm leading-6 text-steel">{module.body}</p>
              </Panel>
            );
          })}
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            { label: "Create shipment", detail: "Capture trade parties, route, value, and upload PDFs." },
            { label: "AI extraction + memory validation", detail: "Claude Haiku extracts fields; validation agent recalls MemWal baseline and flags anomalies." },
            { label: "Mint Sui passport", detail: "Wallet signs a Sui Move call — evidence anchored to Walrus + MemWal." },
          ].map((step, index) => (
            <div key={step.label} className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/6 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-pearl text-sm font-semibold text-ink">{index + 1}</span>
              <div>
                <h3 className="font-semibold text-pearl">{step.label}</h3>
                <p className="text-sm text-steel">{step.detail}</p>
              </div>
              <CheckCircle2 className="ml-auto h-5 w-5 text-mint" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
