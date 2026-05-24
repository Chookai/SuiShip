"use client";

import { AlertTriangle, BadgeCheck, CalendarDays, FileCheck2, PackageCheck, Plus, Ship } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useRole } from "@/components/role-context";
import { LinkButton, Panel } from "@/components/ui";
import { useShipments } from "@/lib/shipments-store";
import { cn } from "@/lib/utils";


export default function DashboardPage() {
  const { role, profile } = useRole();
  const { shipments } = useShipments();
  const mySide = role === "Importer" ? "importer" : "exporter";

  const myShipments = useMemo(() => {
    return shipments.filter((shipment) => {
      return (
        shipment.workflow === mySide ||
        shipment.createdBy === mySide ||
        (mySide === "importer" && (shipment.importer.email === profile.email || shipment.importer.company === profile.company)) ||
        (mySide === "exporter" && (shipment.exporter.email === profile.email || shipment.exporter.company === profile.company))
      );
    });
  }, [shipments, mySide, profile.email, profile.company]);

  const requiredDocsTotal = myShipments.reduce((total, shipment) => total + shipment.documents.filter((doc) => doc.required).length, 0);
  const uploadedDocsTotal = myShipments.reduce((total, shipment) => total + shipment.documents.filter((doc) => doc.required && doc.uploaded).length, 0);
  const pendingDocs = Math.max(requiredDocsTotal - uploadedDocsTotal, 0);
  const verifiedCount = myShipments.filter((shipment) => shipment.ai && shipment.ai.score >= 85).length;
  const readyCount = myShipments.filter((shipment) => shipment.status === "AI Verified" || shipment.status === "Customs Package Generated").length;
  const atRiskCount = myShipments.filter((shipment) => shipment.ai?.riskLevel === "High" || shipment.ai?.riskLevel === "Medium").length;
  const arrivingThisWeek = myShipments.filter((shipment) => {
    const eta = new Date(shipment.shipment.eta);
    const now = new Date();
    const diff = eta.getTime() - now.getTime();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  const summary = [
    { label: "Total Active Shipments", value: String(myShipments.length), tone: "blue", icon: Ship },
    { label: "Documents Pending", value: String(pendingDocs), tone: "orange", icon: FileCheck2 },
    { label: "AI Verified Shipments", value: String(verifiedCount), tone: "plain", icon: BadgeCheck },
    { label: role === "Importer" ? "Ready for Approval" : "Ready for Importer Review", value: String(readyCount), tone: "plain", icon: PackageCheck },
    { label: "Delayed / At Risk", value: String(atRiskCount), tone: "red", icon: AlertTriangle },
    { label: "Arriving This Week", value: String(arrivingThisWeek), tone: "plain", icon: CalendarDays }
  ];

  const issuesFromShipments = myShipments
    .filter((shipment) => shipment.status !== "Customs Package Generated" || shipment.ai?.riskLevel === "High" || shipment.ai?.riskLevel === "Medium")
    .slice(0, 3)
    .map((shipment) => ({
      id: shipment.id,
      exporter: shipment.exporter.company,
      importer: shipment.importer.company,
      route: `${shipment.shipment.origin.slice(0, 2).toUpperCase()} -> ${shipment.shipment.destination.slice(0, 2).toUpperCase()}`,
      issue: shipment.ai?.checks?.find((check) => check.status === "mismatch" || check.status === "missing")?.detail || (role === "Importer" ? "Needs approval or document review" : "Importer review pending"),
      risk: `${shipment.ai?.riskLevel || "Medium"} Risk`,
      action: role === "Importer" ? "Review" : "Update"
    }));
  const priorityIssues = issuesFromShipments;
  const recentShipments = myShipments.slice(0, 6);

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-pearl">Dashboard</h1>
          <p className="mt-3 max-w-2xl text-steel">
            Shipment workspace for {profile.company} as {role}.
          </p>
        </div>
        <LinkButton href="/create">
          <Plus className="h-4 w-4" />
          Create shipment
        </LinkButton>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3 min-[1180px]:grid-cols-6">
        {summary.map((item) => {
          const highlighted = item.tone !== "plain";
          const Icon = item.icon;
          return (
            <Panel
              key={item.label}
              className={cn(
                "relative aspect-square overflow-hidden !p-4",
                item.tone === "blue" && "!border-transparent !bg-[#4DA2FF] shadow-glow",
                item.tone === "orange" && "!border-transparent ![background:linear-gradient(135deg,#FFB454_0%,#FF8A3D_100%)] shadow-[0_18px_60px_rgba(255,138,61,0.22)]",
                item.tone === "red" && "!border-transparent ![background:linear-gradient(135deg,#FF6B6B_0%,#E94343_100%)] shadow-[0_18px_60px_rgba(233,67,67,0.22)]"
              )}
            >
              <div className="relative z-10 flex h-full flex-col">
                <p className={cn("min-h-11 max-w-[8.5rem] text-xs font-bold leading-tight min-[1360px]:text-sm", highlighted ? "text-white/85" : "text-steel")}>{item.label}</p>
                <p className={cn("mt-4 text-4xl font-extrabold tracking-tight min-[1360px]:mt-5 min-[1360px]:text-5xl", highlighted ? "text-white" : "text-pearl")}>{item.value}</p>
              </div>
              {item.tone === "blue" ? (
                <svg aria-hidden="true" viewBox="0 0 160 120" className="absolute bottom-1 right-0 h-20 w-24 text-white/35 min-[1360px]:bottom-2 min-[1360px]:right-2 min-[1360px]:h-28 min-[1360px]:w-32" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">
                  <path d="M66 20c24 20 42 38 55 60l-48 11c5-24 3-47-7-71Z" />
                  <path d="M64 23c8 31 3 55-17 72" />
                  <path d="M28 78h100l-14 22H49L28 78Z" />
                  <path d="M17 104c8-8 17-8 26 0s18 8 27 0 18-8 27 0 18 8 27 0" />
                </svg>
              ) : (
                <Icon aria-hidden="true" className={cn("absolute bottom-3 right-3 h-20 w-20 stroke-[1.25] min-[1360px]:h-24 min-[1360px]:w-24", highlighted ? "text-white/25" : "text-[#4DA2FF]/15")} />
              )}
            </Panel>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6">
        <div className="grid gap-6">
          <Panel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold text-[#4DA2FF]">Attention Required</p>
                <h2 className="mt-1 text-2xl font-extrabold text-pearl">Shipments with problems</h2>
              </div>
              <Link href="/shipments?filter=attention" className="w-fit rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-500 transition hover:bg-red-100">
                View more
              </Link>
            </div>
            <div className="mt-6 grid gap-3">
              {priorityIssues.length === 0 ? (
                <div className="rounded-2xl bg-ink p-4 text-sm text-steel">
                  No shipments with problems. Create a shipment to start tracking.
                </div>
              ) : (
                priorityIssues.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-ink p-4 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-extrabold text-pearl">{item.id}</p>
                          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", item.risk === "High Risk" && "bg-red-50 text-red-500", item.risk === "Medium Risk" && "bg-orange-50 text-orange-500", item.risk === "Low Risk" && "bg-emerald-50 text-emerald-500")}>{item.risk}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-pearl">{item.exporter} {"->"} {item.importer}</p>
                        <p className="mt-1 text-sm text-steel">{item.route} · {item.issue}</p>
                      </div>
                      <button className="w-fit rounded-full bg-[#4DA2FF] px-4 py-2 text-xs font-extrabold text-white shadow-glow transition hover:bg-[#2F8FFF]">
                        {item.action}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <Panel>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#4DA2FF]">Recent Shipments</p>
              <h2 className="mt-1 text-2xl font-extrabold text-pearl">Latest created and updated passports</h2>
            </div>
            <Link href="/create" className="flex w-fit items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#4DA2FF] transition hover:bg-[#4DA2FF] hover:text-white">
              New shipment
            </Link>
          </div>
          {recentShipments.length === 0 ? (
            <div className="mt-6 rounded-2xl bg-ink p-6 text-sm text-steel">
              No shipments yet. Create your first shipment to see live workspace data.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[940px] text-left text-sm">
                <thead>
                  <tr className="border-b border-blue-50 text-xs font-bold uppercase text-steel">
                    <th className="pb-3">Shipment ID</th>
                    <th className="pb-3">Exporter</th>
                    <th className="pb-3">Importer</th>
                    <th className="pb-3">Origin</th>
                    <th className="pb-3">Destination</th>
                    <th className="pb-3">Mode</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">ETA</th>
                    <th className="pb-3 text-right">AI Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {recentShipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td className="py-4 font-extrabold text-pearl">
                        <Link href={`/shipments/${encodeURIComponent(shipment.id)}`} className="hover:text-[#4DA2FF]">{shipment.id}</Link>
                      </td>
                      <td className="py-4 font-semibold text-pearl">{shipment.exporter.company}</td>
                      <td className="py-4 font-semibold text-pearl">{shipment.importer.company}</td>
                      <td className="py-4 text-steel">{shipment.shipment.origin}</td>
                      <td className="py-4 text-steel">{shipment.shipment.destination}</td>
                      <td className="py-4 text-steel">{shipment.shipment.transportMode}</td>
                      <td className="py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-steel">{shipment.status}</span></td>
                      <td className="py-4 text-steel">{shipment.shipment.eta}</td>
                      <td className="py-4 text-right font-extrabold text-pearl">{shipment.ai?.score || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
