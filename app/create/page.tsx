"use client";

import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { AlertCircle, Bot, CheckCircle2, FilePlus2, Loader2, Ship, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Field, Panel, RiskBadge, StatusBadge } from "@/components/ui";
import { extractionResults, type ShipmentDocument } from "@/lib/demo-data";
import { buildCreateShipmentTx, canUsePublishedPackage, PACKAGE_ID } from "@/lib/sui";
import { stableHash } from "@/lib/utils";

const initialForm = {
  shipmentId: "SS-MY-US-0004",
  shipper: "Penang Micro Systems Sdn Bhd",
  consignee: "Northstar Components Inc.",
  origin: "Malaysia",
  destination: "United States",
  carrier: "DHL Global Forwarding",
  transportMode: "Air freight",
  incoterm: "DAP",
  declaredValue: "USD 148,200",
  cargo: "Semiconductor components"
};

export default function CreateShipmentPage() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [form, setForm] = useState(initialForm);
  const [aiRan, setAiRan] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [demoObjectId, setDemoObjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const documents = useMemo<ShipmentDocument[]>(() => {
    return ["Commercial Invoice", "Packing List", "Air Waybill"].map((name) => ({
      name,
      kind: name.includes("Invoice") ? "Invoice" : name.includes("Packing") ? "Packing List" : "Transport",
      hash: stableHash(`${form.shipmentId}-${name}`),
      storageUri: `walrus://demo-${form.shipmentId.toLowerCase()}-${name.toLowerCase().replaceAll(" ", "-")}`,
      verified: aiRan
    }));
  }, [aiRan, form.shipmentId]);

  const update = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  function mintPassport() {
    setError(null);
    setResult(null);
    setDemoObjectId(null);

    if (!account) {
      setError("Connect a Sui wallet before minting a passport.");
      return;
    }

    if (!canUsePublishedPackage()) {
      setDemoObjectId(stableHash(`${form.shipmentId}-${account.address}-${Date.now()}`));
      return;
    }

    const tx = buildCreateShipmentTx({
      shipmentId: form.shipmentId,
      shipper: form.shipper,
      consignee: form.consignee,
      origin: form.origin,
      destination: form.destination,
      carrier: form.carrier,
      transportMode: form.transportMode,
      aiScore: 96,
      riskLevel: "Low",
      documents
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (response) => setResult(response.digest),
        onError: (transactionError) => setError(transactionError.message)
      }
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.25em] text-sui">Create passport</p>
        <h1 className="mt-3 text-4xl font-semibold text-pearl">Mint a shipment passport</h1>
        <p className="mt-3 text-steel">Enter shipment metadata, run the conceptual AI extraction, then sign a Sui transaction to create a ShipmentPassport object.</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="mb-6 flex items-center gap-3">
            <Ship className="h-5 w-5 text-sui" />
            <h2 className="text-xl font-semibold text-pearl">Shipment details</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shipment ID" value={form.shipmentId} onChange={update("shipmentId")} />
            <Field label="Transport mode" value={form.transportMode} onChange={update("transportMode")} />
            <Field label="Shipper" value={form.shipper} onChange={update("shipper")} />
            <Field label="Consignee" value={form.consignee} onChange={update("consignee")} />
            <Field label="Origin country" value={form.origin} onChange={update("origin")} />
            <Field label="Destination country" value={form.destination} onChange={update("destination")} />
            <Field label="Carrier" value={form.carrier} onChange={update("carrier")} />
            <Field label="Incoterm" value={form.incoterm} onChange={update("incoterm")} />
            <Field label="Cargo" value={form.cargo} onChange={update("cargo")} />
            <Field label="Declared value" value={form.declaredValue} onChange={update("declaredValue")} />
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-pearl">Document references</h3>
              <span className="text-xs text-steel">Walrus mocked as placeholder URIs</span>
            </div>
            <div className="mt-3 grid gap-3">
              {documents.map((document) => (
                <div key={document.name} className="rounded-lg border border-white/10 bg-white/6 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-pearl">{document.name}</p>
                      <p className="mt-1 text-xs text-steel">{document.storageUri}</p>
                    </div>
                    {document.verified ? <CheckCircle2 className="h-5 w-5 text-mint" /> : <FilePlus2 className="h-5 w-5 text-steel" />}
                  </div>
                  <p className="mt-3 break-all rounded-lg bg-black/20 px-3 py-2 text-xs text-steel">hash {document.hash}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <div className="grid gap-6">
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-pearl">AI verification</h2>
                <p className="mt-1 text-sm text-steel">Mocked extraction first, production LLM/OCR later.</p>
              </div>
              <Bot className="h-6 w-6 text-sui" />
            </div>
            <Button className="mt-5 w-full" onClick={() => setAiRan(true)}>
              <Sparkles className="h-4 w-4" />
              Run AI Verification
            </Button>
            {aiRan && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-mint/25 bg-mint/10 p-4">
                  <div>
                    <p className="font-medium text-pearl">Verification complete</p>
                    <p className="text-sm text-steel">No document mismatch found</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-semibold text-mint">96</p>
                    <RiskBadge value="Low" />
                  </div>
                </div>
                {extractionResults.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4 rounded-lg bg-white/6 px-3 py-2">
                    <div>
                      <p className="text-sm text-steel">{item.label}</p>
                      <p className="font-medium text-pearl">{item.value}</p>
                    </div>
                    <span className="text-sm text-sui">{item.confidence}%</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">On-chain mint</h2>
            <p className="mt-2 text-sm text-steel">
              {canUsePublishedPackage()
                ? "This will create a real ShipmentPassport object on Sui testnet."
                : "Prototype demo mode is active. A production deployment would mint the passport on Sui after the contract is published."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge value={account ? "Wallet Connected" : "Wallet Required"} />
              <StatusBadge value={canUsePublishedPackage() ? "Sui Mint Ready" : "Demo Mint Mode"} />
            </div>
            <Button className="mt-5 w-full" disabled={!aiRan || isPending} onClick={mintPassport}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
              Mint Shipment Passport
            </Button>
            {result && <p className="mt-4 rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">Transaction digest: {result}</p>}
            {demoObjectId && (
              <div className="mt-4 rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm text-mint">
                <p className="font-medium">Demo passport created</p>
                <p className="mt-1 break-all text-mint/85">Preview object ID: {demoObjectId}</p>
                <p className="mt-2 text-mint/75">No gas was spent because the contract has not been deployed for this demo environment yet.</p>
              </div>
            )}
            {error && (
              <p className="mt-4 flex gap-2 rounded-lg border border-amber/25 bg-amber/10 p-3 text-sm text-amber">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            {!canUsePublishedPackage() && (
              <details className="mt-4 rounded-lg border border-white/10 bg-white/6 p-3 text-sm text-steel">
                <summary className="cursor-pointer text-pearl">Developer deployment status</summary>
                <p className="mt-3">
                  The Move package exists in the repo, but this local app has no published package ID configured yet.
                  After deployment, set <span className="text-pearl">NEXT_PUBLIC_SUISHIP_PACKAGE_ID</span> to enable live Sui minting.
                </p>
                <p className="mt-2 break-all text-xs">Current value: {PACKAGE_ID}</p>
              </details>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
