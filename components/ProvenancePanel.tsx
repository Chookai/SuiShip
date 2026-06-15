"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Search, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { cn } from "@/lib/utils";

type ProvenanceResponse = {
  answer: string;
  evidence: Array<{
    type: string;
    label: string;
    value: string;
    txDigest?: string;
  }>;
  authorized: boolean;
  decryptionSucceeded: boolean;
};

const SUISCAN_BASE = "https://suiscan.xyz/testnet";

function txUrl(digest: string) {
  return `${SUISCAN_BASE}/tx/${digest}`;
}

export function ProvenancePanel({ shipmentId, refreshKey = 0 }: { shipmentId: string; refreshKey?: number }) {
  const account = useCurrentAccount();
  const [question, setQuestion] = useState("What is the cargo?");
  const [requesterAddress, setRequesterAddress] = useState("");
  const [demoKeyHex, setDemoKeyHex] = useState(process.env.NEXT_PUBLIC_DEMO_KEYPAIR_HEX ?? "");
  const [result, setResult] = useState<ProvenanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasAsked, setHasAsked] = useState(false);

  useEffect(() => {
    if (account?.address) {
      setRequesterAddress((current) => current || account.address);
    }
  }, [account?.address]);

  async function askQuestion() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/provenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          requesterAddress,
          requesterKeyHex: demoKeyHex.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
      }
      setHasAsked(true);
      setResult(payload as ProvenanceResponse);
    } catch (err) {
      setHasAsked(true);
      setResult(null);
      setError(err instanceof Error ? err.message : "Could not query provenance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasAsked || !question.trim() || !requesterAddress.trim()) return;
    void askQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, shipmentId]);

  const statusTone = result?.authorized
    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
    : "border-red-100 bg-red-50 text-red-600";

  return (
    <Panel>
      <div className="flex items-center gap-3">
        <Search className="h-5 w-5 text-sui" />
        <div>
          <h2 className="text-xl font-semibold text-pearl">Provenance Panel</h2>
          <p className="text-sm text-steel">Ask the shipment and see whether SEAL grants the requester access.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-steel">
          <span>Requester address</span>
          <input
            value={requesterAddress}
            onChange={(event) => setRequesterAddress(event.target.value)}
            placeholder="0x..."
            className="min-h-12 rounded-2xl border border-blue-100 bg-white px-4 text-pearl shadow-sm outline-none transition placeholder:text-steel/55 focus:border-sui/70 focus:bg-blue-50/50"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-steel">
          <span>Signing key (hex or suiprivkey)</span>
          <input
            value={demoKeyHex}
            onChange={(event) => setDemoKeyHex(event.target.value)}
            placeholder="Optional requester signing key"
            className="min-h-12 rounded-2xl border border-blue-100 bg-white px-4 text-pearl shadow-sm outline-none transition placeholder:text-steel/55 focus:border-sui/70 focus:bg-blue-50/50"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-steel">
          <span>Ask about this shipment...</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-pearl shadow-sm outline-none transition placeholder:text-steel/55 focus:border-sui/70 focus:bg-blue-50/50"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={askQuestion} disabled={loading || !question.trim() || !requesterAddress.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Ask
          </Button>
          {result ? (
            <span className={cn("rounded-full border px-3 py-1.5 text-xs font-bold uppercase", statusTone)}>
              {result.authorized ? "Authorized" : "Denied"}
            </span>
          ) : null}
          {result?.authorized ? (
            <span
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold",
                result.decryptionSucceeded
                  ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                  : "border-amber-100 bg-amber-50 text-amber-700",
              )}
            >
              {result.decryptionSucceeded ? "SEAL-decrypted ✓" : "Cached ✓"}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 grid gap-4">
          {!result.authorized ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4" />
                Access denied
              </div>
              <p className="mt-1">Ask the importer or exporter to endorse you, wait for the timeline to update, then ask again.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Access granted
              </div>
              <p className="mt-1">This answer was generated from shipment provenance evidence.</p>
            </div>
          )}

          <div className="rounded-2xl border border-blue-100 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-steel">Answer</p>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-pearl">{result.answer}</div>
          </div>

          <details className="rounded-2xl border border-blue-100 bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold text-pearl">
              Evidence ({result.evidence.length})
            </summary>
            <div className="mt-4 grid gap-3">
              {result.evidence.map((item, index) => (
                <div key={`${item.label}-${index}`} className="rounded-2xl bg-blue-50 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-steel">{item.type}</p>
                  <p className="mt-1 text-sm font-semibold text-pearl">{item.label}</p>
                  <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-steel">{item.value}</div>
                  {item.txDigest ? (
                    <a
                      href={txUrl(item.txDigest)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-xs font-bold text-[#4DA2FF] hover:text-pearl"
                    >
                      {item.txDigest}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </Panel>
  );
}
