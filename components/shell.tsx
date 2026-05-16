"use client";

import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { Bell, Boxes, Brain, ChevronDown, FilePlus2, LayoutDashboard, Moon, ScanLine, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { cn, formatAddress } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "Create", icon: FilePlus2 },
  { href: "/customs", label: "Customs", icon: ScanLine },
  { href: "/memory", label: "Memory", icon: Brain }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const account = useCurrentAccount();

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden min-h-screen w-[292px] shrink-0 border-r border-blue-100/80 bg-white/85 shadow-[18px_0_60px_rgba(30,64,175,0.06)] backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:flex-col">
        <div className="flex h-32 items-center border-b border-blue-100 px-9">
          <Logo />
        </div>
        <nav className="grid gap-3 px-7 py-8">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold text-steel transition hover:bg-blue-50 hover:text-sui",
                  active && "bg-blue-50 text-pearl"
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon className={cn("h-5 w-5", active ? "text-sui" : "text-steel")} />
                  {item.label}
                </span>
                <ChevronDown className="h-4 w-4 text-steel/70" />
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-8 pb-10">
          <div className="blue-gradient overflow-hidden rounded-[1.6rem] p-6 text-white shadow-glow">
            <p className="text-3xl font-extrabold">96%</p>
            <p className="mt-1 text-sm text-white/80">AI verification</p>
            <div className="mt-6 h-20 rounded-2xl border border-white/20 bg-white/10 p-3">
              <div className="h-full rounded-xl bg-[linear-gradient(135deg,rgba(255,255,255,.55),rgba(255,255,255,.05))]" />
            </div>
          </div>
          <div className="mt-8 flex items-center gap-3 px-2">
            <div className="blue-gradient h-11 w-11 rounded-full" />
            <div>
              <p className="text-sm font-bold text-pearl">SuiShip Demo</p>
              <p className="text-xs text-steel">Trade operator</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-50 border-b border-blue-100/70 bg-ink/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 lg:px-10">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-steel">Dashboards / SuiShip</p>
              <p className="text-2xl font-extrabold text-pearl">{pathname === "/" ? "Main Dashboard" : nav.find((item) => pathname.startsWith(item.href))?.label ?? "Shipment Passport"}</p>
            </div>
            <div className="ml-auto flex items-center gap-3 rounded-full bg-white p-2 shadow-panel">
              <label className="hidden h-10 items-center gap-2 rounded-full bg-ink px-4 md:flex">
                <Search className="h-4 w-4 text-sui" />
                <input className="w-40 bg-transparent text-sm text-pearl outline-none placeholder:text-steel" placeholder="Search" />
              </label>
              <button className="flex h-10 w-10 items-center justify-center rounded-full text-steel hover:bg-blue-50 hover:text-sui" aria-label="Notifications">
                <Bell className="h-5 w-5" />
              </button>
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
