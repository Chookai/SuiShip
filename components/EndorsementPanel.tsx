"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Panel } from "@/components/ui";
import {
  getNextRequiredStep,
  getRoleActionsForUi,
  type DemoEndorsementRecord,
  type DemoEndorsementRole,
} from "@/lib/endorsement-flow";
import { cn } from "@/lib/utils";

type PassportSummary = {
  passportId: string;
  ownerAddress?: string | null;
  importerAddress?: string | null;
  exporterAddress?: string | null;
  endorsements?: DemoEndorsementRecord[];
};

function capCacheKey(shipmentId: string, role: DemoEndorsementRole, signerAddress: string) {
  return `suiship-cap:${shipmentId}:${role}:${signerAddress.toLowerCase()}`;
}

export function EndorsementPanel({
  shipmentId,
  refreshKey = 0,
  onEndorsed,
}: {
  shipmentId: string;
  refreshKey?: number;
  onEndorsed?: () => void;
}) {
  const account = useCurrentAccount();
  const [passport, setPassport] = useState<PassportSummary | null>(null);
  const [role, setRole] = useState<DemoEndorsementRole>("exporter");
  const [signerAddress, setSignerAddress] = useState("");
  const [signerKeyHex, setSignerKeyHex] = useState(process.env.NEXT_PUBLIC_DEMO_KEYPAIR_HEX ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastTxDigest, setLastTxDigest] = useState<string | null>(null);

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
          setPassport(payload as PassportSummary);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load passport metadata");
        }
      }
    }

    void loadPassport();
    return () => {
      cancelled = true;
    };
  }, [shipmentId, refreshKey]);

  useEffect(() => {
    if (role === "exporter" && passport?.exporterAddress) {
      setSignerAddress(passport.exporterAddress);
      return;
    }
    if (role === "importer" && passport?.importerAddress) {
      setSignerAddress(passport.importerAddress);
      return;
    }
    if ((role === "freight_forwarder" || role === "customs") && account?.address) {
      setSignerAddress((current) => current || account.address);
    }
  }, [role, passport?.exporterAddress, passport?.importerAddress, account?.address]);

  const endorsements = passport?.endorsements ?? [];
  const nextStep = getNextRequiredStep(endorsements);
  const availableActions = getRoleActionsForUi(role, endorsements);
  const roleHint = useMemo(() => {
    if (role === "exporter") return "Exporter endorsements must be signed by the matching shipment role address.";
    if (role === "importer") return "Importer endorsements must be signed by the matching shipment role address.";
    if (role === "freight_forwarder") return "The panel will auto-grant a freight forwarder cap for this signer if needed.";
    return "The panel will auto-grant a customs cap for this signer if needed.";
  }, [role]);

  async function ensureCapObjectId(): Promise<string | undefined> {
    if (role !== "freight_forwarder" && role !== "customs") return undefined;
    const cacheKey = capCacheKey(shipmentId, role, signerAddress);
    const cached = typeof window !== "undefined" ? window.sessionStorage.getItem(cacheKey) : null;
    if (cached) return cached;

    const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/passport/grant-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        granteeAddress: signerAddress,
        passportObjectId: passport?.passportId,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
    }
    const capObjectId = typeof payload?.capObjectId === "string" ? payload.capObjectId : "";
    if (!capObjectId) {
      throw new Error(`Grant-role response did not include a capObjectId for ${role}`);
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(cacheKey, capObjectId);
    }
    return capObjectId;
  }

  async function submitEndorsement(selectedAction: string) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const capObjectId = await ensureCapObjectId();
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/passport/endorse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          action: selectedAction,
          requesterAddress: signerAddress,
          signerKeyHex: signerKeyHex.trim() || undefined,
          capObjectId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
      }
      const txDigest = typeof payload?.txDigest === "string" ? payload.txDigest : "";
      setLastTxDigest(txDigest || null);
      setSuccess(`${role.replace(/_/g, " ")} endorsed shipment with "${selectedAction}".`);
      onEndorsed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit endorsement");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="min-w-0 overflow-hidden">
      <div className="flex items-center gap-3">
        <Truck className="h-5 w-5 text-sui" />
        <div>
          <h2 className="text-xl font-semibold text-pearl">Endorsement Panel</h2>
          <p className="text-sm text-steel">Follow the custody sequence and push an operational progress memory into MemWal.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-steel">
          <p className="font-semibold text-pearl">Current step</p>
          <p className="mt-1">
            {nextStep
              ? `${nextStep.role.replace(/_/g, " ")} -> ${nextStep.action.replace(/_/g, " ")}`
              : "Custody flow complete"}
          </p>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium text-steel">Role</span>
          <div className="flex flex-wrap gap-2">
            {(["exporter", "freight_forwarder", "customs", "importer"] as DemoEndorsementRole[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRole(option)}
                className={cn(
                  "rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-wide transition",
                  role === option
                    ? "border-[#4DA2FF] bg-blue-50 text-[#4DA2FF]"
                    : "border-blue-100 bg-white text-steel hover:bg-blue-50 hover:text-pearl",
                )}
              >
                {option.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-2 text-sm font-medium text-steel">
          <span>Selected signer address</span>
          <input
            value={signerAddress}
            onChange={(event) => setSignerAddress(event.target.value)}
            placeholder="0x..."
            className="min-h-12 rounded-2xl border border-blue-100 bg-white px-4 text-pearl shadow-sm outline-none transition placeholder:text-steel/55 focus:border-sui/70 focus:bg-blue-50/50"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-steel">
          <span>Signer key (optional)</span>
          <input
            value={signerKeyHex}
            onChange={(event) => setSignerKeyHex(event.target.value)}
            placeholder="suiprivkey... or 32-byte hex"
            className="min-h-12 rounded-2xl border border-blue-100 bg-white px-4 text-pearl shadow-sm outline-none transition placeholder:text-steel/55 focus:border-sui/70 focus:bg-blue-50/50"
          />
        </label>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-steel">
          <p className="font-semibold text-pearl">Selected action set</p>
          <p className="mt-1">{roleHint}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {availableActions.map((roleAction) => (
            <div key={roleAction.action} className="grid gap-1">
              <Button
                variant={roleAction.enabled ? "primary" : "secondary"}
                onClick={() => {
                  void submitEndorsement(roleAction.action);
                }}
                disabled={loading || !signerAddress.trim() || !roleAction.enabled}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {roleAction.action.replace(/_/g, " ")}
              </Button>
              {!roleAction.enabled ? (
                <p className="text-[11px] font-semibold text-steel">
                  {roleAction.completed ? "Completed" : roleAction.blockedReason}
                </p>
              ) : (
                <p className="text-[11px] font-semibold text-emerald-700">Ready now</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {passport?.endorsements && passport.endorsements.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-steel">Completed steps</p>
          <div className="mt-2 grid gap-1 text-sm text-pearl">
            {passport.endorsements.map((endorsement, index) => (
              <p key={`${endorsement.role}-${endorsement.action}-${index}`}>
                {index + 1}. {endorsement.role.replace(/_/g, " ")} {"->"} {endorsement.action.replace(/_/g, " ")}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {success ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p>{success}</p>
            {lastTxDigest ? <p className="mt-1 break-all text-xs text-emerald-800/80">{lastTxDigest}</p> : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </Panel>
  );
}
