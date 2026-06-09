"use client";

import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  Boxes,
  BrainCircuit,
  Database,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  GitBranch,
  Globe2,
  Infinity as InfinityIcon,
  Layers,
  Link2,
  LockKeyhole,
  MessageSquare,
  Network,
  Package,
  Play,
  QrCode,
  Radar,
  ScanSearch,
  Shield,
  Ship,
  Sparkles,
  Terminal,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import suishipLogo from "@/asset/suiship_logo.png";
import suishipName from "@/asset/suiship_name.png";
import { Panel } from "@/components/ui";

// ─── Animation variants ────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

// ─── Background: animated grid + gradient mesh ─────────────────────────────

function TechBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Gradient mesh */}
      <div className="absolute -top-40 left-1/2 h-[800px] w-[1200px] -translate-x-1/2 rounded-full bg-sui/10 blur-[120px]" />
      <div className="absolute top-[40%] -left-40 h-[600px] w-[600px] rounded-full bg-emerald-500/8 blur-[100px]" />
      <div className="absolute top-[70%] -right-40 h-[600px] w-[600px] rounded-full bg-amber-500/6 blur-[120px]" />
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(77,162,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(77,162,255,0.5) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 100%)",
        }}
      />
      {/* Noise */}
      <div
        className="absolute inset-0 opacity-[0.015] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />
    </div>
  );
}

// ─── Data ──────────────────────────────────────────────────────────────────

const navLinks = [
  { label: "Agents", href: "#agents" },
  { label: "Memory", href: "#memory" },
  { label: "Architecture", href: "#tech" },
  { label: "Builders", href: "#builders" },
];

const trackAlignment = [
  {
    icon: BrainCircuit,
    title: "Long-term memory",
    sub: "MemWal · persistent semantic recall",
    body: "Every agent reads and writes structured company context. Memory survives across shipments, sessions, and parties — anchored on Walrus, addressable by the agent loop.",
  },
  {
    icon: Database,
    title: "Persistent data layer",
    sub: "Walrus · erasure-coded blob storage",
    body: "Trade PDFs, validation reports, agent traces, and risk analyses live on Walrus. Sui anchors the references so every artifact stays verifiable and queryable.",
  },
  {
    icon: Network,
    title: "Multi-agent coordination",
    sub: "6 specialized agents · tool-calling",
    body: "Extraction, validation, risk, chat, persistent monitoring, and memory agents pass artifacts and findings between each other through a shared Walrus-backed context.",
  },
  {
    icon: Layers,
    title: "Artifact-driven workflow",
    sub: "PDFs → fingerprints → passports",
    body: "Each pipeline stage produces a durable artifact — extracted JSON, validation verdict, risk report, on-chain passport — that downstream agents reuse instead of regenerating.",
  },
  {
    icon: Workflow,
    title: "Long-running execution",
    sub: "Event-driven · AIS polling",
    body: "The persistent agent monitors vessels after endorsements and emits shipment events when ETAs drift. Agents stay live long after the user closes the tab.",
  },
  {
    icon: Terminal,
    title: "Developer tooling",
    sub: "REST API · memory inspector",
    body: "Every agent stage is a standalone endpoint. Memory writes are inspectable. Builders can plug SuiShip's memory layer into their own agent frameworks.",
  },
];

