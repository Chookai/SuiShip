"use client";

import { usePathname } from "next/navigation";
import { Shell } from "@/components/shell";

const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/shipments",
  "/create",
  "/profile",
  "/persistent-agent",
  "/customs",
  "/memory",
  "/risk-memory",
];

function isAppRoute(pathname: string) {
  return APP_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AppShellGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!isAppRoute(pathname)) {
    return <>{children}</>;
  }

  return <Shell>{children}</Shell>;
}
