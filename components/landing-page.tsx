import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  FileCheck2,
  Globe2,
  Link2,
  LockKeyhole,
  MessageSquare,
  Package,
  QrCode,
  Radar,
  ScanSearch,
  Shield,
  Ship,
  Sparkles,
  Workflow,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import suishipLogo from "@/asset/suiship_logo.png";
import suishipName from "@/asset/suiship_name.png";
import { Panel } from "@/components/ui";

const coreFeatures = [
  {
    icon: Ship,
    title: "Create & manage shipments",
    body: "Capture exporter, importer, freight forwarder, route, cargo, Incoterms, and trade value in one structured workflow.",
  },
  {
    icon: ScanSearch,
    title: "AI document extraction",
    body: "Claude Haiku reads bills of lading, commercial invoices, packing lists, and certificates of origin — pulling HS codes, values, parties, and routing fields automatically.",
  },
  {
    icon: FileCheck2,
    title: "Cross-document validation",
    body: "A validation agent compares extracted fields across every document, surfaces mismatches, and produces a clear verdict with an explanation you can share with trade partners.",
  },
  {
    icon: Shield,
    title: "Trade-finance risk intelligence",
    body: "A risk agent correlates document signals with historical trade patterns to flag duplicate documents, bank-account changes, route disruption, and other fraud indicators.",
  },
  {
    icon: LockKeyhole,
    title: "Sui shipment passport",
    body: "Mint an on-chain passport object with immutable document hashes, storage URIs, risk score, and live status — anchored on Sui testnet (mock or real wallet mode).",
  },
  {
    icon: Package,
    title: "Walrus-ready document storage",
    body: "Keep PDFs off-chain while anchoring verifiable references on Sui. Full manifests and artifact metadata stay queryable in the app.",
  },
  {
    icon: MessageSquare,
    title: "Role-gated shipment chatbot",
    body: "Ask questions about any shipment in natural language. The chat agent uses tool-calling and redacts sensitive fields based on whether you are exporter, importer, or freight forwarder.",
  },
  {
    icon: Link2,
    title: "Provenance & endorsements",
    body: "Track custody of endorsements per party role — pickup, handoff, customs clearance — with an auditable chain of who signed what and when.",
  },
  {
    icon: QrCode,
    title: "Shareable passport links",
    body: "Generate a QR code and public link so partners, banks, or customs can inspect passport status without digging through email attachments.",
  },
  {
    icon: Radar,
    title: "Customs clearance viewer",
    body: "Search by shipment ID or Sui object ID to review documents, risk posture, authenticity proof, and clearance readiness in one place.",
  },
  {
    icon: Activity,
    title: "Persistent vessel monitoring",
    body: "The persistent agent polls AIS vessel positions after key endorsements and emits shipment events when routes or ETAs drift from plan.",
  },
  {
    icon: BrainCircuit,
    title: "Cross-shipment memory",
    body: "MemWal-backed memory lets validation recall prior exporter baselines and detect anomalies that only appear across multiple shipments.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Create a shipment",
    detail: "Enter trade parties, route, cargo, and upload the required PDF set for the lane.",
  },
  {
    step: "02",
    title: "Run the AI pipeline",
    detail: "Extract structured fields, cross-validate documents, and run the risk scan before anything is minted on-chain.",
  },
  {
    step: "03",
    title: "Mint the passport",
    detail: "Anchor evidence to Sui with Walrus-ready storage references and a tamper-evident manifest.",
  },
  {
    step: "04",
    title: "Collaborate & monitor",
    detail: "Chat with the shipment agent, endorse milestones, share the QR passport, and watch persistent monitoring for in-transit changes.",
  },
];

const agents = [
  { name: "Extraction agent", model: "Claude Haiku", role: "Async document field extraction from trade PDFs" },
  { name: "Validation agent", model: "Claude Haiku", role: "Cross-document comparison and verdict generation" },
  { name: "Risk agent", model: "Claude Sonnet", role: "Trade-finance risk correlation and anomaly surfacing" },
  { name: "Chatbot agent", model: "Claude Sonnet", role: "Tool-calling Q&A with per-role redaction" },
  { name: "Persistent agent", model: "Event-driven", role: "AIS polling and in-transit shipment event emission" },
  { name: "Memory agent", model: "MemWal", role: "Reads and writes structured company context across shipments" },
];