const coreFeatures = [
  {
    icon: Ship,
    title: "Shipment creation",
    body: "Structured intake for exporter, importer, freight forwarder, route, cargo, Incoterms, and trade value.",
  },
  {
    icon: ScanSearch,
    title: "AI document extraction",
    body: "Claude Haiku parses bills of lading, invoices, packing lists, and certificates of origin into structured fields.",
  },
  {
    icon: FileCheck2,
    title: "Cross-document validation",
    body: "A validation agent compares every extracted field across the document set and emits a verdict with explanations.",
  },
  {
    icon: Shield,
    title: "Trade-finance risk agent",
    body: "Correlates document signals with historical patterns to flag duplicates, bank-account swaps, and route disruption.",
  },
  {
    icon: LockKeyhole,
    title: "Sui shipment passport",
    body: "Immutable on-chain object with document hashes, Walrus URIs, risk score, and live custody chain.",
  },
  {
    icon: Package,
    title: "Walrus document storage",
    body: "PDFs and reports live on Walrus; verifiable references anchored on Sui. No ledger bloat, no broken links.",
  },
  {
    icon: MessageSquare,
    title: "Role-gated chatbot",
    body: "Tool-calling Q&A over any shipment. Sensitive fields redacted by role: exporter, importer, freight forwarder.",
  },
  {
    icon: Link2,
    title: "Endorsement provenance",
    body: "Per-role custody events — pickup, handoff, customs — captured as an auditable on-chain chain.",
  },
  {
    icon: QrCode,
    title: "Shareable passport links",
    body: "QR + public link so banks, customs, and partners can inspect status without email attachments.",
  },
  {
    icon: Radar,
    title: "Customs clearance viewer",
    body: "Search by shipment ID or Sui object ID. Documents, risk, authenticity, and clearance in one view.",
  },
  {
    icon: Activity,
    title: "Persistent vessel monitoring",
    body: "Event-driven agent polls AIS positions after endorsements and emits drift events autonomously.",
  },
  {
    icon: BrainCircuit,
    title: "Cross-shipment memory",
    body: "MemWal recall lets agents detect anomalies that only appear across multiple shipments over time.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Create",
    detail: "Trade parties, route, cargo, PDF set.",
  },
  {
    step: "02",
    title: "Extract & validate",
    detail: "Haiku extraction → validation agent → MemWal recall → verdict.",
  },
  {
    step: "03",
    title: "Mint",
    detail: "Sui passport with hashes, blob refs, risk score, verification score.",
  },
  {
    step: "04",
    title: "Collaborate & monitor",
    detail: "Chat agent, endorsements, QR link, persistent vessel monitoring.",
  },
];

const techStack = [
  {
    name: "Sui",
    accent: "#4DA2FF",
    tagline: "Object-centric blockchain",
    body: "Sub-second finality. Each shipment mints a ShipmentPassport object with immutable hashes and Walrus refs.",
    metric: "testnet anchored",
  },
  {
    name: "Walrus",
    accent: "#5FD3BC",
    tagline: "Decentralized blob storage",
    body: "Erasure-coded storage for PDFs, validation reports, risk artifacts. Refs anchored on Sui for verifiability.",
    metric: "all artifacts durable",
  },
  {
    name: "SEAL",
    accent: "#A78BFA",
    tagline: "Threshold encryption",
    body: "Key servers verify on-chain endorsement status before releasing decryption shares. No custodian required.",
    metric: "role-gated reads",
  },
  {
    name: "MemWal",
    accent: "#F59E0B",
    tagline: "Persistent semantic memory",
    body: "Agent memory layer over Walrus. Recalls exporter baselines and prior fingerprints across shipments.",
    metric: "cross-session recall",
  },
];

const agents = [
  { name: "Extraction", model: "Claude Haiku", role: "Async field extraction from trade PDFs.", emoji: "📄" },
  { name: "Validation", model: "Claude Haiku", role: "Cross-document comparison and verdict.", emoji: "✅" },
  { name: "Risk", model: "Claude Sonnet", role: "Trade-finance risk correlation.", emoji: "🛡️" },
  { name: "Chatbot", model: "Claude Sonnet", role: "Role-gated tool-calling Q&A.", emoji: "💬" },
  { name: "Persistent", model: "Event-driven", role: "AIS polling, in-transit drift events.", emoji: "📡" },
  { name: "Memory", model: "MemWal", role: "Cross-shipment context I/O.", emoji: "🧠" },
];

const audiences = [
  { title: "Exporters", body: "Package documents once, prove consistency, share a verifiable passport with every counterparty." },
  { title: "Importers", body: "Review AI validation, approve shipments, and catch document fraud before goods are released." },
  { title: "Freight forwarders", body: "Endorse custody events, monitor vessel movement, keep every party aligned on status." },
  { title: "Customs & compliance", body: "Inspect authenticity proof, risk signals, and clearance readiness from a single tracking ID." },
];

