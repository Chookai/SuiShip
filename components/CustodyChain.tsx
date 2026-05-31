"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Truck,
  UserCheck,
  Warehouse,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRole, type MockRole } from "@/components/role-context";
import { Button } from "@/components/ui";
import {
  DEMO_ENDORSEMENT_FLOW,
  ENDORSEMENT_STEP_LABELS,
  actionKey,
  getCompletedStepKeys,
  getNextRequiredStep,
  type DemoEndorsementRecord,
  type DemoEndorsementRole,
} from "@/lib/endorsement-flow";
import { cn } from "@/lib/utils";

type PartySlushState = {
  signingEnabled: boolean;
  accounts: Array<{ role: MockRole; address: string }>;
};

const MOCK_ROLE_TO_ENDORSE: Partial<Record<MockRole, DemoEndorsementRole>> = {
  Importer: "importer",
  "Freight Forwarder": "freight_forwarder",
};

const SUISCAN_BASE = "https://suiscan.xyz/testnet";

const STEP_ICONS: Record<string, React.ElementType> = {
  picked_up: Truck,
  handed_off: Warehouse,
  reviewed: ShieldCheck,
  cleared_customs: CheckCircle2,
  received: UserCheck,
};

type PassportData = {
  passportId: string;
  endorsementLogId?: string;
  endorsements: DemoEndorsementRecord[];
};

export function CustodyChain({
  shipmentId,
  onEndorsed,
}: {
  shipmentId: string;
  onEndorsed?: () => void | Promise<void>;
}) {
  const account = useCurrentAccount();
  const { role: mockRole } = useRole();
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [partySlush, setPartySlush] = useState<PartySlushState | null>(null);
  const [loading, setLoading] = useState(true);
  const [endorsing, setEndorsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTx, setSuccessTx] = useState<string | null>(null);

  const fetchPassport = useCallback(async () => {
    try {
      const [passportRes, slushRes] = await Promise.all([
        fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/passport`),
        fetch("/api/party-slush"),
      ]);
      if (passportRes.ok) {
        const data = await passportRes.json();
        setPassport(data as PassportData);
      }
      if (slushRes.ok) {
        const slush = (await slushRes.json()) as PartySlushState;
        setPartySlush(slush);
      }
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
  const partyAddress = partySlush?.accounts.find((a) => a.role === mockRole)?.address;
  const mappedEndorseRole = MOCK_ROLE_TO_ENDORSE[mockRole];

  const canEndorseNext = Boolean(
    nextStep &&
      (partySlush?.signingEnabled
        ? mappedEndorseRole === nextStep.role && partyAddress
        : walletAddress),
  );

  async function handleEndorse() {
    if (!nextStep || !canEndorseNext || endorsing) return;

    const requesterAddress =
      partySlush?.signingEnabled && mappedEndorseRole === nextStep.role
        ? partyAddress
        : walletAddress;
    if (!requesterAddress) return;

    setError(null);
    setSuccessTx(null);
    setEndorsing(true);

    try {
      let capObjectId: string | undefined;

      if (nextStep.role === "freight_forwarder") {
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

      const actingAsParty = Boolean(
        partySlush?.signingEnabled && mappedEndorseRole === nextStep.role,
      );

      const res = await fetch(
        `/api/shipments/${encodeURIComponent(shipmentId)}/passport/endorse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: nextStep.role,
            action: nextStep.action,
            requesterAddress,
            usePartySlushSigner: actingAsParty,
            capObjectId,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Endorsement failed");

      setSuccessTx(data.txDigest);
      await fetchPassport();
      await onEndorsed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Endorsement failed");
    } finally {
      setEndorsing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-pearl">Custody Chain</h2>
        {allComplete && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Complete
          </span>
        )}
      </div>

      <div className="mt-5 flex w-full items-start">
        {DEMO_ENDORSEMENT_FLOW.map((step, idx) => {
          const key = actionKey(step.role, step.action);
          const isComplete = completedKeys.has(key);
          const isNext =
            nextStep?.role === step.role && nextStep?.action === step.action;
          const Icon = STEP_ICONS[step.action] ?? CheckCircle2;
          const segmentComplete =
            idx === 0 ||
            completedKeys.has(
              actionKey(
                DEMO_ENDORSEMENT_FLOW[idx - 1].role,
                DEMO_ENDORSEMENT_FLOW[idx - 1].action,
              ),
            );

          return (
            <div key={key} className="contents">
              {idx > 0 && (
                <div
                  className={cn(
                    "mt-[18px] h-0.5 min-w-[6px] flex-1",
                    segmentComplete ? "bg-emerald-300" : "bg-slate-200",
                  )}
                  aria-hidden
                />
              )}
              <div className="flex w-[72px] shrink-0 flex-col items-center">
                <div
                  className={cn(
                    "relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white ring-4 ring-white",
                    isComplete
                      ? "bg-emerald-500 text-white"
                      : isNext
                        ? "bg-sui text-white"
                        : "bg-slate-100 text-slate-400",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p
                  className={cn(
                    "mt-2 text-center text-[10px] font-bold leading-tight",
                    isComplete ? "text-emerald-700" : isNext ? "text-sui" : "text-steel",
                  )}
                >
                  {ENDORSEMENT_STEP_LABELS[step.action]}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {!allComplete && (
        <Button
          className="mt-6 w-full shadow-none"
          disabled={!canEndorseNext || endorsing}
          onClick={() => void handleEndorse()}
        >
          {endorsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing…
            </>
          ) : (
            "Endorse"
          )}
        </Button>
      )}

      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
      {successTx && (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <a
            href={`${SUISCAN_BASE}/tx/${successTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 font-mono text-sui hover:underline"
          >
            Endorsed · {successTx.slice(0, 10)}…
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
