"use client";

import { ArrowUpRight, CalendarDays, FileCheck2, Filter, Globe2, Plus, Search, ShieldCheck, Ship, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Panel, RiskBadge, StatusBadge, LinkButton } from "@/components/ui";
import { demoShipments } from "@/lib/demo-data";

const filters = ["All", "Customs Ready", "Needs Review", "Documents Uploaded", "Customs Cleared"];

export default function DashboardPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");

  const shipments = useMemo(() => {
    return demoShipments.filter((shipment) => {
      const matchesFilter = filter === "All" || shipment.status === filter;
      const haystack = `${shipment.id} ${shipment.shipper} ${shipment.consignee} ${shipment.origin} ${shipment.destination}`.toLowerCase();
      return matchesFilter && haystack.includes(query.toLowerCase());
    });
  }, [filter, query]);

  const primary = demoShipments[0];

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end lg:hidden">
        <div>
          <p className="text-sm font-bold text-sui">Dashboards / Default</p>
          <h1 className="mt-3 text-4xl font-extrabold text-pearl">Main Dashboard</h1>
          <p className="mt-3 max-w-2xl text-steel">Monitor AI verification, risk, document hashes, and Sui object references across active shipments.</p>
        </div>
        <LinkButton href="/create">
          <Plus className="h-4 w-4" />
          Create shipment
        </LinkButton>
      </div>

      <div className="hidden items-end justify-between lg:flex">
        <div>
          <p className="text-sm font-bold text-sui">Dashboards / Default</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-pearl">Main Dashboard</h1>
        </div>
        <LinkButton href="/create">
          <Plus className="h-4 w-4" />
          Create shipment
        </LinkButton>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="grid gap-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel className="blue-gradient text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-white/80">Verified Passports</p>
                  <p className="mt-3 text-4xl font-extrabold">{demoShipments.length}</p>
                </div>
                <ShieldCheck className="h-7 w-7 text-white/90" />
              </div>
              <div className="mt-8 h-20 rounded-2xl border border-white/20 bg-white/10 p-3">
                <div className="flex h-full items-end gap-3">
                  {[54, 72, 48, 88, 64, 96, 42].map((height, index) => (
                    <span key={index} className="w-full rounded-t-full bg-white/75" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-steel">Customs ready</p>
                  <p className="mt-3 text-4xl font-extrabold text-pearl">1</p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
                  <FileCheck2 className="h-6 w-6 text-sui" />
                </span>
              </div>
              <div className="mt-8 h-2 rounded-full bg-blue-50">
                <div className="h-2 w-[71%] rounded-full bg-sui" />
              </div>
              <p className="mt-4 text-sm text-steel">71% operational readiness across demo shipments</p>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-steel">Risk estimate</p>
                  <p className="mt-3 text-4xl font-extrabold text-pearl">Low</p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
                  <Globe2 className="h-6 w-6 text-emerald-500" />
                </span>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-blue-50 p-4">
                  <p className="text-sm text-steel">AI avg</p>
                  <p className="mt-1 text-xl font-extrabold text-pearl">88.6%</p>
                </div>
                <div className="rounded-2xl bg-blue-50 p-4">
                  <p className="text-sm text-steel">Docs</p>
                  <p className="mt-1 text-xl font-extrabold text-pearl">8</p>
                </div>
              </div>
            </Panel>
          </div>

          <Panel>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-sui" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by shipment ID, route, shipper, or consignee"
                  className="min-h-12 w-full rounded-2xl border border-blue-100 bg-ink pl-11 pr-3 text-pearl outline-none focus:border-sui/70"
                />
              </label>
              <div className="flex items-center gap-2 overflow-x-auto">
                <Filter className="h-4 w-4 text-steel" />
                {filters.map((item) => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`min-w-fit rounded-2xl px-3 py-2 text-sm font-semibold transition ${filter === item ? "blue-gradient text-white shadow-glow" : "bg-blue-50 text-steel hover:text-sui"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            {shipments.map((shipment) => (
              <Link key={shipment.id} href={`/shipments/${shipment.id}`} className="group rounded-[1.6rem] border border-blue-100 bg-white p-6 shadow-panel transition hover:-translate-y-0.5 hover:border-sui/35">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-steel">{shipment.origin} to {shipment.destination}</p>
                    <h2 className="mt-2 text-xl font-extrabold text-pearl">{shipment.id}</h2>
                  </div>
                  <RiskBadge value={shipment.riskLevel} />
                </div>
                <p className="mt-5 text-sm text-steel">{shipment.cargo}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <StatusBadge value={shipment.status} />
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-steel">{shipment.aiScore}% AI score</span>
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-steel">{shipment.documents.length} docs</span>
                </div>
                <div className="mt-5 border-t border-blue-50 pt-4 text-sm text-steel">
                  <p>Object: <span className="text-pearl">{shipment.objectId}</span></p>
                  <p className="mt-1">Carrier: <span className="text-pearl">{shipment.carrier}</span></p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="grid h-fit gap-6">
          <Panel>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-pearl">Featured Passport</h2>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
                <Plus className="h-5 w-5 text-sui" />
              </span>
            </div>
            <div className="blue-gradient mt-7 rounded-[1.4rem] p-6 text-white shadow-glow">
              <p className="text-sm font-semibold text-white/80">Shipment Passport</p>
              <p className="mt-5 text-2xl font-extrabold">{primary.id}</p>
              <div className="mt-8 grid grid-cols-2 gap-5 text-sm">
                <div>
                  <p className="text-white/70">Origin</p>
                  <p className="font-bold">{primary.origin}</p>
                </div>
                <div>
                  <p className="text-white/70">Destination</p>
                  <p className="font-bold">{primary.destination}</p>
                </div>
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-blue-50 p-5">
              <p className="font-bold text-sui">Blockchain proof online</p>
              <p className="mt-2 text-sm leading-6 text-steel">Document hashes and Walrus-style references are visible for judges without turning the UI into a crypto terminal.</p>
            </div>
          </Panel>

          <Panel>
            <h2 className="text-xl font-extrabold text-pearl">Recent activity</h2>
            <div className="mt-5 grid gap-4">
              {demoShipments.map((shipment) => (
                <Link href={`/shipments/${shipment.id}`} key={shipment.id} className="flex items-center gap-4 rounded-2xl bg-ink p-3 transition hover:bg-blue-50">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Ship className="h-5 w-5 text-sui" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-pearl">{shipment.cargo}</p>
                    <p className="text-sm text-steel">{shipment.updatedAt}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-steel" />
                </Link>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-pearl">Demo network</h2>
              <CalendarDays className="h-5 w-5 text-sui" />
            </div>
            <div className="mt-5 flex items-center gap-4 rounded-2xl bg-ink p-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                <WalletCards className="h-5 w-5 text-sui" />
              </span>
              <div>
                <p className="font-bold text-pearl">Sui testnet ready</p>
                <p className="text-sm text-steel">Publish package to enable live minting</p>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
