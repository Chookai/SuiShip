"use client";

import { Boxes, ExternalLink, Fingerprint, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel } from "@/components/ui";
import { cn, formatAddress } from "@/lib/utils";

const SUISCAN_BASE = "https://suiscan.xyz/testnet";

type PassportResponse = {
  passportId: string;
  txDigest: string | null;
  mintedAt: string | null;
  endorsements: Array<{
    role: string;
    signer_address: string;
    action: string;
    signed_at_ms: number;
    tx_digest: string;
  }>;
};

function txUrl(digest: string) {
  return `${SUISCAN_BASE}/tx/${digest}`;
}

function formatEventDate(input: string | number | null) {
  if (!input) return "Unknown time";
  const date = new Date(typeof input === "number" ? input : input);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function roleTone(role: string) {
  switch (role) {
    case "importer":
      return "border-blue-100 bg-blue-50 text-[#4DA2FF]";
    case "exporter":
      return "border-emerald-100 bg-emerald-50 text-emerald-600";
    case "freight_forwarder":
      return "border-amber-100 bg-amber-50 text-amber-700";
    case "customs":
      return "border-fuchsia-100 bg-fuchsia-50 text-fuchsia-700";
    default:
      return "border-slate-100 bg-slate-50 text-steel";
  }
}

export function CustodyTimeline({ shipmentId, refreshKey = 0 }: { shipmentId: string; refreshKey?: number }) {
  const [passport, setPassport] = useState<PassportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPassport() {
      try {
        const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/passport`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
        }
        if (!cancelled) {
          setPassport(payload as PassportResponse);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load passport timeline");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPassport();
    const intervalId = window.setInterval(loadPassport, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [shipmentId, refreshKey]);

  const events = passport
    ? [
        {
          key: "passport-created",
          title: "Passport Created",
          subtitle: passport.passportId,
          timestamp: passport.mintedAt,
          txDigest: passport.txDigest ?? "",
          badge: "passport",
        },
        ...passport.endorsements.map((endorsement, index) => ({
          key: `${endorsement.role}-${endorsement.signer_address}-${endorsement.signed_at_ms}-${index}`,
          title: endorsement.action,
          subtitle: `${endorsement.role} · ${formatAddress(endorsement.signer_address)}`,
          timestamp: endorsement.signed_at_ms,
          txDigest: endorsement.tx_digest,
          badge: endorsement.role,
        })),
      ]
    : [];

  return (
    <Panel className="min-w-0">
      <div className="flex items-center gap-3">
        <Boxes className="h-5 w-5 text-sui" />
        <div>
          <h2 className="text-xl font-semibold text-pearl">Custody Timeline</h2>
          <p className="text-sm text-steel">On-chain passport creation and endorsements, newest event last.</p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-steel">Loading passport history...</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}

      {!loading && !error && events.length > 0 ? (
        <div className="mt-6 grid min-w-0 gap-4">
          {events.map((event, index) => (
            <div key={event.key} className="relative pl-10">
              {index < events.length - 1 ? (
                <span className="absolute left-[15px] top-8 h-[calc(100%+1rem)] w-px bg-blue-100" aria-hidden />
              ) : null}
              <span className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border border-blue-100 bg-white">
                {event.badge === "passport" ? (
                  <Fingerprint className="h-4 w-4 text-[#4DA2FF]" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-[#4DA2FF]" />
                )}
              </span>
              <div className="rounded-2xl border border-blue-100 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold text-pearl">{event.title}</p>
                      <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase", roleTone(event.badge))}>
                        {event.badge === "passport" ? "created" : event.badge.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-xs font-semibold text-steel">{event.subtitle}</p>
                    <p className="mt-2 text-xs text-steel">{formatEventDate(event.timestamp)}</p>
                  </div>
                  {event.txDigest ? (
                    <a
                      href={txUrl(event.txDigest)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-[#4DA2FF] hover:bg-blue-100"
                    >
                      View tx
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-steel">Tx digest unavailable</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
