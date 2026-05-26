"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Package,
  ShieldCheck,
  Truck,
  UserCheck,
  Warehouse,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import {
  DEMO_ENDORSEMENT_FLOW,
  getCompletedStepKeys,
  getNextRequiredStep,
  actionKey,
  type DemoEndorsementRecord,
  type DemoEndorsementRole,
} from "@/lib/endorsement-flow";
import { cn } from "@/lib/utils";

const SUISCAN_BASE = "https://suiscan.xyz/testnet";

type PassportData = {
  passportId: string;
  endorsementLogId?: string;
  ownerAddress?: string;
  importerAddress?: string;
  exporterAddress?: string;
  endorsements: DemoEndorsementRecord[];
};

const STEP_ICONS: Record<string, React.ElementType> = {
  released: Package,
  picked_up: Truck,
  handed_off: Warehouse,
  reviewed: ShieldCheck,
  cleared_customs: CheckCircle2,
  received: UserCheck,
};

const STEP_LABELS: Record<string, string> = {
  released: "Released",
  picked_up: "Picked Up",
  handed_off: "Handed Off",
  reviewed: "Reviewed",
  cleared_customs: "Cleared",
  received: "Received",
};

const ROLE_LABELS: Record<string, string> = {
  exporter: "Exporter",
  freight_forwarder: "Freight Forwarder",
  customs: "Customs",
  importer: "Importer",
};

function truncAddr(addr: string) {
  if (!addr || addr.length < 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function CustodyChain({ shipmentId }: { shipmentId: string }) {
  const account = useCurrentAccount();
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [endorsing, setEndorsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTx, setSuccessTx] = useState<string | null>(null);

  const fetchPassport = useCallback(async () => {
    try {
      const res = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/passport`);
      if (!res.ok) return;
      const data = await res.json();
      setPassport(data as PassportData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    fetchPassport();
  }, [fetchPassport]);

  if (loading || !passport) return null;

  const endorsements = passport.endorsements ?? [];
  const completedKeys = getCompletedStepKeys(endorsements);
  const nextStep = getNextRequiredStep(endorsements);
  const allComplete = !nextStep;
  const walletAddress = account?.address;

  const canEndorseNext = !!nextStep && !!walletAddress;

  async function handleEndorse() {
    if (!nextStep || !walletAddress || endorsing) return;
    setError(null);
    setSuccessTx(null);
    setEndorsing(true);

    try {
      let capObjectId: string | undefined;

      // freight_forwarder and customs need a capability object
      if (nextStep.role === "freight_forwarder" || nextStep.role === "customs") {
        const grantRes = await fetch(
          `/api/shipments/${encodeURIComponent(shipmentId)}/passport/grant-role`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: nextStep.role }),
          },
        );
        if (!grantRes.ok) {
          const grantData = await grantRes.json();
          throw new Error(grantData.error ?? "Failed to grant role capability");
        }
        const grantData = await grantRes.json();
        capObjectId = grantData.capObjectId;
      }

      const res = await fetch(
        `/api/shipments/${encodeURIComponent(shipmentId)}/passport/endorse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: nextStep.role,
            action: nextStep.action,
            requesterAddress: walletAddress,
            capObjectId,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Endorsement failed");

      setSuccessTx(data.txDigest);
      await fetchPassport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Endorsement failed");
    } finally {
      setEndorsing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-pearl">Custody Chain</h2>
          <p className="mt-0.5 text-xs text-steel">
            {allComplete
              ? "All custody steps completed — shipment fully endorsed on-chain."
              : "Each party endorses on Sui when they handle the cargo. Endorsing grants SEAL decryption access."}
          </p>
        </div>
        {allComplete && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Complete
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="mt-5 relative">
        <div className="grid grid-cols-6 gap-0">
          {DEMO_ENDORSEMENT_FLOW.map((step, idx) => {
            const key = actionKey(step.role, step.action);
            const isComplete = completedKeys.has(key);
            const isNext = nextStep?.role === step.role && nextStep?.action === step.action;
            const record = endorsements.find(
              (e) => e.role === step.role && e.action === step.action,
            );
            const Icon = STEP_ICONS[step.action] ?? CheckCircle2;

            return (
              <div key={key} className="flex flex-col items-center text-center">
                {/* Connector line */}
                <div className="relative flex w-full items-center justify-center">
                  {idx > 0 && (
                    <div
                      className={cn(
                        "absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2",
                        isComplete || isNext ? "bg-emerald-300" : "bg-slate-200",
                      )}
                    />
                  )}
                  {idx < DEMO_ENDORSEMENT_FLOW.length - 1 && (
                    <div
                      className={cn(
                        "absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2",
                        isComplete ? "bg-emerald-300" : "bg-slate-200",
                      )}
                    />
                  )}
                  {/* Step dot */}
                  <div
                    className={cn(
                      "relative z-10 flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-white transition",
                      isComplete
                        ? "bg-emerald-500 text-white"
                        : isNext
                          ? "bg-sui text-white animate-pulse"
                          : "bg-slate-200 text-slate-400",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                </div>

                {/* Label */}
                <p
                  className={cn(
                    "mt-2 text-[10px] font-bold leading-tight",
                    isComplete ? "text-emerald-700" : isNext ? "text-sui" : "text-steel",
                  )}
                >
                  {STEP_LABELS[step.action]}
                </p>
                <p className="text-[9px] text-steel/70">{ROLE_LABELS[step.role]}</p>

                {/* Signer address */}
                {isComplete && record?.signer_address && (
                  <a
                    href={`${SUISCAN_BASE}/account/${record.signer_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 flex items-center gap-0.5 font-mono text-[9px] text-sui hover:underline"
                  >
                    {truncAddr(record.signer_address)}
                    <ExternalLink className="h-2 w-2" />
                  </a>
                )}
                {isComplete && record?.tx_digest && (
                  <a
                    href={`${SUISCAN_BASE}/tx/${record.tx_digest}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-0.5 font-mono text-[8px] text-steel hover:text-sui"
                  >
                    tx
                    <ExternalLink className="h-2 w-2" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Endorse action */}
      {nextStep && canEndorseNext && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-pearl">
              Your turn: {ROLE_LABELS[nextStep.role]} — {STEP_LABELS[nextStep.action]}
            </p>
            <p className="mt-0.5 text-xs text-steel">{nextStep.label}</p>
          </div>
          <Button onClick={handleEndorse} disabled={endorsing}>
            {endorsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {endorsing ? "Signing…" : "Endorse"}
          </Button>
        </div>
      )}

      {nextStep && !walletAddress && (
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs text-steel">
          Next step: <span className="font-bold text-pearl">{ROLE_LABELS[nextStep.role]}</span> — {nextStep.label}.
          <span> Connect a wallet to endorse.</span>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>
      )}
      {successTx && (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="font-semibold">Endorsed on-chain</span>
          <a
            href={`${SUISCAN_BASE}/tx/${successTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 font-mono text-sui hover:underline"
          >
            {successTx.slice(0, 10)}…
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