const builderEndpoints = [
  {
    method: "POST",
    path: "/api/shipments/:id/mint",
    comment: "Anchor to Sui + Walrus",
    response: `{ passportId, txDigest, mintedAt,\n  walrusBlobIds[], memWalSpaceId }`,
  },
  {
    method: "POST",
    path: "/api/shipments/:id/validate",
    comment: "Run cross-document validation",
    response: `{ verdict: "pass" | "fail",\n  findings[], verificationScore }`,
  },
  {
    method: "POST",
    path: "/api/shipments/:id/chat",
    comment: "Role-gated, field-redacted Q&A",
    response: `streaming tool-calling response`,
  },
  {
    method: "POST",
    path: "/api/shipments/:id/risk-scan",
    comment: "Trade-finance risk correlation",
    response: `{ risks[], confidence, riskLevel }`,
  },
];

// ─── Live hero terminal ────────────────────────────────────────────────────

const heroTraceLines: Array<{
  agent: string;
  call: string;
  result: string;
  tone: "info" | "warn" | "critical" | "ok";
}> = [
  { agent: "extraction", call: "parse(bol_BL-MEM-001.pdf)", result: "→ 14 fields extracted", tone: "info" },
  { agent: "memory", call: "recall_party('acme-robotics-llc')", result: "→ 2 prior records", tone: "info" },
  { agent: "memory", call: "recall_fingerprint('BL-MEM-001')", result: "→ DUPLICATE", tone: "critical" },
  { agent: "validation", call: "compare(invoice ↔ bol)", result: "→ IBAN drift detected", tone: "warn" },
  { agent: "risk", call: "score(payment_diversion)", result: "→ 0.94 confidence", tone: "critical" },
  { agent: "validation", call: "flag('duplicate_document')", result: "→ written to MemWal", tone: "critical" },
  { agent: "passport", call: "mint(verdict=BLOCKED)", result: "→ 0x9a3f…c021", tone: "ok" },
];

