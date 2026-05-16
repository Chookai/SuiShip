import { ArrowRight, BrainCircuit, CheckCircle2, Database, FileCheck2, Globe2, LockKeyhole, Route } from "lucide-react";
import { LinkButton, Panel, RiskBadge, StatusBadge } from "@/components/ui";
import { demoShipments } from "@/lib/demo-data";

const modules = [
  { icon: FileCheck2, title: "AI document intake", body: "Extracts invoice, packing, HS, origin, value, and consignee fields from trade documents." },
  { icon: LockKeyhole, title: "Sui passport anchor", body: "Mints a shared shipment object with immutable hashes, storage URIs, risk score, and status." },
  { icon: Database, title: "Walrus-ready storage", body: "Keeps PDFs off-chain while anchoring verifiable document references on Sui." },
  { icon: BrainCircuit, title: "memWal learning loop", body: "Shows how corrections, templates, routes, and fraud patterns become reusable memory." }
];

export default function LandingPage() {
  const featured = demoShipments[0];

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
            SuiShip turns fragmented shipping paperwork into one AI-verified, blockchain-backed digital passport for every shipment.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/create">
              Create Passport <ArrowRight className="h-4 w-4" />
            </LinkButton>
            <LinkButton href="/shipments/SS-MY-US-0001" variant="secondary">
              View Demo Shipment
            </LinkButton>
          </div>
        </div>

        <Panel className="relative overflow-hidden p-0">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-steel">Live passport preview</p>
                <h2 className="mt-1 text-2xl font-semibold text-pearl">{featured.id}</h2>
              </div>
              <StatusBadge value={featured.status} />
            </div>
          </div>
          <div className="p-5">
            <div className="relative my-8 flex items-center justify-between">
              <span className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm text-pearl">{featured.origin}</span>
              <span className="route-line absolute left-20 right-20 top-1/2 h-px" />
              <Route className="relative z-10 h-8 w-8 rounded-full border border-sui/30 bg-ink p-1.5 text-sui" />
              <span className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm text-pearl">{featured.destination}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Cargo", featured.cargo],
                ["Carrier", featured.carrier],
                ["Object", featured.objectId],
                ["Documents", `${featured.documents.length} anchored`]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase text-steel">{label}</p>
                  <p className="mt-2 text-sm font-medium text-pearl">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-lg border border-mint/20 bg-mint/10 p-4">
              <div>
                <p className="text-sm font-medium text-pearl">AI verification score</p>
                <p className="text-sm text-steel">Invoice, HS code, origin, and packing list aligned</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold text-mint">{featured.aiScore}</p>
                <RiskBadge value={featured.riskLevel} />
              </div>
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
          {["Create shipment", "Run AI verification", "Mint Sui passport"].map((step, index) => (
            <div key={step} className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/6 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-pearl text-sm font-semibold text-ink">{index + 1}</span>
              <div>
                <h3 className="font-semibold text-pearl">{step}</h3>
                <p className="text-sm text-steel">{index === 0 ? "Capture trade parties, route, value, and docs." : index === 1 ? "Mock extraction and compliance checks." : "Wallet signs a Sui Move call."}</p>
              </div>
              <CheckCircle2 className="ml-auto h-5 w-5 text-mint" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
