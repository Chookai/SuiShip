"use client";

import { Activity, Bell, BrainCircuit, ChevronsUpDown, FilePlus2, LayoutDashboard, Moon, ShieldAlert, Ship, Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import suishipLogo from "@/asset/suiship_logo.png";
import suishipName from "@/asset/suiship_name.png";
import { Logo } from "@/components/logo";
import { useRole } from "@/components/role-context";
import { useInvitations } from "@/lib/notifications";
import { useShipments } from "@/lib/shipments-store";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shipments", label: "Shipments", icon: Ship },
  { href: "/create", label: "Create", icon: FilePlus2 },
  { href: "/memory", label: "Memory", icon: BrainCircuit },
  { href: "/risk-memory", label: "Risk Memory", icon: ShieldAlert },
  { href: "/persistent-agent", label: "Persistent Agent", icon: Activity },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, roles, setRole, profile, profiles } = useRole();
  const { shipments } = useShipments();
  const { invitations, unreadCount, markAllRead, markRead } = useInvitations(role, shipments);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (notifRef.current?.contains(target)) return;
      if (accountRef.current?.contains(target)) return;
      setNotifOpen(false);
      setRoleMenuOpen(false);
    }
    if (notifOpen || roleMenuOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
    return;
  }, [notifOpen, roleMenuOpen]);

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
                  "flex h-14 items-center rounded-xl px-3 text-sm font-bold text-steel transition hover:bg-white/35 hover:text-sui dark:hover:bg-sui/10",
                  active && "bg-white/45 text-sui dark:bg-sui/15"
                )}
                title={item.label}
              >
                <span className="flex min-w-0 flex-1 items-center gap-4">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition", active ? "bg-white/55 text-sui dark:bg-sui/20" : "text-sui")}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 lg:pl-[240px]">
        <header className="sticky top-0 z-[70] bg-[#EAF4FF]/60 px-5 py-4 backdrop-blur-xl dark:bg-ink/80 lg:-ml-[240px] lg:px-8">
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
            <div className="ml-auto flex items-center gap-2">
              <div ref={notifRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setRoleMenuOpen(false);
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
                  <div className="absolute right-0 top-12 z-30 w-[360px] rounded-2xl border border-blue-100 bg-white p-3 shadow-panel dark:border-slate-700 dark:bg-midnight">
                    <div className="flex items-center justify-between px-2 pb-2">
                      <p className="text-sm font-extrabold text-pearl">Invitations</p>
                      <span className="text-xs font-bold text-steel">{invitations.length} total</span>
                    </div>
                    {invitations.length === 0 ? (
                      <div className="rounded-2xl bg-blue-50 p-4 text-sm text-steel dark:bg-ink">
                        No shipment invitations yet. When a trade party starts a shipment involving you, it shows up
                        here.
                      </div>
                    ) : (
                      <div className="grid max-h-[400px] gap-2 overflow-y-auto">
                        {invitations.map(({ shipment, unread }) => {
                          const counterparty =
                            role === "Importer"
                              ? shipment.exporter.company
                              : role === "Exporter"
                                ? shipment.importer.company
                                : shipment.freightForwarder || shipment.exporter.company;
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
                                  ? "border-[#4DA2FF]/40 bg-blue-50 hover:border-[#4DA2FF] dark:bg-ink dark:hover:border-sui"
                                  : "border-blue-100 bg-white hover:bg-blue-50 dark:border-slate-700 dark:bg-midnight dark:hover:bg-ink"
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
              <button
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-steel transition-colors hover:bg-midnight hover:text-sui"
                aria-label="Toggle theme"
              >
                {mounted && resolvedTheme === "dark" ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </button>
              <div ref={accountRef} className="relative">
                {roleMenuOpen && (
                  <div className="absolute right-0 top-12 z-30 w-[280px] rounded-2xl border border-blue-100 bg-white p-2 shadow-panel dark:border-slate-700 dark:bg-midnight">
                    {roles.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setRole(item);
                          setRoleMenuOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-steel transition hover:bg-[#EAF4FF] hover:text-sui dark:hover:bg-sui/10",
                          role === item && "bg-[#EAF4FF] text-sui dark:bg-sui/15"
                        )}
                      >
                        <span className="blue-gradient h-8 w-8 shrink-0 rounded-full" />
                        <span className="min-w-0 truncate">{profiles[item].company}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1 rounded-2xl pl-1">
                  <Link
                    href="/profile"
                    className="flex min-w-0 max-w-[200px] items-center gap-2 rounded-2xl py-1 pr-1 text-left transition hover:bg-blue-50 dark:hover:bg-sui/10"
                    onClick={() => setRoleMenuOpen(false)}
                    title={profile.company}
                  >
                    <div className="blue-gradient h-9 w-9 shrink-0 rounded-full" />
                    <p className="hidden min-w-0 truncate text-[13px] font-bold text-pearl sm:block">
                      {profile.company}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      setRoleMenuOpen((open) => !open);
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sui transition hover:bg-blue-50 dark:hover:bg-sui/10"
                    aria-label="Switch company"
                    aria-expanded={roleMenuOpen}
                  >
                    <ChevronsUpDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-blue-100 px-4 py-2 dark:border-slate-700 lg:hidden">
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