function HeroTerminal() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= heroTraceLines.length) {
      const reset = setTimeout(() => setVisible(0), 3500);
      return () => clearTimeout(reset);
    }
    const t = setTimeout(() => setVisible((v) => v + 1), 650);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#070b16]/95 shadow-2xl backdrop-blur">
      {/* glow */}
      <div className="absolute -inset-px rounded-[1.6rem] bg-gradient-to-br from-sui/20 via-transparent to-amber-500/15 opacity-50" />
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-steel/60">
              suiship · agent trace · live
            </span>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            MEMWAL ONLINE
          </span>
        </div>

        {/* Trace */}
        <div className="min-h-[340px] space-y-1.5 p-4 font-mono text-[11.5px] leading-relaxed">
          <div className="text-steel/50">
            <span className="text-sui">$</span> suiship agents run --shipment SHP-9921 --memory enabled
          </div>
          <div className="text-steel/40">› orchestrator: 6 agents online · context = walrus://0x4a…f7</div>

          {heroTraceLines.slice(0, visible).map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-[88px_1fr] gap-2"
            >
              <span
                className={`rounded px-1.5 text-[10px] font-bold uppercase ${
                  line.tone === "critical"
                    ? "bg-red-500/15 text-red-400"
                    : line.tone === "warn"
                      ? "bg-amber-500/15 text-amber-400"
                      : line.tone === "ok"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-sui/15 text-sui"
                }`}
              >
                {line.agent}
              </span>
              <span>
                <span className="text-pearl">{line.call}</span>{" "}
                <span
                  className={
                    line.tone === "critical"
                      ? "text-red-400"
                      : line.tone === "warn"
                        ? "text-amber-400"
                        : line.tone === "ok"
                          ? "text-emerald-400"
                          : "text-steel/70"
                  }
                >
                  {line.result}
                </span>
              </span>
            </motion.div>
          ))}

          {visible >= heroTraceLines.length && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 rounded-lg border border-red-500/30 bg-red-500/8 p-2.5 text-[11px]"
            >
              <span className="font-bold text-red-400">FRAUD BLOCKED</span>
              <span className="text-steel/80">
                {" "}
                · duplicate BOL + bank diversion · caught via MemWal recall · passport minted with verdict=BLOCKED
              </span>
            </motion.div>
          )}
        </div>

        {/* Footer chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/8 px-4 py-3 font-mono text-[10px]">
          <span className="rounded border border-sui/20 bg-sui/10 px-1.5 py-0.5 text-sui">sui://passport</span>
          <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
            walrus://blob
          </span>
          <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
            memwal://space
          </span>
          <span className="rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-purple-400">
            seal://policy
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Memory ledger visual ──────────────────────────────────────────────────

const memoryEvents = [
  { t: "T-14d", agent: "memory", op: "WRITE", key: "exporter.acme-robotics.baseline", note: "first invoice pattern stored" },
  { t: "T-09d", agent: "memory", op: "WRITE", key: "document.fingerprint.BL-MEM-001", note: "BOL hash recorded" },
  { t: "T-09d", agent: "memory", op: "WRITE", key: "exporter.acme-robotics.iban", note: "IBAN-XXXX-1234" },
  { t: "T-02d", agent: "memory", op: "WRITE", key: "shipment.SHP-9201.complete", note: "verified, passport minted" },
  { t: "T-0", agent: "validation", op: "READ", key: "document.fingerprint.BL-MEM-001", note: "duplicate hit" },
  { t: "T-0", agent: "validation", op: "READ", key: "exporter.acme-robotics.iban", note: "diff: XXXX-9999" },
  { t: "T-0", agent: "risk", op: "WRITE", key: "shipment.SHP-9921.anomaly", note: "payment diversion + duplicate" },
];

// ─── Video modal ───────────────────────────────────────────────────────────

function DemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.22 }}
        className="relative w-full max-w-3xl rounded-2xl bg-[#0d1628] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-[#080d1a]">
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Play className="h-14 w-14 text-sui/60" />
            <p className="text-sm font-semibold text-steel">Demo video coming soon</p>
            <p className="max-w-xs text-xs text-steel/60">
              Replace with your YouTube embed in <code className="text-sui/80">components/landing-page.tsx</code>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Nav ───────────────────────────────────────────────────────────────────

function LandingNav({ onWatchDemo }: { onWatchDemo: () => void }) {
  const { scrollY } = useScroll();
  const bgOpacity = useTransform(scrollY, [0, 60], [0, 0.85]);
  const borderOpacity = useTransform(scrollY, [0, 60], [0, 0.18]);

  return (
    <motion.header
      className="sticky top-0 z-50 px-5 py-4 backdrop-blur-xl lg:px-10"
      style={{
        backgroundColor: `rgba(8, 13, 26, ${bgOpacity})`,
        borderBottom: `1px solid rgba(77, 162, 255, ${borderOpacity})`,
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="SuiShip home">
          <Image src={suishipLogo} alt="" className="h-11 w-11 shrink-0 object-contain" priority />
          <Image src={suishipName} alt="SuiShip" className="mt-1 h-8 w-auto min-w-[112px] object-contain" priority />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-xl px-3 py-2 text-sm font-semibold text-steel transition hover:bg-white/8 hover:text-pearl"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            onClick={onWatchDemo}
            className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-steel transition hover:bg-white/8 hover:text-pearl sm:flex"
          >
            <Play className="h-3.5 w-3.5" />
            Demo
          </button>
          <Link
            href="/create"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold blue-gradient text-white shadow-glow transition hover:brightness-105"
          >
            Launch App
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </motion.header>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function LandingPage() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <TechBackground />
      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      <LandingNav onWatchDemo={() => setDemoOpen(true)} />

      <main>
        {/* ── Hero ── */}
        <section className="relative mx-auto max-w-7xl px-5 py-14 lg:px-10 lg:py-20">
          {/* Top status strip */}
          <FadeIn>
            <div className="mb-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2.5 backdrop-blur">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-steel/70">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  6 agents online
                </span>
                <span>memwal: live</span>
                <span>walrus: testnet</span>
                <span>sui: testnet</span>
              </div>
              <span className="font-mono text-[11px] text-sui/80">
                SUI Overflow · Walrus Track
              </span>
            </div>
          </FadeIn>

          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              <motion.div
                variants={fadeUp}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-sui/25 bg-sui/8 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-sui backdrop-blur"
              >
                <BrainCircuit className="h-3.5 w-3.5" />
                Persistent multi-agent system · built on Walrus
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="text-5xl font-extrabold leading-[1.02] tracking-tight text-pearl md:text-6xl xl:text-7xl"
              >
                Agents that{" "}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-br from-sui via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                    remember
                  </span>
                  <svg
                    className="absolute -bottom-2 left-0 w-full"
                    height="8"
                    viewBox="0 0 200 8"
                    fill="none"
                  >
                    <path d="M2 6 Q 100 -2 198 6" stroke="url(#g1)" strokeWidth="2" strokeLinecap="round" />
                    <defs>
                      <linearGradient id="g1" x1="0" x2="1">
                        <stop offset="0" stopColor="#4DA2FF" />
                        <stop offset="1" stopColor="#5FD3BC" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
                <br />
                catch the fraud the<br className="hidden md:block" />
                first agent missed.
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="mt-7 max-w-2xl text-lg leading-8 text-steel"
              >
                SuiShip is a six-agent system with persistent memory on Walrus. Extraction, validation, risk,
                chat, monitoring, and memory agents share a durable context — so the duplicate bill of lading
                you uploaded last quarter still gets caught today.
              </motion.p>

              <motion.div variants={fadeUp} className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/create"
                  className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 py-2 text-sm font-bold blue-gradient text-white shadow-glow transition hover:brightness-110"
                >
                  Launch App
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <button
                  onClick={() => setDemoOpen(true)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-2 text-sm font-semibold text-pearl backdrop-blur transition hover:bg-white/10"
                >
                  <Play className="h-4 w-4 text-sui" />
                  Watch 5-min demo
                </button>
              </motion.div>

              {/* Inline metrics */}
              <motion.div
                variants={fadeUp}
                className="mt-10 grid max-w-xl grid-cols-3 gap-6 border-t border-white/8 pt-6"
              >
                {[
                  { v: "6", l: "Coordinated agents" },
                  { v: "∞", l: "Cross-shipment recall" },
                  { v: "4", l: "Sui-native primitives" },
                ].map((m) => (
                  <div key={m.l}>
                    <p className="bg-gradient-to-br from-pearl to-sui bg-clip-text text-3xl font-extrabold text-transparent">
                      {m.v}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-steel/60">{m.l}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <FadeIn delay={0.2}>
              <HeroTerminal />
            </FadeIn>
          </div>
        </section>

        {/* ── Track alignment bento ── */}
        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
          <FadeIn>
            <div className="mb-10 flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sui">
                  Built for the Walrus Track
                </p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                  Six requirements. Six receipts.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-steel">
                Every track criterion mapped to a live capability in the codebase — not slideware.
              </p>
            </div>
          </FadeIn>
          <motion.div
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {trackAlignment.map((t) => {
              const Icon = t.icon;
              return (
                <motion.div
                  key={t.title}
                  variants={fadeUp}
                  className="group relative overflow-hidden rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur transition hover:border-sui/30 hover:bg-white/[0.05]"
                >
                  <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-sui/10 blur-2xl opacity-0 transition group-hover:opacity-100" />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sui/12 text-sui">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
                        ✓ shipped
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-pearl">{t.title}</h3>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-sui/80">{t.sub}</p>
                    <p className="mt-3 text-sm leading-6 text-steel">{t.body}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* ── The Problem ── */}
        <section className="mx-auto max-w-7xl px-5 py-14 lg:px-10">
          <FadeIn>
            <div className="relative overflow-hidden rounded-[2rem] border border-red-500/15 bg-gradient-to-br from-red-500/[0.06] via-transparent to-red-500/[0.03] px-8 py-12 md:px-12">
              <div className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage: "radial-gradient(circle at 20% 20%, rgba(239,68,68,0.15), transparent 40%)",
                }}
              />
              <div className="relative">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">
                  The problem
                </p>
                <h2 className="mt-4 max-w-3xl text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                  AI agents forget. Global trade pays the price.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-steel">
                  Most agentic systems are stateless wrappers around an LLM. They can read a document — but they
                  can&apos;t remember the one you uploaded last quarter. In trade finance, that gap costs billions.
                </p>
                <div className="mt-10 grid gap-6 md:grid-cols-3">
                  {[
                    {
                      stat: "$42B+",
                      label: "trade finance fraud annually",
                      detail:
                        "Bills of lading forged in minutes. The same document pledged to multiple banks. No agent remembers what's real.",
                    },
                    {
                      stat: "5–7 days",
                      label: "average customs clearance delay",
                      detail:
                        "Paperwork scattered across email threads. Errors found on arrival. Each tool starts from zero.",
                    },
                    {
                      stat: "12+ parties",
                      label: "touch a single shipment",
                      detail:
                        "Exporters, importers, freight forwarders, banks, customs — each working from a different copy.",
                    },
                  ].map((item) => (
                    <div key={item.stat} className="border-l-2 border-red-500/30 pl-5">
                      <p className="text-4xl font-extrabold text-red-400">{item.stat}</p>
                      <p className="mt-1 text-sm font-bold text-pearl">{item.label}</p>
                      <p className="mt-3 text-sm leading-6 text-steel">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* ── Memory in action ── */}
        <section id="memory" className="mx-auto max-w-7xl px-5 py-14 lg:px-10">
          <FadeIn>
            <div className="mb-10 max-w-3xl">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">
                Memory in action
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                The agent that remembers <span className="text-amber-400">14 days ago</span>
              </h2>
              <p className="mt-4 text-base leading-7 text-steel">
                A walkthrough of one MemWal write/read sequence — same exporter, two shipments, a buried fingerprint
                that no stateless agent would catch.
              </p>
            </div>
          </FadeIn>
          <FadeIn>
            <Panel className="overflow-hidden p-0">
              <div className="grid lg:grid-cols-[1fr_1.4fr]">
                <div className="border-b border-white/8 p-6 lg:border-b-0 lg:border-r">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    <Fingerprint className="h-3 w-3" />
                    memwal://acme-robotics
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-pearl">Persistent memory ledger</h3>
                  <p className="mt-3 text-sm leading-6 text-steel">
                    Every write is durable on Walrus. Every read is addressable by any agent in the loop. The fraud
                    catch on the right is what happens when memory survives the session.
                  </p>
                  <div className="mt-6 grid gap-3 text-xs">
                    {[
                      { k: "Writes", v: "5 records, 14 days" },
                      { k: "Reads", v: "2 by validation agent" },
                      { k: "Hits", v: "1 duplicate, 1 IBAN diff" },
                      { k: "Cost", v: "0 re-uploads" },
                    ].map((kv) => (
                      <div key={kv.k} className="flex items-center justify-between border-b border-white/5 pb-2 font-mono">
                        <span className="text-steel/60">{kv.k}</span>
                        <span className="text-pearl">{kv.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-6">
                  <div className="space-y-2 font-mono text-[11.5px]">
                    {memoryEvents.map((e, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.06, duration: 0.35 }}
                        className={`grid grid-cols-[60px_64px_1fr] items-start gap-2 rounded-lg border px-3 py-2 ${
                          e.op === "WRITE"
                            ? "border-emerald-500/15 bg-emerald-500/5"
                            : "border-amber-500/20 bg-amber-500/5"
                        }`}
                      >
                        <span className="text-steel/50">{e.t}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-center text-[10px] font-bold ${
                            e.op === "WRITE" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {e.op}
                        </span>
                        <div>
                          <div className="text-pearl">{e.key}</div>
                          <div className="text-steel/60">{e.note}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          </FadeIn>
        </section>

        {/* ── Agents ── */}
        <section id="agents" className="mx-auto max-w-7xl px-5 py-14 lg:px-10">
          <FadeIn>
            <div className="mb-10 max-w-3xl">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sui">
                Multi-agent orchestration
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                Six agents. One shared brain.
              </h2>
              <p className="mt-4 text-base leading-7 text-steel">
                Each agent has a narrow job and a wide mouth — it talks to the others through a Walrus-backed
                context. No agent rebuilds state. No prompt re-explains the company.
              </p>
            </div>
          </FadeIn>
          <motion.div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {agents.map((agent, i) => (
              <motion.div
                key={agent.name}
                variants={fadeUp}
                className="group relative overflow-hidden rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur transition hover:-translate-y-0.5 hover:border-sui/30"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sui/20 bg-sui/8 text-2xl">
                    {agent.emoji}
                  </span>
                  <span className="font-mono text-[10px] text-steel/40">agent_{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-pearl">{agent.name} agent</h3>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-sui/80">{agent.model}</p>
                <p className="mt-3 text-sm leading-6 text-steel">{agent.role}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ── Tech Stack ── */}
        <section id="tech" className="mx-auto max-w-7xl px-5 py-14 lg:px-10">
          <FadeIn>
            <div className="mb-10 max-w-3xl">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sui">
                Architecture
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                Four Sui-native layers. Zero glue code.
              </h2>
            </div>
          </FadeIn>
          <motion.div
            className="grid gap-4 md:grid-cols-2"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {techStack.map((tech) => (
              <motion.div
                key={tech.name}
                variants={fadeUp}
                className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-7 backdrop-blur transition hover:border-white/20"
                style={{
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
                }}
              >
                <div
                  className="absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-20 blur-3xl transition group-hover:opacity-40"
                  style={{ backgroundColor: tech.accent }}
                />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-2xl text-base font-extrabold"
                        style={{
                          backgroundColor: `${tech.accent}18`,
                          color: tech.accent,
                          border: `1px solid ${tech.accent}30`,
                        }}
                      >
                        {tech.name[0]}
                      </span>
                      <div>
                        <p className="text-lg font-extrabold text-pearl">{tech.name}</p>
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider" style={{ color: tech.accent }}>
                          {tech.tagline}
                        </p>
                      </div>
                    </div>
                    <span
                      className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider"
                      style={{
                        borderColor: `${tech.accent}30`,
                        color: tech.accent,
                        backgroundColor: `${tech.accent}10`,
                      }}
                    >
                      {tech.metric}
                    </span>
                  </div>
                  <p className="mt-6 text-sm leading-7 text-steel">{tech.body}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ── How It Works ── */}
        <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-14 lg:px-10">
          <FadeIn>
            <div className="mb-10 max-w-3xl">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sui">
                Pipeline
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                Create → extract → mint → monitor
              </h2>
            </div>
          </FadeIn>
          <motion.div
            className="grid gap-4 lg:grid-cols-4"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {workflow.map((item, i) => (
              <motion.div
                key={item.step}
                variants={fadeUp}
                className="relative rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur"
              >
                {i < workflow.length - 1 && (
                  <div className="absolute right-0 top-1/2 hidden h-px w-6 -translate-y-1/2 translate-x-3 bg-gradient-to-r from-sui/40 to-transparent lg:block" />
                )}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold text-sui">{item.step}</span>
                  <GitBranch className="h-3.5 w-3.5 text-steel/30" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-pearl">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-steel">{item.detail}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ── Use Cases ── */}
        <section className="mx-auto max-w-7xl px-5 py-14 lg:px-10">
          <FadeIn>
            <div className="mb-10 max-w-3xl">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sui">
                Roles
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                Built for every party in the chain
              </h2>
            </div>
          </FadeIn>
          <motion.div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {audiences.map((audience) => (
              <motion.div
                key={audience.title}
                variants={fadeUp}
                className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur transition hover:border-sui/25"
              >
                <Sparkles className="h-5 w-5 text-sui" />
                <h3 className="mt-4 text-lg font-bold text-pearl">{audience.title}</h3>
                <p className="mt-3 text-sm leading-6 text-steel">{audience.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ── Core Features ── */}
        <section id="features" className="mx-auto max-w-7xl px-5 py-14 lg:px-10">
          <FadeIn>
            <div className="mb-10 max-w-3xl">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sui">
                Full capability surface
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                Twelve capabilities, all shipped
              </h2>
            </div>
          </FadeIn>
          <motion.div
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {coreFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div key={feature.title} variants={fadeUp}>
                  <Panel className="h-full transition hover:border-sui/25">
                    <Icon className="h-6 w-6 text-sui" />
                    <h3 className="mt-5 text-lg font-semibold text-pearl">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-steel">{feature.body}</p>
                  </Panel>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* ── For Builders ── */}
        <section id="builders" className="mx-auto max-w-7xl px-5 py-14 lg:px-10">
          <FadeIn>
            <Panel className="overflow-hidden">
              <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sui/20 bg-sui/8 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-sui">
                    <Terminal className="h-3.5 w-3.5" />
                    For builders
                  </div>
                  <h2 className="text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                    Plug our memory layer into your agents
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-steel">
                    Every pipeline stage is a standalone REST endpoint. Mint passports, run validation, start chats,
                    trigger risk scans — or use our MemWal patterns as a reference for adding persistent memory to
                    your own agent framework.
                  </p>
                  <div className="mt-6 grid gap-3">
                    {[
                      { icon: Workflow, label: "Dashboard", detail: "Active shipments, risk, arrivals at a glance." },
                      { icon: BadgeCheck, label: "Create shipment", detail: "Full intake form, uploads, AI pipeline, minting." },
                      { icon: Ship, label: "Shipment workspace", detail: "Validation, chat, endorsements, QR, provenance." },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.label}
                          className="flex items-start gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur"
                        >
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

                <div className="rounded-2xl border border-white/15 bg-[#070b16] p-6 font-mono text-base shadow-inner">
  <div className="mb-5 flex items-center gap-2 border-b border-white/15 pb-4">
    <span className="h-3 w-3 rounded-full bg-red-500" />
    <span className="h-3 w-3 rounded-full bg-yellow-500" />
    <span className="h-3 w-3 rounded-full bg-emerald-500" />

    <span className="ml-2 text-sm font-bold uppercase tracking-wider text-white">
      SuiShip API
    </span>
  </div>

  <div className="grid gap-6">
    {builderEndpoints.map((ep) => (
      <div key={ep.path}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-sui/25 px-2 py-1 text-sm font-bold text-white">
            {ep.method}
          </span>

          <span className="text-base font-semibold text-white">
            {ep.path}
          </span>

          <span className="text-base text-white/80">
            # {ep.comment}
          </span>
        </div>

        <div className="mt-3 rounded border border-white/15 bg-white/[0.06] px-4 py-3 text-base leading-7 text-white">
          <span className="text-white/70">→ </span>

          {ep.response.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i < ep.response.split("\n").length - 1 && <br />}
            </span>
          ))}
        </div>
      </div>
    ))}
  </div>
</div>
              </div>
            </Panel>
          </FadeIn>
        </section>

        {/* ── Final CTA ── */}
        <section className="mx-auto max-w-7xl px-5 pb-24 pt-6 lg:px-10">
          <FadeIn>
            <div className="relative overflow-hidden rounded-[2rem] blue-gradient px-8 py-16 text-center shadow-glow md:px-12">
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                  maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
                }}
              />
              <div className="relative">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-white/70">
                  Ready to ship
                </p>
                <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white md:text-5xl">
                  Ship on Sui. Stored on Walrus.
                  <br className="hidden md:block" /> Remembered by MemWal.
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/80">
                  Create a shipment, run six agents in coordination, and mint your first verifiable passport in under
                  five minutes.
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/create"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-7 py-2 text-sm font-extrabold text-sui transition hover:brightness-105"
                  >
                    Launch App
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => setDemoOpen(true)}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/25 px-7 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    <Play className="h-4 w-4" />
                    Watch Demo
                  </button>
                </div>
              </div>
            </div>
          </FadeIn>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/8 px-5 py-10 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-3">
                <Image src={suishipLogo} alt="" className="h-9 w-9 object-contain" />
                <Image src={suishipName} alt="SuiShip" className="mt-0.5 h-6 w-auto object-contain" />
              </div>
              <p className="mt-2 text-xs text-steel">
                Persistent multi-agent system for global trade. Built on Sui, Walrus, SEAL, and MemWal.
              </p>
              <p className="mt-1 font-mono text-[11px] font-semibold text-sui/80">
                SUI Overflow · Walrus Track
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-steel">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="transition hover:text-pearl">
                  {link.label}
                </a>
              ))}
              <Link href="/create" className="transition hover:text-pearl">
                Launch App <ExternalLink className="ml-0.5 inline h-3 w-3" />
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}