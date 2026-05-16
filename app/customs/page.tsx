"use client";

import { CheckCircle2, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Panel, RiskBadge, StatusBadge } from "@/components/ui";
import { demoShipments, findShipment } from "@/lib/demo-data";

export default function CustomsPage() {
  const [query, setQuery] = useState("SS-MY-US-0001");
  const shipment = useMemo(() => findShipment(query.trim()), [query]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.25em] text-sui">Customs viewer</p>
        <h1 className="mt-3 text-4xl font-semibold text-pearl">Verify a shipment passport</h1>
        <p className="mt-3 text-steel">Search by shipment ID or Sui object ID to inspect documents, risk, authenticity proof, and clearance readiness.</p>
      </div>

      <Panel className="mt-8">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Scan QR or enter SS-MY-US-0001 / Sui object ID"
            className="min-h-12 w-full rounded-lg border border-white/10 bg-white/6 pl-10 pr-3 text-pearl outline-none focus:border-sui/70"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          {demoShipments.map((item) => (
            <button key={item.id} onClick={() => setQuery(item.id)} className="rounded-lg bg-white/8 px-3 py-2 text-sm text-steel hover:text-pearl">
              {item.id}
            </button>
          ))}
        </div>
      </Panel>

      {shipment ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <Panel>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <p className="text-sm text-steel">{shipment.origin} to {shipment.destination}</p>
                <h2 className="mt-2 text-3xl font-semibold text-pearl">{shipment.id}</h2>
                <p className="mt-2 text-steel">{shipment.cargo}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge value={shipment.status} />
                <RiskBadge value={shipment.riskLevel} />
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-mint/20 bg-mint/10 p-4">
                <ShieldCheck className="h-6 w-6 text-mint" />
                <p className="mt-4 text-3xl font-semibold text-mint">{shipment.aiScore}</p>
                <p className="text-sm text-steel">AI verification score</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/6 p-4">
                <CheckCircle2 className="h-6 w-6 text-sui" />
                <p className="mt-4 text-3xl font-semibold text-pearl">{shipment.documents.length}</p>
                <p className="text-sm text-steel">Verified document hashes</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/6 p-4">
                <ShieldAlert className="h-6 w-6 text-amber" />
                <p className="mt-4 text-lg font-semibold text-pearl">{shipment.riskLevel}</p>
                <p className="text-sm text-steel">Risk summary</p>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-white/10 bg-white/6 p-5">
              <h3 className="font-semibold text-pearl">Authenticity proof</h3>
              <p className="mt-3 text-sm leading-6 text-steel">
                Document payloads remain off-chain. The passport stores hashes and Walrus-style URIs, allowing customs and brokers to verify that presented documents match the anchored Sui object.
              </p>
              <p className="mt-4 break-all rounded-lg bg-black/20 p-3 text-xs text-sui">Object ID: {shipment.objectId}</p>
            </div>

            <div className="mt-6 grid gap-3">
              {shipment.documents.map((document) => (
                <div key={document.hash} className="rounded-lg border border-white/10 bg-white/6 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-pearl">{document.name}</p>
                      <p className="text-sm text-steel">{document.storageUri}</p>
                    </div>
                    <StatusBadge value="Verified" />
                  </div>
                  <p className="mt-3 break-all text-xs text-steel">{document.hash}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="h-fit">
            <h2 className="text-xl font-semibold text-pearl">Clearance decision</h2>
            <div className="mt-5 space-y-3">
              {["Required documents complete", "Invoice quantity matches packing list", "HS code format valid", "Origin route rules satisfied"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg bg-white/6 p-3 text-sm text-pearl">
                  <CheckCircle2 className="h-4 w-4 text-mint" />
                  {item}
                </div>
              ))}
            </div>
            <Link href={`/shipments/${shipment.id}`} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pearl px-4 py-2 text-sm font-semibold text-ink hover:bg-sui">
              Open full passport
            </Link>
          </Panel>
        </div>
      ) : (
        <Panel className="mt-6">
          <p className="text-pearl">No passport found.</p>
          <p className="mt-2 text-sm text-steel">Try a demo ID above or paste a known Sui object ID after minting.</p>
        </Panel>
      )}
    </div>
  );
}
