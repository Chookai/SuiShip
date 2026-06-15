"use client";

import { FilePlus2, Loader2, Search, Ship, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Panel, StatusBadge } from "@/components/ui";
import { useShipments } from "@/lib/shipments-store";

export default function ShipmentsPage() {
  const { shipments, ready, removeShipment } = useShipments();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const statusOptions = useMemo(() => {
    const set = new Set<string>(["All"]);
    shipments.forEach((shipment) => set.add(shipment.status));
    return Array.from(set);
  }, [shipments]);

  const visibleShipments = useMemo(() => {
    const filtered = shipments.filter((shipment) => {
      if (shipment.status === "Draft") return false;
      const haystack = `${shipment.id} ${shipment.extractedRef ?? ""} ${shipment.importer.company} ${shipment.exporter.company} ${shipment.shipment.origin} ${shipment.shipment.destination} ${shipment.status}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      const matchesStatus = statusFilter === "All" || shipment.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted;
  }, [shipments, query, statusFilter]);

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-pearl">Shipments</h1>
        </div>
        <Link
          href="/create"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#4DA2FF] px-4 py-2 text-sm font-bold text-white shadow-glow"
        >
          <FilePlus2 className="h-4 w-4" />
          Create shipment
        </Link>
      </div>

      <Panel className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4DA2FF]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shipment, exporter, importer, route, or status"
              className="min-h-12 w-full rounded-2xl border border-blue-100 bg-white pl-11 pr-4 text-pearl outline-none focus:border-[#4DA2FF]"
            />
          </label>
          <label className="grid w-full shrink-0 gap-1 text-xs font-bold uppercase text-steel sm:w-48">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-12 rounded-2xl border border-blue-100 bg-white px-3 text-sm font-semibold normal-case text-pearl outline-none focus:border-[#4DA2FF]"
            >
              {statusOptions.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      <Panel className="mt-6">
        <h2 className="mb-5 text-xl font-extrabold text-pearl">Shipment List</h2>

        {!ready ? (
          <EmptyState title="Loading shipments..." description="Reading your local shipment store." />
        ) : shipments.length === 0 ? (
          <EmptyState
            title="No shipments yet"
            action={
              <Link href="/create">
                <Button>
                  <FilePlus2 className="h-4 w-4" />
                  Create a shipment
                </Button>
              </Link>
            }
          />
        ) : visibleShipments.length === 0 ? (
          <EmptyState
            title="No shipments match your filters"
            description="Try clearing the search or status filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-blue-50 text-xs font-bold uppercase text-steel">
                  {[
                    "Shipment ID",
                    "Exporter",
                    "Importer",
                    "Route",
                    "ETA",
                    "Status",
                    "Last Updated",
                    ""
                  ].map((head) => (
                    <th key={head || "actions"} className="pb-3 pr-4">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50">
                {visibleShipments.map((shipment) => (
                    <tr key={shipment.id} className="align-top">
                      <td className="py-4 pr-4 font-extrabold text-pearl">
                        <Link href={`/shipments/${encodeURIComponent(shipment.id)}`} className="hover:text-[#4DA2FF]">
                          {shipment.id}
                        </Link>
                        {shipment.extractionStatus === "extracting" && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-[#4DA2FF]">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            AI extracting...
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-steel">{shipment.exporter.company}</td>
                      <td className="py-4 pr-4 text-steel">{shipment.importer.company}</td>
                      <td className="py-4 pr-4 text-steel">
                        {shipment.shipment.origin} {"->"} {shipment.shipment.destination}
                      </td>
                      <td className="py-4 pr-4 text-steel">{shipment.shipment.eta || "-"}</td>
                      <td className="py-4 pr-4">
                        <StatusBadge value={shipment.status} />
                      </td>
                      <td className="py-4 pr-4 text-xs text-steel">{formatRelative(shipment.updatedAt)}</td>
                      <td className="py-4 pr-4 text-right">
                        <button
                          onClick={() => removeShipment(shipment.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-500 hover:bg-red-100"
                          title="Delete shipment"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-blue-100 bg-blue-50 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
        <Ship className="h-6 w-6 text-[#4DA2FF]" />
      </span>
      <div>
        <h3 className="text-xl font-extrabold text-pearl">{title}</h3>
        {description && <p className="mt-2 max-w-md text-sm text-steel">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function formatRelative(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
