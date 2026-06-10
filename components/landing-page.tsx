"use client";

import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  Boxes,
  BrainCircuit,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  ArrowDown,
  Globe2,
  Infinity as InfinityIcon,
  Link2,
  LockKeyhole,
  MessageSquare,
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
import memwalLogo from "@/asset/memwal_logo.svg";
import sealLogo from "@/asset/seal_logo.svg";
import suiLogo from "@/asset/sui_logo.svg";
import suishipLogo from "@/asset/suiship_logo.png";
import suishipName from "@/asset/suiship_name.png";
import walrusLogo from "@/asset/walrus_logo.svg";
import { Panel } from "@/components/ui";
import { cn } from "@/lib/utils";

// ─── Animation variants ────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

function LandingSection({
  id,
  tone = "light",
  className,
  innerClassName,
  background,
  children,
}: {
  id?: string;
  tone?: "dark" | "mid" | "light" | "sky" | "ice" | "navy";
  className?: string;
  innerClassName?: string;
  background?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass = {
    dark: "landing-section-dark",
    mid: "landing-section-mid",
    light: "landing-section-light",
    sky: "landing-section-sky",
    ice: "landing-section-ice",
    navy: "landing-section-navy",
  }[tone];

  return (
    <section id={id} className={cn(toneClass, "relative overflow-hidden", className)}>
      {background}
      <div className={cn("relative z-10 mx-auto max-w-7xl px-5 py-16 lg:px-10", innerClassName)}>{children}</div>
    </section>
  );
}

function HeroSectionGlow() {
  return <div className="landing-hero-glow" aria-hidden="true" />;
}

function PipelineFlow() {
  return (
    <div className="pipeline-board overflow-hidden rounded-[2rem] border border-[#1a2744] bg-[#0b1220] p-5 md:p-8 lg:p-10">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {workflow.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={item.step} className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
              <div className="pipeline-node flex flex-1 flex-col rounded-[1.25rem] bg-[#f7f4ee] p-6 md:p-7 lg:min-h-[220px]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm md:h-16 md:w-16">
                    <Icon className="h-7 w-7 text-sui md:h-8 md:w-8" strokeWidth={1.75} />
                  </div>
                  <span className="font-mono text-3xl font-extrabold leading-none text-[#0b1220]/10 md:text-4xl">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-extrabold tracking-tight text-[#0b1220] md:text-2xl">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#5a6d8f] md:text-[15px] md:leading-7">{item.detail}</p>
              </div>

              {index < workflow.length - 1 ? (
                <>
                  <div className="pipeline-connector flex items-center justify-center py-3 lg:hidden" aria-hidden="true">
                    <ArrowDown className="h-5 w-5 text-sui/70" strokeWidth={2} />
                  </div>
                  <div className="pipeline-connector hidden w-10 shrink-0 items-center justify-center xl:w-14 lg:flex" aria-hidden="true">
                    <div className="flex w-full items-center gap-1">
                      <div className="h-px flex-1 bg-sui/35" />
                      <ArrowRight className="h-4 w-4 shrink-0 text-sui" strokeWidth={2.5} />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThinkingRemember() {
  return (
    <span className="hero-remember">
      <span className="hero-remember-word">remember</span>
      <span className="hero-thinking-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}

function SharperHighlight() {
  return (
    <span className="hero-sharper">
      <span className="hero-sharper-word">sharper</span>
      <span className="hero-sharper-tick" aria-hidden="true">
        ↑
      </span>
    </span>
  );
}

const poweredByLogos = [
  { src: suiLogo, alt: "Sui", label: "Sui", className: "h-7 md:h-8" },
  { src: walrusLogo, alt: "Walrus", label: "Walrus", className: "h-6 md:h-7" },
  { src: sealLogo, alt: "SEAL", label: "SEAL", className: "h-5 md:h-6" },
  { src: memwalLogo, alt: "MemWal", label: "MemWal", className: "h-5 md:h-[22px]" },
] as const;

function PoweredByBar() {
  return (
    <motion.div
      variants={fadeUp}
      className="mt-14 flex flex-col items-center gap-6 border-t border-black/5 pt-10"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-steel">
        Powered by the Sui stack
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-7 md:gap-x-16">
        {poweredByLogos.map((logo) => (
          <div key={logo.label} className="flex items-center justify-center">
            <Image
              src={logo.src}
              alt={logo.alt}
              className={cn(
                "w-auto object-contain opacity-65 transition duration-300 hover:opacity-100 hover:[transform:translateY(-1px)]",
                logo.className
              )}
            />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

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
  { label: "Access", href: "#access" },
  { label: "Architecture", href: "#tech" },
  { label: "Builders", href: "#builders" },
];

const landingNavLinkClass = "landing-nav-link rounded-xl px-3 py-2 text-sm font-semibold";

const trackAlignment = [
  {
    title: "Long-term memory",
    body: "Every agent reads and writes structured company context. Memory survives across shipments, sessions, and parties — anchored on Walrus, addressable by the agent loop.",
    cardClass: "bg-[#0d1628] text-white",
    dotClass: "bg-[#4da2ff]",
  },
  {
    title: "Persistent data layer",
    body: "Trade PDFs, validation reports, agent traces, and risk analyses live on Walrus. Sui anchors the references so every artifact stays verifiable and queryable.",
    cardClass: "bg-[#4da2ff] text-white",
    dotClass: "bg-white",
  },
  {
    title: "Multi-agent coordination",
    body: "Extraction, validation, risk, chat, persistent monitoring, and memory agents pass artifacts and findings between each other through a shared Walrus-backed context.",
    cardClass: "border border-blue-100 bg-white text-pearl",
    dotClass: "bg-[#4da2ff]",
  },
  {
    title: "Artifact-driven workflow",
    body: "Each pipeline stage produces a durable artifact — extracted JSON, validation verdict, risk report, on-chain passport — that downstream agents reuse instead of regenerating.",
    cardClass: "bg-[#dceeff] text-pearl",
    dotClass: "bg-[#1e90ff]",
  },
  {
    title: "Long-running execution",
    body: "The persistent agent monitors vessels after endorsements and emits shipment events when ETAs drift. Agents stay live long after the user closes the tab.",
    cardClass: "bg-[#b8dcff] text-pearl",
    dotClass: "bg-[#4da2ff]",
  },
  {
    title: "Developer tooling",
    body: "Every agent stage is a standalone endpoint. Memory writes are inspectable. Builders can plug SuiShip's memory layer into their own agent frameworks.",
    cardClass: "bg-[#eaf4ff] text-pearl",
    dotClass: "bg-[#87c8ff]",
  },
];

const problemStats = [
  {
    stat: "$42B+",
    label: "Trade finance fraud annually",
    detail:
      "Bills of lading forged in minutes. The same document pledged to multiple banks. No agent remembers what's real.",
  },
  {
    stat: "5–7 days",
    label: "Average customs clearance delay",
    detail:
      "Paperwork scattered across email threads. Errors found on arrival. Each tool starts from zero.",
  },
  {
    stat: "12+ parties",
    label: "Touch a single shipment",
    detail:
      "Exporters, importers, freight forwarders, banks, customs — each working from a different copy.",
  },
] as const;

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
    icon: Ship,
  },
  {
    step: "02",
    title: "Extract & validate",
    detail: "Haiku extraction → validation agent → MemWal recall → verdict.",
    icon: ScanSearch,
  },
  {
    step: "03",
    title: "Mint",
    detail: "Sui passport with hashes, blob refs, risk score, verification score.",
    icon: LockKeyhole,
  },
  {
    step: "04",
    title: "Collaborate & monitor",
    detail: "Chat agent, endorsements, QR link, persistent vessel monitoring.",
    icon: Radar,
  },
] as const;

const techStack = [
  {
    name: "Sui",
    logo: suiLogo,
    logoClass: "h-8 md:h-9",
    accent: "#4DA2FF",
    tagline: "Object-centric blockchain",
    body: "Sub-second finality. Each shipment mints a ShipmentPassport object with immutable hashes and Walrus refs.",
    metric: "testnet anchored",
  },
  {
    name: "Walrus",
    logo: walrusLogo,
    logoClass: "h-6 md:h-7",
    accent: "#5FD3BC",
    tagline: "Decentralized blob storage",
    body: "Erasure-coded storage for PDFs, validation reports, risk artifacts. Refs anchored on Sui for verifiability.",
    metric: "all artifacts durable",
  },
  {
    name: "SEAL",
    logo: sealLogo,
    logoClass: "h-6 md:h-7",
    accent: "#A78BFA",
    tagline: "Threshold encryption",
    body: "Key servers verify on-chain endorsement status before releasing decryption shares. No custodian required.",
    metric: "role-gated reads",
  },
  {
    name: "MemWal",
    logo: memwalLogo,
    logoClass: "h-5 md:h-6",
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
  { name: "Chatbot", model: "Claude Sonnet", role: "Tool-calling Q&A gated by on-chain endorsements via SEAL.", emoji: "💬" },
  { name: "Persistent", model: "Event-driven", role: "AIS polling, in-transit drift events.", emoji: "📡" },
  { name: "Memory", model: "MemWal", role: "Cross-shipment context I/O. Reads decrypted only after SEAL verifies endorsement.", emoji: "🧠" },
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
  tone: "info" | "warn" | "critical" | "ok" | "seal";
}> = [
  { agent: "extraction", call: "parse(bol_BL-MEM-001.pdf)", result: "→ 14 fields extracted", tone: "info" },
  { agent: "memory", call: "recall_party('acme-robotics-llc')", result: "→ 2 prior records", tone: "info" },
  { agent: "memory", call: "recall_fingerprint('BL-MEM-001')", result: "→ DUPLICATE", tone: "critical" },
  { agent: "seal", call: "verify_endorsement(role=importer)", result: "→ share released (2/3)", tone: "seal" },
  { agent: "validation", call: "compare(invoice ↔ bol)", result: "→ IBAN drift detected", tone: "warn" },
  { agent: "risk", call: "score(payment_diversion)", result: "→ 0.94 confidence", tone: "critical" },
  { agent: "validation", call: "flag('duplicate_document')", result: "→ written to MemWal", tone: "critical" },
  { agent: "passport", call: "mint(verdict=BLOCKED)", result: "→ 0x9a3f…c021", tone: "ok" },
];

const heroToneStyles = {
  info: { agent: "text-[#7cb8ff]", result: "text-[#94a3b8]" },
  warn: { agent: "text-[#fbbf24]", result: "text-[#fcd34d]" },
  critical: { agent: "text-[#f87171]", result: "text-[#fca5a5]" },
  ok: { agent: "text-[#34d399]", result: "text-[#6ee7b7]" },
  seal: { agent: "text-[#c4b5fd]", result: "text-[#ddd6fe]" },
} as const;

function MacTrafficLights() {
  return (
    <div className="mac-traffic-lights" aria-hidden="true">
      <span className="mac-dot mac-dot-red" />
      <span className="mac-dot mac-dot-yellow" />
      <span className="mac-dot mac-dot-green" />
    </div>
  );
}

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
    <div className="hero-terminal w-full text-left">
      <div className="hero-terminal-titlebar">
        <MacTrafficLights />
      </div>

      <div className="hero-terminal-body flex h-[358px] flex-col px-4 py-3.5 font-mono text-[12px] leading-[1.55] sm:px-5 sm:text-[13px]">
        <div className="shrink-0 space-y-1">
          <p className="text-[#f2f2f2]">
            <span className="text-[#32d74b]">suiship@agents</span>
            <span className="text-[#8b949e]">:</span>
            <span className="text-[#58a6ff]">~</span>
            <span className="text-[#f2f2f2]"> $ suiship agents run --shipment SHP-9921</span>
          </p>
          <p className="text-[#8b949e]">6 agents · walrus://0x4a…f7</p>
        </div>

        <div className="mt-3 flex-1 space-y-1.5">
          {heroTraceLines.map((line, i) => {
            const tone = heroToneStyles[line.tone];
            const isVisible = i < visible;
            return (
              <div
                key={`${line.agent}-${line.call}`}
                className={cn(
                  "grid grid-cols-[6.75rem_minmax(0,1fr)_auto] items-baseline gap-x-3 transition-opacity duration-200 sm:whitespace-nowrap",
                  isVisible ? "opacity-100" : "opacity-0"
                )}
              >
                <span className={`font-semibold uppercase ${tone.agent}`}>{line.agent}</span>
                <span className="text-[#f2f2f2]">{line.call}</span>
                <span className={tone.result}>{line.result}</span>
              </div>
            );
          })}
        </div>

        <div
          className={cn(
            "mt-3 shrink-0 border-l-2 border-[#ff7b72] bg-[#ff7b72]/10 px-3 py-2 transition-opacity duration-200",
            visible >= heroTraceLines.length ? "opacity-100" : "opacity-0"
          )}
        >
          <p className="text-[12px] leading-5 sm:text-[13px] sm:whitespace-nowrap">
            <span className="font-bold text-[#ff7b72]">FRAUD BLOCKED</span>
            <span className="text-[#c9d1d9]"> — duplicate BOL · MemWal recall · verdict=BLOCKED</span>
          </p>
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
      className="landing-nav-header sticky top-0 z-50 px-5 py-4 backdrop-blur-xl lg:px-10"
      style={{
        backgroundColor: `rgba(248, 251, 255, ${bgOpacity})`,
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
            <a key={link.href} href={link.href} className={landingNavLinkClass}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            onClick={onWatchDemo}
            className={`${landingNavLinkClass} hidden items-center gap-1.5 sm:flex`}
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
    <div className="min-h-screen bg-[#f8fbff]">
      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      <LandingNav onWatchDemo={() => setDemoOpen(true)} />

      <main>
        {/* ── Hero ── */}
        <LandingSection tone="ice" innerClassName="pb-10 pt-14 lg:pb-14 lg:pt-24" background={<HeroSectionGlow />}>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="mx-auto flex w-full max-w-6xl flex-col items-center text-center"
          >
            <motion.h1
              variants={fadeUp}
              className="text-5xl font-bold leading-[1.05] tracking-tight text-pearl md:text-7xl xl:text-8xl"
            >
              Agents that <ThinkingRemember />
              <br />
              get <SharperHighlight /> over time.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-5 max-w-2xl text-base leading-8 text-steel md:text-lg"
            >
              Walrus-backed memory lets every agent recall past errors, mismatches, and fraud — so the next
              shipment is validated smarter than the last.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-6 w-full">
              <HeroTerminal />
            </motion.div>

            <motion.div variants={fadeUp} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/create"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-7 py-2 text-sm font-semibold text-black transition hover:bg-blue-50"
              >
                Launch App
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <button
                onClick={() => setDemoOpen(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-7 py-2 text-sm font-semibold text-black transition hover:bg-blue-50"
              >
                <Play className="h-4 w-4" />
                Watch 5-min demo
              </button>
            </motion.div>

            <PoweredByBar />
          </motion.div>
        </LandingSection>

        {/* ── Track alignment ── */}
        <LandingSection tone="sky">
          <FadeIn>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sui">
              Built for the Walrus Track
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-pearl md:text-4xl lg:text-5xl">
              Six Requirements. Six Receipts.
            </h2>
          </FadeIn>
          <motion.div
            className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {trackAlignment.map((t) => (
              <motion.div
                key={t.title}
                variants={fadeUp}
                className={cn("flex aspect-square flex-col rounded-3xl p-6 md:p-7", t.cardClass)}
              >
                <span className={cn("mb-5 block h-3 w-3 shrink-0 rounded-full", t.dotClass)} aria-hidden="true" />
                <h3 className="text-lg font-bold tracking-tight md:text-xl">{t.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-6 opacity-90 md:text-[15px] md:leading-7">{t.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </LandingSection>

        {/* ── The Problem ── */}
        <LandingSection tone="ice" className="landing-section-problem">
          <FadeIn>
            <div className="problem-panel relative overflow-hidden rounded-[2rem] bg-white px-8 py-12 md:px-14 md:py-16">
              <div className="relative">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#d64545]">
                  The problem
                </p>
                <h2 className="problem-headline mt-4 font-extrabold tracking-tight text-pearl">
                  AI agents forget. Global trade pays the price.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-steel">
                  Most agentic systems are stateless wrappers around an LLM. They can read a document — but they
                  can&apos;t remember the one you uploaded last quarter. In trade finance, that gap costs billions.
                </p>
              </div>

              <div className="relative mt-12 grid gap-10 md:mt-14 md:grid-cols-3 md:gap-0">
                {problemStats.map((item, index) => (
                  <div
                    key={item.stat}
                    className={cn(
                      "md:px-8",
                      index === 0 ? "md:pl-0" : "md:border-l md:border-[#f5d0d0]"
                    )}
                  >
                    <p className="text-4xl font-extrabold tracking-tight text-[#d64545] md:text-5xl">
                      {item.stat}
                    </p>
                    <p className="mt-2 text-base font-bold text-pearl">{item.label}</p>
                    <p className="mt-3 text-sm leading-6 text-steel">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </LandingSection>

        {/* ── Memory in action ── */}
        <LandingSection id="memory" tone="mid">
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
        </LandingSection>

        {/* ── Endorsement-gated memory ── */}
        <LandingSection id="access" tone="navy">
          <FadeIn>
            <div className="mb-10 max-w-3xl">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#A78BFA]">
                Endorsement-gated memory
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-pearl md:text-4xl">
                Memory you can prove. Access you can revoke.
              </h2>
              <p className="mt-4 text-base leading-7 text-steel">
                Persistent memory is only safe if it&apos;s access-controlled. SEAL key servers verify
                each party&apos;s on-chain endorsement before releasing the decryption share — so the
                chatbot only recalls what your role and your signature entitle you to see.
              </p>
            </div>
          </FadeIn>

          <FadeIn>
            <Panel className="overflow-hidden p-0">
              <div className="grid lg:grid-cols-[1.1fr_1fr]">
                {/* Left: the gate flow */}
                <div className="border-b border-white/8 p-6 lg:border-b-0 lg:border-r lg:p-8">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#A78BFA]">
                    <LockKeyhole className="h-3 w-3" />
                    seal://policy/SHP-9921
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-pearl">Four-step decryption gate</h3>

                  <ol className="mt-6 space-y-4">
                    {[
                      {
                        step: "01",
                        title: "Chat request",
                        detail: "Importer asks the chatbot: 'show me prior IBAN history for this exporter'.",
                      },
                      {
                        step: "02",
                        title: "Sui endorsement check",
                        detail: "SEAL key servers query the ShipmentPassport object. Is the caller endorsed as Importer for SHP-9921?",
                      },
                      {
                        step: "03",
                        title: "Threshold release (2-of-3)",
                        detail: "If endorsed, two of three key servers release decryption shares for the role-scoped MemWal slice.",
                      },
                      {
                        step: "04",
                        title: "Scoped recall",
                        detail: "The chatbot decrypts only the fields the Importer role can see. Bank-account history? Yes. Margin data? Redacted.",
                      },
                    ].map((s) => (
                      <li key={s.step} className="grid grid-cols-[44px_1fr] items-start gap-4">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#A78BFA]/25 bg-[#A78BFA]/10 font-mono text-xs font-bold text-[#A78BFA]">
                          {s.step}
                        </span>
                        <div>
                          <p className="font-semibold text-pearl">{s.title}</p>
                          <p className="mt-1 text-sm leading-6 text-steel">{s.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Right: role matrix */}
                <div className="p-6 lg:p-8">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-steel/60">
                    Same shipment. Three roles. Three views.
                  </p>

                  <div className="mt-5 space-y-3">
                    {[
                      {
                        role: "Exporter",
                        endorsement: "shipment.created",
                        emoji: "🏭",
                        accent: "#4DA2FF",
                        grants: [
                          { label: "Document fingerprints", ok: true },
                          { label: "Own IBAN history", ok: true },
                          { label: "Importer margin data", ok: false },
                          { label: "Customs valuation notes", ok: false },
                        ],
                      },
                      {
                        role: "Importer",
                        endorsement: "shipment.approved",
                        emoji: "📦",
                        accent: "#5FD3BC",
                        grants: [
                          { label: "Document fingerprints", ok: true },
                          { label: "Exporter IBAN history", ok: true },
                          { label: "Risk findings (full)", ok: true },
                          { label: "Forwarder cost basis", ok: false },
                        ],
                      },
                      {
                        role: "Customs",
                        endorsement: "forwarder.handoff",
                        emoji: "🛃",
                        accent: "#A78BFA",
                        grants: [
                          { label: "HS codes + valuation", ok: true },
                          { label: "Authenticity proof", ok: true },
                          { label: "Commercial terms", ok: false },
                          { label: "Internal risk score", ok: false },
                        ],
                      },
                    ].map((r) => (
                      <div
                        key={r.role}
                        className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                              style={{ background: `${r.accent}18`, border: `1px solid ${r.accent}30` }}
                            >
                              {r.emoji}
                            </span>
                            <div>
                              <p className="font-bold text-pearl">{r.role}</p>
                              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: r.accent }}>
                                endorsement: {r.endorsement}
                              </p>
                            </div>
                          </div>
                          <span
                            className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                            style={{ borderColor: `${r.accent}30`, color: r.accent }}
                          >
                            on-chain ✓
                          </span>
                        </div>
                        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
                          {r.grants.map((g) => (
                            <li key={g.label} className="flex items-center gap-1.5">
                              <span
                                className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold ${
                                  g.ok ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/15 text-red-400"
                                }`}
                              >
                                {g.ok ? "✓" : "×"}
                              </span>
                              <span className={g.ok ? "text-steel" : "text-steel/40 line-through"}>
                                {g.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          </FadeIn>
        </LandingSection>

        {/* ── Agents ── */}
        <LandingSection id="agents" tone="light">
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
                className="group relative overflow-hidden rounded-[1.4rem] border border-blue-100/80 bg-white/85 p-6 backdrop-blur transition hover:-translate-y-0.5 hover:border-sui/30"
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
        </LandingSection>

        {/* ── Tech Stack ── */}
        <LandingSection id="tech" tone="light">
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
                className="group relative overflow-hidden rounded-[1.6rem] border border-blue-100/80 bg-white/85 p-7 backdrop-blur transition hover:border-white/20"
                style={{
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
                }}
              >
                <div
                  className="absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-20 blur-3xl transition group-hover:opacity-40"
                  style={{ backgroundColor: tech.accent }}
                />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="flex h-14 items-center rounded-2xl px-4"
                      style={{
                        backgroundColor: `${tech.accent}12`,
                        border: `1px solid ${tech.accent}28`,
                      }}
                    >
                      <Image
                        src={tech.logo}
                        alt={tech.name}
                        className={cn("w-auto object-contain", tech.logoClass)}
                      />
                    </div>
                    <span
                      className="mt-1 shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider"
                      style={{
                        borderColor: `${tech.accent}30`,
                        color: tech.accent,
                        backgroundColor: `${tech.accent}10`,
                      }}
                    >
                      {tech.metric}
                    </span>
                  </div>
                  <p
                    className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: tech.accent }}
                  >
                    {tech.tagline}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-steel">{tech.body}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </LandingSection>

        {/* ── How It Works ── */}
        <LandingSection id="how-it-works" tone="sky">
          <FadeIn>
            <div className="mb-8 max-w-4xl md:mb-10">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-sui">Pipeline</p>
              <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-pearl md:text-5xl lg:text-6xl">
                How SuiShip works
              </h2>
              <p className="mt-4 text-lg text-steel md:text-xl">Create → extract → mint → monitor</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <PipelineFlow />
          </FadeIn>
        </LandingSection>

        {/* ── Use Cases ── */}
        <LandingSection tone="ice">
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
                className="rounded-[1.4rem] border border-blue-100/80 bg-white/85 p-6 backdrop-blur transition hover:border-sui/25"
              >
                <Sparkles className="h-5 w-5 text-sui" />
                <h3 className="mt-4 text-lg font-bold text-pearl">{audience.title}</h3>
                <p className="mt-3 text-sm leading-6 text-steel">{audience.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </LandingSection>

        {/* ── Core Features ── */}
        <LandingSection id="features" tone="mid">
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
        </LandingSection>

        {/* ── For Builders ── */}
        <LandingSection id="builders" tone="sky">
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
                          className="flex items-start gap-4 rounded-2xl border border-blue-100/80 bg-white/85 p-4 backdrop-blur"
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
        </LandingSection>

        {/* ── Final CTA ── */}
        <LandingSection tone="ice" innerClassName="pb-24 pt-6">
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
        </LandingSection>
      </main>

      {/* ── Footer ── */}
      <footer className="landing-section-sky border-t border-blue-100 px-5 py-10 lg:px-10">
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