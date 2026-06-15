import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import memwalLogo from "@/asset/memwal_logo.svg";
import sealLogo from "@/asset/seal_logo.svg";
import suiLogo from "@/asset/sui_logo.svg";
import suishipLogo from "@/asset/suiship_logo.png";
import suishipName from "@/asset/suiship_name.png";
import walrusLogo from "@/asset/walrus_logo.svg";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "SuiShip | Market & Revenue",
  description: "Market size, potential, and revenue streams for SuiShip.",
};

const painStats = [
  { stat: "$42B+", label: "Trade-finance fraud, every year" },
  { stat: "$2.5T", label: "Global trade-finance gap (ADB)" },
  { stat: "5–7 days", label: "Average customs clearance delay" },
] as const;

const marketTiers = [
  {
    ring: "TAM",
    value: "$54B",
    desc: "Trade-finance + supply-chain software & trade-document digitization — the annual software spend, growing ~11% CAGR.",
    cardClass: "bg-gradient-to-br from-[#1e6fd9] to-[#4da2ff] text-white border-transparent shadow-[0_26px_60px_rgba(30,111,217,0.28)]",
    ringClass: "text-white/85",
    valueClass: "text-white",
    descClass: "text-white/90",
  },
  {
    ring: "SAM",
    value: "$9B",
    desc: "AI + blockchain trade-document verification & risk for exporters, forwarders, importers and banks.",
    cardClass: "bg-[#dceeff] border-[#c4e0ff]",
    ringClass: "text-sui",
    valueClass: "text-[#1e90ff]",
    descClass: "text-pearl",
  },
  {
    ring: "SOM",
    value: "$250M",
    desc: "Near-term reachable: Sui-ecosystem exporters & forwarders plus trade-finance pilots, testnet → mainnet.",
    cardClass: "bg-white border-blue-100",
    ringClass: "text-sui",
    valueClass: "text-sui",
    descClass: "text-steel",
  },
] as const;

const revenueStreams = [
  { ico: "🛂", title: "Per-shipment passport", line: "A usage fee for every ShipmentPassport minted on Sui.", price: "$5–25 / shipment" },
  { ico: "🧭", title: "SaaS workspace", line: "Per-company & per-seat tiers for the multi-agent console.", price: "subscription" },
  { ico: "🧠", title: "Memory-as-a-Service", line: "Builders meter MemWal recall into their own agents.", price: "per API call" },
  { ico: "🛡️", title: "Risk & compliance", line: "Premium trade-finance risk agent for banks.", price: "per-scan / enterprise" },
  { ico: "🔗", title: "Verification network", line: "Banks & customs pay to verify passports.", price: "take-rate on value" },
] as const;

const x402Steps = [
  { ico: "🛂", title: "Request inspections", line: "As each shipment reaches the border, agents request inspections straight from the passport." },
  { ico: "🔓", title: "Unlock verified data", line: "x402 unlocks the verified document set on demand — paid per request, revealing only what customs needs." },
  { ico: "💸", title: "Settle fees automatically", line: "Clearance or verification fees settle automatically, so compliance, payments, and trust move together." },
] as const;

const poweredBy = [
  { src: suiLogo, alt: "Sui", className: "h-7 md:h-8" },
  { src: walrusLogo, alt: "Walrus", className: "h-6 md:h-7" },
  { src: sealLogo, alt: "SEAL", className: "h-5 md:h-6" },
  { src: memwalLogo, alt: "MemWal", className: "h-5 md:h-[22px]" },
] as const;

const cardBase =
  "rounded-[2rem] border bg-white p-7 shadow-[0_24px_60px_rgba(77,162,255,0.10)]";
const eyebrow =
  "text-center font-mono text-xs font-bold uppercase tracking-[0.2em] text-steel";
const headline =
  "mt-4 text-center text-3xl font-extrabold uppercase tracking-tight text-pearl md:text-4xl";