const audiences = [
  { title: "Exporters", body: "Package documents once, prove consistency, and share a verifiable passport with every counterparty." },
  { title: "Importers", body: "Review AI validation, approve shipments, and catch document fraud before goods are released." },
  { title: "Freight forwarders", body: "Endorse custody events, monitor vessel movement, and keep every party aligned on status." },
  { title: "Customs & compliance", body: "Inspect authenticity proof, risk signals, and clearance readiness from a single tracking ID." },
];

const stack = [
  "Next.js 16 + React 19",
  "Anthropic Claude (Haiku + Sonnet)",
  "Sui blockchain + Move contracts",
  "Walrus blob storage",
  "MemWal structured memory",
  "SQLite application store",
];

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-blue-100/80 bg-white/75 px-5 py-4 backdrop-blur-xl dark:border-slate-700/80 dark:bg-ink/80 lg:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="SuiShip home">
            <Image src={suishipLogo} alt="" className="h-11 w-11 shrink-0 object-contain" priority />
            <Image src={suishipName} alt="SuiShip" className="mt-1 h-8 w-auto min-w-[112px] object-contain" priority />
          </Link>
          <a
            href="/dashboard"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold blue-gradient text-white shadow-glow transition hover:brightness-105"
          >
            Launch App
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sui/25 bg-sui/10 px-3 py-1 text-sm font-semibold text-sui">
              <Globe2 className="h-4 w-4" />
              AI-powered shipment passports on Sui
            </div>
            <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-tight text-pearl md:text-7xl">
              One digital passport for every global shipment
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-steel">
              SuiShip turns fragmented trade paperwork into a single AI-verified, blockchain-backed shipment passport.
              Extract fields from documents, validate consistency, detect risk, mint on Sui, and collaborate with every
              party in the chain — exporters, importers, freight forwarders, and customs.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="/dashboard"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold blue-gradient text-white shadow-glow transition hover:brightness-105"
              >
                Launch App <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#features" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-pearl shadow-sm transition hover:bg-blue-50 dark:border-slate-700 dark:bg-midnight dark:hover:bg-ink">
                Explore features
              </a>
            </div>
          </div>

          <Panel className="relative overflow-hidden p-0">
            <div className="border-b border-white/10 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-steel">Shipment passport preview</p>
                  <h2 className="mt-1 text-xl font-semibold text-pearl">SS-EXP-378147 · AI Verified</h2>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-500">
                  Live on Sui testnet
                </span>
              </div>
            </div>
            <div className="grid gap-3 p-5">
              {[
                { label: "Route", value: "Los Angeles → Shanghai" },
                { label: "Documents", value: "4 uploaded · 4 validated" },
                { label: "Risk score", value: "Low · 2 checks passed" },
                { label: "Passport", value: "0xb64a…33e9 · Walrus-ready URIs" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                  <span className="font-semibold text-steel">{row.label}</span>
                  <span className="font-bold text-pearl">{row.value}</span>
                </div>
              ))}
              <div className="rounded-xl border border-sui/20 bg-sui/8 px-4 py-3 text-xs leading-6 text-steel">
                <span className="font-bold text-pearl">What SuiShip provides:</span> structured trade data, AI validation,
                on-chain anchoring, role-gated chat, endorsements, QR sharing, and in-transit monitoring.
              </div>
            </div>
          </Panel>
        </section>

        <section id="overview" className="mx-auto max-w-7xl px-5 py-10 lg:px-10">
          <Panel>
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-sui">What SuiShip does</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                  From document pile to verifiable trade record
                </h2>
              </div>
              <p className="text-base leading-8 text-steel">
                Global trade still runs on PDFs scattered across email threads. SuiShip ingests those documents, uses AI
                agents to extract and cross-check every critical field, scores trade-finance risk, and mints a shared
                shipment passport on the Sui blockchain. The result is a single source of truth that every authorized
                party can inspect, endorse, and monitor — without re-uploading the same files to every counterparty.
              </p>
            </div>
          </Panel>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-10 lg:px-10">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-sui">Platform capabilities</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
              Everything the app provides
            </h2>
            <p className="mt-4 text-base leading-8 text-steel">
              Launch the app to access the full product — dashboard, shipment creation, AI pipeline, passport minting,
              chat, endorsements, and monitoring. The landing page is your overview; the app is where the work happens.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {coreFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <Panel key={feature.title}>
                  <Icon className="h-6 w-6 text-sui" />
                  <h3 className="mt-5 text-lg font-semibold text-pearl">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-steel">{feature.body}</p>
                </Panel>
              );
            })}
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-7xl px-5 py-10 lg:px-10">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-sui">How it works</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
              Four steps from create to monitor
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            {workflow.map((item) => (
              <div key={item.step} className="glass rounded-[1.6rem] p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sui/12 text-sm font-extrabold text-sui">
                  {item.step}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-pearl">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-steel">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="agents" className="mx-auto max-w-7xl px-5 py-10 lg:px-10">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-sui">AI agent stack</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
              Specialized agents for every stage
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.name} className="rounded-[1.6rem] border border-blue-100 bg-white/70 p-5 dark:border-slate-700 dark:bg-midnight/70">
                <div className="flex items-center gap-3">
                  <Bot className="h-5 w-5 text-sui" />
                  <h3 className="font-semibold text-pearl">{agent.name}</h3>
                </div>
                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-sui">{agent.model}</p>
                <p className="mt-3 text-sm leading-6 text-steel">{agent.role}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="audiences" className="mx-auto max-w-7xl px-5 py-10 lg:px-10">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-sui">Built for trade teams</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
              Who uses SuiShip
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {audiences.map((audience) => (
              <Panel key={audience.title}>
                <Sparkles className="h-5 w-5 text-sui" />
                <h3 className="mt-4 text-lg font-semibold text-pearl">{audience.title}</h3>
                <p className="mt-3 text-sm leading-6 text-steel">{audience.body}</p>
              </Panel>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-10 lg:px-10">
          <Panel className="overflow-hidden">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-sui">Technology</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl">Sui-native trade infrastructure</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-steel">
                  SuiShip is a Next.js application with Claude-powered agents, a SQLite application store, and optional
                  integrations for Sui testnet, Walrus, MemWal, and AIS vessel monitoring. Mock mode works out of the
                  box for demos; production integrations are toggled through environment configuration.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {stack.map((item) => (
                    <span key={item} className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-pearl dark:border-slate-700 dark:bg-ink">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid gap-3">
                {[
                  { icon: Workflow, label: "Dashboard", detail: "Active shipments, pending docs, risk, and arrivals at a glance." },
                  { icon: BadgeCheck, label: "Create shipment", detail: "Full trade form, uploads, AI pipeline, and passport minting." },
                  { icon: Ship, label: "Shipment workspace", detail: "Validation, chat, endorsements, QR passport, and provenance." },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sui/12 text-sui">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-semibold text-pearl">{item.label}</h3>
                        <p className="mt-1 text-sm text-steel">{item.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-24 pt-6 lg:px-10">
          <div className="blue-gradient rounded-[2rem] px-8 py-12 text-center shadow-glow md:px-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Ready to open the app?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/85">
              Use Launch App to enter the dashboard, create shipments, run the AI pipeline, mint passports, and
              collaborate with your trade partners.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-2 text-sm font-extrabold text-sui transition hover:brightness-105"
              >
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-blue-100 px-5 py-8 text-center text-sm text-steel dark:border-slate-700 lg:px-10">
        <p>SuiShip — AI-powered shipment document passports on the Sui blockchain.</p>
      </footer>
    </div>
  );
}
