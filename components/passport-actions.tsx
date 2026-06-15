"use client";

import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { buildStatusTx, canUsePublishedPackage } from "@/lib/sui";

export function PassportActions({ objectId }: { objectId?: string }) {
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [message, setMessage] = useState<string | null>(null);

  function markCleared() {
    if (!objectId || objectId.includes("...")) {
      setMessage("This shipment uses a shortened object ID. Mint a real passport or paste a full Sui object ID for live status updates.");
      return;
    }
    if (!canUsePublishedPackage()) {
      setMessage("Set NEXT_PUBLIC_SUISHIP_PACKAGE_ID after publishing the Move package to execute this call.");
      return;
    }
    signAndExecute(
      { transaction: buildStatusTx(objectId, "Customs Cleared") },
      {
        onSuccess: (response) => setMessage(`Status transaction submitted: ${response.digest}`),
        onError: (error) => setMessage(error.message)
      }
    );
  }

  return (
    <div className="grid gap-3">
      <Button onClick={markCleared} disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Mark Customs Cleared
      </Button>
      {message && <p className="rounded-lg border border-white/10 bg-white/6 p-3 text-sm text-steel">{message}</p>}
    </div>
  );
}