export default function MarketPage() {
  return (
    <div className="marketing-site-scale min-h-screen bg-[#f8fbff]">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pb-28 pt-14 lg:px-8">
        {/* ── Hero ── */}
        <header className="text-center">
          <div className="flex items-center justify-center gap-4">
            <Image src={suishipLogo} alt="" className="h-14 w-14 object-contain" priority />
            <Image src={suishipName} alt="SuiShip" className="mt-1 h-9 w-auto object-contain" priority />
          </div>
          <span className="mt-6 inline-block rounded-full border border-sui/20 bg-sui/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#1e90ff]">
            market &amp; model · v2.0
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight text-pearl md:text-6xl">
            The trade documents are <span className="text-[#d64545]">broken</span>.
            <br />
            The market to fix them isn’t.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-steel md:text-lg">
            Memory-native agents that verify global trade — here’s the size of the opportunity and how
            SuiShip earns from it.
          </p>
        </header>

        {/* ── 1. The pain ── */}
        <section className="mt-20">
          <p className={eyebrow}>The pain we sell into</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {painStats.map((s) => (
              <div key={s.stat} className="rounded-[2rem] border border-[#f5d0d0] bg-white p-7 shadow-[0_20px_50px_rgba(214,69,69,0.08)]">
                <p className="text-4xl font-extrabold tracking-tight text-[#d64545] md:text-5xl">{s.stat}</p>
                <p className="mt-3 text-base font-bold text-pearl">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 2. Market size ── */}
        <section className="mt-20">
          <p className={eyebrow}>Market size</p>
          <h2 className={headline}>A $54B software market, wide open</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {marketTiers.map((t) => (
              <div key={t.ring} className={`rounded-[2rem] border p-7 ${t.cardClass}`}>
                <p className={`font-mono text-xs font-bold uppercase tracking-[0.18em] ${t.ringClass}`}>{t.ring}</p>
                <p className={`mt-2 text-5xl font-extrabold tracking-tight ${t.valueClass}`}>{t.value}</p>
                <p className={`mt-4 text-sm leading-6 ${t.descClass}`}>{t.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center font-mono text-[11px] tracking-[0.08em] text-steel">
            SOURCES · WTO · ADB · ICC · MarketsandMarkets — illustrative estimates
          </p>
        </section>

        {/* ── 3. Why now ── */}
        <section className="mt-20">
          <p className={eyebrow}>Why now</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-7 rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white to-[#eef6ff] p-9 shadow-[0_24px_60px_rgba(77,162,255,0.10)]">
            <div className="text-4xl font-extrabold tracking-tight md:text-5xl">
              <span className="text-steel">$3B</span> <span className="text-pearl">→</span>{" "}
              <span className="text-[#10b981]">$100B+</span>
              <span className="mt-2 block font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#1e90ff]">
                blockchain in supply chain · by 2032 · ~45% CAGR
              </span>
            </div>
            <p className="min-w-[260px] flex-1 text-lg font-semibold leading-7 text-pearl">
              AI agents + <span className="text-[#1e90ff]">verifiable memory</span> make trade documents
              trustless for the first time — exactly as the market for on-chain supply chain breaks out.
            </p>
          </div>
        </section>

        {/* ── 4. Revenue streams ── */}
        <section className="mt-20">
          <p className={eyebrow}>How SuiShip earns</p>
          <h2 className={headline}>Five revenue streams</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {revenueStreams.map((r) => (
              <div key={r.title} className={cardBase + " border-blue-100 p-6"}>
                <div className="text-3xl leading-none">{r.ico}</div>
                <h3 className="mt-3.5 text-base font-extrabold tracking-tight text-pearl">{r.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-steel">{r.line}</p>
                <span className="mt-3 inline-block rounded-lg bg-sui/10 px-2.5 py-1 font-mono text-[11px] font-bold text-[#1e90ff]">
                  {r.price}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 5. Future development · x402 ── */}
        <section className="mt-20">
          <p className={eyebrow}>Future development</p>
          <h2 className={headline}>x402: passport → customs clearance</h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-7 text-steel md:text-lg">
            Looking ahead, x402 extends the shipment passport into clearance itself — so SuiShip isn’t just
            digitizing documents, it’s laying the foundation for trade infrastructure where{" "}
            <span className="font-semibold text-pearl">compliance, payments, and trust move together in real time.</span>
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {x402Steps.map((step, i) => (
              <div key={step.title} className={cardBase + " border-blue-100 p-6"}>
                <div className="flex items-center justify-between">
                  <div className="text-3xl leading-none">{step.ico}</div>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-steel">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-3.5 text-base font-extrabold tracking-tight text-pearl">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-steel">{step.line}</p>
                <span className="mt-3 inline-block rounded-lg bg-sui/10 px-2.5 py-1 font-mono text-[11px] font-bold text-[#1e90ff]">
                  x402 · coming soon
                </span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-steel">
            See where it plugs in today —{" "}
            <Link href="/customs" className="font-semibold text-[#1e90ff] hover:underline">
              the clearance viewer
            </Link>{" "}
            x402 would automate.
          </p>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-24 flex flex-col items-center gap-6 border-t border-black/5 pt-10 text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-steel">
            Powered by the Sui stack
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {poweredBy.map((logo) => (
              <Image
                key={logo.alt}
                src={logo.src}
                alt={logo.alt}
                className={`w-auto object-contain opacity-70 transition hover:opacity-100 ${logo.className}`}
              />
            ))}
          </div>
          <Link
            href="/"
            className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#1e90ff] hover:underline"
          >
            Back to home
            <ArrowRight className="h-4 w-4" />
          </Link>
        </footer>
      </main>
    </div>
  );
}
