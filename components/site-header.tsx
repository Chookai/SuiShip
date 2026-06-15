"use client";

import { ArrowRight, Play, X } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import suishipLogo from "@/asset/suiship_logo.png";
import suishipName from "@/asset/suiship_name.png";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Agents", href: "/#agents" },
  { label: "Memory", href: "/#memory" },
  { label: "Access", href: "/#access" },
  { label: "Architecture", href: "/#tech" },
  { label: "Builders", href: "/#builders" },
  { label: "Market", href: "/market" },
];

const navLinkClass =
  "landing-nav-link rounded-xl px-4 py-2.5 text-base font-semibold lg:px-5 lg:py-3 lg:text-lg";

function DemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.22 }}
        className="relative w-full max-w-3xl rounded-2xl bg-[#0d1628] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-[#080d1a]">
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Play className="h-14 w-14 text-sui/60" />
            <p className="text-sm font-semibold text-steel">Demo video coming soon</p>
            <p className="max-w-xs text-xs text-steel/60">
              Replace with your YouTube embed in <code className="text-sui/80">components/site-header.tsx</code>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Shared marketing navigation bar.
 *
 * Pass `onWatchDemo` to let a parent control the demo modal (e.g. the landing
 * page, which also opens it from hero buttons). Omit it and the header manages
 * its own demo modal — used by standalone pages like /market.
 */
export function SiteHeader({ onWatchDemo }: { onWatchDemo?: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleDemo = onWatchDemo ?? (() => setDemoOpen(true));

  return (
    <>
      {!onWatchDemo && <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />}
      <header
        className={cn(
          "landing-nav-header sticky top-0 z-50 px-5 py-5 backdrop-blur-xl transition-[background-color,border-color] duration-200 md:py-6 lg:px-10",
          scrolled
            ? "border-b border-blue-100/80 bg-[#f8fbff]/85"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-8">
          <Link href="/" className="flex min-w-0 items-center gap-4" aria-label="SuiShip home">
            <Image src={suishipLogo} alt="" className="h-14 w-14 shrink-0 object-contain md:h-16 md:w-16" priority />
            <Image
              src={suishipName}
              alt="SuiShip"
              className="mt-1 h-10 w-auto min-w-[140px] object-contain md:h-12 md:min-w-[168px]"
              priority
            />
          </Link>
          <nav className="hidden items-center gap-2 lg:flex" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className={navLinkClass}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={handleDemo}
              className={`${navLinkClass} hidden items-center gap-2 sm:flex`}
            >
              <Play className="h-4 w-4 md:h-5 md:w-5" />
              Demo
            </button>
            <Link
              href="/create"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2.5 rounded-2xl px-5 py-2.5 text-base font-semibold blue-gradient text-white shadow-glow transition hover:brightness-105 md:min-h-[3.25rem] md:px-6 md:py-3 md:text-lg"
            >
              Launch App
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
