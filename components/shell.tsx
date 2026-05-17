"use client";

import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { Bell, Boxes, FilePlus2, LayoutDashboard, Moon, ScanLine, Search, Ship, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import suishipLogo from "@/asset/suiship_logo.png";
import suishipName from "@/asset/suiship_name.png";
import { Logo } from "@/components/logo";
import { useRole } from "@/components/role-context";
import { useInvitations } from "@/lib/notifications";
import { useShipments } from "@/lib/shipments-store";
import { cn, formatAddress } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shipments", label: "Shipments", icon: Ship },
  { href: "/create", label: "Create", icon: FilePlus2 },
  { href: "/customs", label: "Customs", icon: ScanLine }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const account = useCurrentAccount();
  const { role, roles, setRole } = useRole();
  const { shipments } = useShipments();
  const { invitations, unreadCount, markAllRead, markRead } = useInvitations(role, shipments);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!notifRef.current) return;
      if (notifRef.current.contains(event.target as Node)) return;
      setNotifOpen(false);
    }
    if (notifOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
    return;
  }, [notifOpen]);

  return (
    <div className="min-h-screen">
      <aside className="fixed left-0 top-0 z-[60] hidden h-screen w-[240px] overflow-hidden bg-transparent lg:flex lg:flex-col">
        <nav className="relative grid gap-3 px-6 pt-28">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-14 items-center rounded-xl px-3 text-sm font-bold text-steel transition hover:bg-white/35 hover:text-sui",
                  active && "bg-white/45 text-sui"
                )}
                title={item.label}
              >
                <span className="flex min-w-0 flex-1 items-center gap-4">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition", active ? "bg-white/55 text-sui" : "text-sui")}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="relative mt-auto px-7 pb-8">
          {roleMenuOpen && (
            <div className="absolute bottom-24 left-7 right-6 z-20 rounded-2xl border border-white/70 bg-white/88 p-2 shadow-panel backdrop-blur-xl">
              {roles.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setRole(item);
                    setRoleMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-steel transition hover:bg-[#EAF4FF] hover:text-sui",
                    role === item && "bg-[#EAF4FF] text-sui"
                  )}
                >
                  <span className="blue-gradient h-8 w-8 shrink-0 rounded-full" />
                  {item}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setRoleMenuOpen((open) => !open)}
            className="flex h-14 w-full items-center gap-3 rounded-2xl px-2 text-left transition hover:bg-white/35"
            aria-expanded={roleMenuOpen}
          >
            <div className="blue-gradient h-11 w-11 shrink-0 rounded-full" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-pearl">{role}</p>
              <p className="text-xs text-steel">Trade operator</p>
            </div>
          </button>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-[240px]">
        <header className="sticky top-0 z-[70] bg-[#EAF4FF]/60 px-5 py-4 backdrop-blur-xl lg:-ml-[240px] lg:px-8">
          <div className="flex w-full items-center gap-5">
            <div className="hidden lg:block">
              <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="SuiShip home">
                <Image src={suishipLogo} alt="" className="h-12 w-12 shrink-0 object-contain" priority />
                <Image src={suishipName} alt="SuiShip" className="mt-1 h-8 w-auto min-w-[112px] object-contain" priority />
              </Link>
            </div>
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="ml-auto flex w-full items-center gap-3 rounded-full bg-white/88 p-2 shadow-panel backdrop-blur-xl md:max-w-[860px]">
              <label className="hidden h-10 flex-1 items-center gap-2 rounded-full bg-ink px-4 md:flex">
                <Search className="h-4 w-4 text-sui" />
                <input className="w-full bg-transparent text-sm text-pearl outline-none placeholder:text-steel" placeholder="Search" />
              </label>
              <div ref={notifRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((open) => {
                      const next = !open;
                      if (next) markAllRead();
                      return next;
                    });
                  }}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-steel hover:bg-blue-50 hover:text-sui"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-12 z-30 w-[360px] rounded-2xl border border-blue-100 bg-white p-3 shadow-panel">
                    <div className="flex items-center justify-between px-2 pb-2">
                      <p className="text-sm font-extrabold text-pearl">Invitations</p>
                      <span className="text-xs font-bold text-steel">{invitations.length} total</span>
                    </div>
                    {invitations.length === 0 ? (
                      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-steel">
                        No shipment invitations yet. When the {role === "Importer" ? "exporter" : "importer"} starts a
                        shipment with you, it shows up here.
                      </div>
                    ) : (
                      <div className="grid max-h-[400px] gap-2 overflow-y-auto">
                        {invitations.map(({ shipment, unread }) => {
                          const counterparty =
                            role === "Importer" ? shipment.exporter.company : shipment.importer.company;
                          return (
                            <Link
                              key={shipment.id}
                              href={`/shipments/${encodeURIComponent(shipment.id)}`}
                              onClick={() => {
                                markRead([shipment.id]);
                                setNotifOpen(false);
                              }}
                              className={cn(
                                "block rounded-2xl border p-3 transition",
                                unread
                                  ? "border-[#4DA2FF]/40 bg-blue-50 hover:border-[#4DA2FF]"
                                  : "border-blue-100 bg-white hover:bg-blue-50"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="h-3 w-3 text-[#4DA2FF]" />
                                    <p className="truncate text-sm font-extrabold text-pearl">{shipment.id}</p>
                                  </div>
                                  <p className="mt-1 truncate text-xs font-semibold text-steel">
                                    From {counterparty}
                                  </p>
                                  <p className="mt-1 truncate text-xs text-steel">
                                    {shipment.shipment.origin} → {shipment.shipment.destination} ·{" "}
                                    {shipment.cargo.description}
                                  </p>
                                </div>
                                {unread && (
                                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" />
                                )}
                              </div>
                              <p className="mt-2 text-[10px] font-bold uppercase text-steel">{shipment.status}</p>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button className="flex h-10 w-10 items-center justify-center rounded-full text-steel hover:bg-blue-50 hover:text-sui" aria-label="Theme">
                <Moon className="h-5 w-5" />
              </button>
              <div className="hidden items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-steel xl:flex">
                <Boxes className="h-4 w-4 text-sui" />
                <span>Testnet</span>
                <span className="text-pearl">{formatAddress(account?.address)}</span>
              </div>
              <ConnectButton />
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-blue-100 px-4 py-2 lg:hidden">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-w-fit items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-steel",
                    active && "bg-blue-50 text-sui"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
