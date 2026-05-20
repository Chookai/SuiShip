"use client";

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Globe2,
  Info,
  Loader2,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PassportActions } from "@/components/passport-actions";
import { QrCard } from "@/components/qr-card";
import { useRole } from "@/components/role-context";
import { Button, Panel, RiskBadge, StatusBadge } from "@/components/ui";
import { findShipment } from "@/lib/demo-data";
import {
  useShipments,
  type AiCheck,
  type AiResult,
  type DocumentOwner,
  type DocumentRequirement,
  type ProgressManifest,
  type ShipmentRecord,
  type WalrusUpload
} from "@/lib/shipments-store";
import { buildCreateShipmentTx, canUsePublishedPackage, PACKAGE_ID } from "@/lib/sui";
import { cn } from "@/lib/utils";
import { aggregatorUrl } from "@/lib/walrus";

type AggregateLike = {
  extractedRef?: string;
  cross_validation?: Array<{ severity?: string; message?: string; field?: string }>;
  detected?: {
    commercial_invoice?: Array<{ file_name: string }>;
    packing_list?: Array<{ file_name: string }>;
    bill_of_lading?: Array<{ file_name: string }>;
    certificate_of_origin?: Array<{ file_name: string }>;
  };
};

type SuiPassportProgress = {
  passportId?: string;
  txDigest: string;
  packageId: string;
  network: "testnet";
};

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const { shipments, ready, addShipment, updateShipment } = useShipments();
  const { role } = useRole();
  const rawId = decodeURIComponent(params?.id || "");
  const [serverShipment, setServerShipment] = useState<ShipmentRecord | null>(null);
  const [lookupComplete, setLookupComplete] = useState(false);

  const stored = useMemo(() => shipments.find((shipment) => shipment.id === rawId), [shipments, rawId]);
  const demo = useMemo(() => (stored ? null : findShipment(rawId)), [rawId, stored]);

  useEffect(() => {
    if (!ready || !rawId || stored || demo) {
      setLookupComplete(false);
      return;
    }

    let cancelled = false;
    setLookupComplete(false);

    fetch(`/api/shipments/${encodeURIComponent(rawId)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as ShipmentRecord;
      })
      .then((record) => {
        if (cancelled) return;
        if (record) {
          setServerShipment(record);
          addShipment(record);
        }
        setLookupComplete(true);
      })
      .catch(() => {
        if (!cancelled) setLookupComplete(true);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, rawId, stored, demo, addShipment]);

  if (!ready || (!stored && !demo && !serverShipment && !lookupComplete)) {
    return (
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
        <Panel>
          <p className="text-pearl">Loading shipment...</p>
        </Panel>
      </div>
    );
  }

  if (stored) {
    const currentRoleOwner: DocumentOwner = role;
    return (
      <StoredShipmentView
        shipment={stored}
        currentRoleOwner={currentRoleOwner}
        onUpdate={(patch) => updateShipment(stored.id, patch)}
      />
    );
  }

  if (serverShipment) {
    const currentRoleOwner: DocumentOwner = role;
    return (
      <StoredShipmentView
        shipment={serverShipment}
        currentRoleOwner={currentRoleOwner}
        onUpdate={(patch) => updateShipment(serverShipment.id, patch)}
      />
    );
  }

  if (!demo) {
    return (
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
        <Panel>
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold text-pearl">Shipment not found</p>
              <p className="mt-1 text-sm text-steel">The shipment record is not available yet or does not exist.</p>
              <Link href="/shipments" className="mt-4 inline-flex items-center gap-2 text-sm text-sui hover:text-pearl">
                <ArrowLeft className="h-4 w-4" />
                Back to shipments
              </Link>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  return <DemoShipmentView shipment={demo!} />;
}

function StoredShipmentView({
  shipment,
  currentRoleOwner,
  onUpdate
}: {
  shipment: ShipmentRecord;
  currentRoleOwner: DocumentOwner;
  onUpdate: (patch: Partial<ShipmentRecord>) => void;
}) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const [documentPhase, setDocumentPhase] = useState<"idle" | "extracting" | "validating" | "minting">("idle");
  const [progressBusy, setProgressBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [newDocumentName, setNewDocumentName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const requiredDocs = shipment.documents.filter((doc) => doc.required);
  const ai = shipment.ai ?? buildShipmentAiOverview(shipment);
  const requiredDocsComplete = requiredDocs.length > 0 && requiredDocs.every((doc) => doc.uploaded);
  const hasFinalManifest = (shipment.progressManifests ?? []).some((manifest) => manifest.stage === "final_manifest");
  const documentsLocked = hasFinalManifest || Boolean(shipment.walrus);
  const passportBusy = documentPhase === "validating" || documentPhase === "minting";
  const canFinalize =
    requiredDocsComplete &&
    shipment.extractionStatus === "complete" &&
    !hasFinalManifest &&
    documentPhase === "idle";

  function appendProgressManifest(manifest: ProgressManifest) {
    onUpdate({
      progressManifests: [...(shipment.progressManifests ?? []), manifest],
    });
  }

  async function recordProgressCheckpoint(input: {
    stage:
      | "documents_uploaded"
      | "ai_check_failed"
      | "ai_check_passed"
      | "walrus_package_stored"
      | "final_manifest"
      | "sui_passport_created";
    actor: string;
    summary: string;
    documents?: Array<{ name: string; fileName?: string; uploaded?: boolean }>;
    aiIssues?: Array<{ severity?: string; message?: string; field?: string }>;
    walrusPackage?: WalrusUpload;
    suiPassport?: SuiPassportProgress;
  }): Promise<ProgressManifest> {
    setProgressBusy(true);
    try {
      const response = await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `Progress manifest failed with HTTP ${response.status}`));
      }
      const manifest = payload as ProgressManifest;
      appendProgressManifest(manifest);
      return manifest;
    } finally {
      setProgressBusy(false);
    }
  }

  function addToStaged(files: File[]) {
    const pdfs = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return;
    setStagedFiles((current) => {
      const next = new Map(current.map((file) => [file.name, file]));
      pdfs.forEach((file) => next.set(file.name, file));
      return [...next.values()];
    });
  }

  async function extractStagedFiles() {
    if (stagedFiles.length === 0 || documentPhase !== "idle" || documentsLocked) return;
    const files = [...stagedFiles];
    setStagedFiles([]);
    onUpdate({
      ai: undefined,
      extractionStatus: "extracting",
      status: "In Progress"
    });
    setWorkflowError(null);
    setDocumentPhase("extracting");

    try {
      const formData = new FormData();
      formData.append("shipmentId", shipment.id);
      files.forEach((file) => formData.append("files", file));
      const res = await fetch("/api/documents/extract", { method: "POST", body: formData });
      const payload = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `Extraction failed with HTTP ${res.status}`));
      }
      const detectedDocs = docsWithExtractionResult(shipment.documents, payload as AggregateLike, currentRoleOwner);
      const allRequiredUploaded = detectedDocs.filter((doc) => doc.required).every((doc) => doc.uploaded);
      const issues = (payload as AggregateLike).cross_validation ?? [];
      const blockingIssues = issues.filter((issue) => issue.severity === "error");
      onUpdate({
        documents: detectedDocs,
        ai: buildAiOverview(detectedDocs, payload as AggregateLike),
        extractionStatus: "complete",
        extractedRef: typeof (payload as { extractedRef?: unknown }).extractedRef === "string" ? (payload as { extractedRef: string }).extractedRef : shipment.extractedRef,
        status: allRequiredUploaded ? "Documents Uploaded" : "In Progress"
      });
      await recordProgressCheckpoint({
        stage: blockingIssues.length > 0 ? "ai_check_failed" : "ai_check_passed",
        actor: currentRoleOwner,
        summary:
          blockingIssues.length > 0
            ? `AI found ${blockingIssues.length} blocking issue(s) after ${currentRoleOwner} uploaded ${files.length} document(s).`
            : `AI checked ${files.length} uploaded document(s) together and found no blocking issues.`,
        documents: detectedDocs.map((item) => ({ name: item.name, fileName: item.fileName, uploaded: item.uploaded })),
        aiIssues: issues,
      });
    } catch (err) {
      onUpdate({ extractionStatus: "failed" });
      setWorkflowError(err instanceof Error ? err.message : "Document extraction failed");
    } finally {
      setDocumentPhase("idle");
    }
  }

  function addDocument() {
    const name = newDocumentName.trim();
    if (!name) return;
    if (shipment.documents.some((doc) => doc.name.toLowerCase() === name.toLowerCase())) {
      setWorkflowError("That document is already in the checklist.");
      return;
    }
    onUpdate({
      documents: [
        ...shipment.documents,
        {
          name,
          owner: currentRoleOwner,
          required: false,
          uploaded: false,
        },
      ],
    });
    setNewDocumentName("");
    setWorkflowError(null);
  }

  async function finalizeShipment() {
    setWorkflowError(null);
    if (!requiredDocsComplete) {
      setWorkflowError("Upload all required documents before final storage.");
      return;
    }
    if (shipment.extractionStatus !== "complete") {
      setWorkflowError("Run document extraction successfully before final storage.");
      return;
    }
    if (!currentAccount?.address) {
      setWorkflowError("Connect your Sui wallet before creating the passport.");
      return;
    }
    if (!canUsePublishedPackage()) {
      setWorkflowError("SuiShip package ID is not configured.");
      return;
    }

    try {
      setDocumentPhase("validating");
      const validationRes = await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/validate`, { method: "POST" });
      const validationPayload = await parseJsonResponse(validationRes);
      if (!validationRes.ok) {
        throw new Error(getErrorMessage(validationPayload, `Validation failed with HTTP ${validationRes.status}`));
      }
      const issues = Array.isArray((validationPayload as { issues?: unknown }).issues)
        ? ((validationPayload as { issues: Array<{ severity?: string; message?: string }> }).issues)
        : [];
      const blockingIssues = issues.filter((issue) => issue.severity === "error");
      if (blockingIssues.length > 0) {
        setWorkflowError(blockingIssues.map((issue) => issue.message).filter(Boolean).join(" ") || "Validation found blocking document mismatches.");
        return;
      }

      setDocumentPhase("minting");
      const packageRes = await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/walrus-package`, { method: "POST" });
      const packagePayload = await parseJsonResponse(packageRes);
      if (!packageRes.ok) {
        throw new Error(getErrorMessage(packagePayload, `Walrus package upload failed with HTTP ${packageRes.status}`));
      }
      const walrusUpload = packagePayload as WalrusUpload & { documentCount?: number };

      const walrusManifest = await recordProgressCheckpoint({
        stage: "walrus_package_stored",
        actor: currentRoleOwner,
        summary: `Document package stored on Walrus as ${walrusUpload.fileName}. Blob ID: ${walrusUpload.blobId}.`,
        documents: shipment.documents.map((doc) => ({ name: doc.name, fileName: doc.fileName, uploaded: doc.uploaded })),
        aiIssues: issues,
        walrusPackage: walrusUpload,
      });

      const finalManifest = await recordProgressCheckpoint({
        stage: "final_manifest",
        actor: currentRoleOwner,
        summary: `Final AI validation passed. ${walrusUpload.documentCount ?? shipment.documents.filter((doc) => doc.uploaded).length} submitted PDF(s) were packaged and stored on Walrus.`,
        documents: shipment.documents.map((doc) => ({ name: doc.name, fileName: doc.fileName, uploaded: doc.uploaded })),
        aiIssues: issues,
        walrusPackage: walrusUpload,
      });
      const signerAddress = currentAccount.address;
      const mockCounterpartyAddress = "0x0";
      const tx = buildCreateShipmentTx({
        shipmentId: shipment.id,
        importer: currentRoleOwner === "Importer" ? signerAddress : mockCounterpartyAddress,
        exporter: currentRoleOwner === "Exporter" ? signerAddress : mockCounterpartyAddress,
        walrusBlobId: walrusUpload.blobId,
        memWalSpaceId: finalManifest.memwalNamespace,
        finalValidationMemWalId: finalManifest.memwalBlobId ?? finalManifest.memwalNamespace,
        packageHash: null,
        verificationScore: Math.max(90, ai.score),
        documentCount: walrusUpload.documentCount ?? shipment.documents.filter((doc) => doc.uploaded).length
      });
      const txResult = await signAndExecuteTransaction({ transaction: tx });
      const txDigest = "digest" in txResult ? txResult.digest : "";
      const finalizedTx = txDigest
        ? await suiClient.waitForTransaction({
            digest: txDigest,
            options: { showObjectChanges: true, showEvents: true }
          })
        : null;
      const passportObject = finalizedTx?.objectChanges?.find(
        (change) =>
          change.type === "created" &&
          change.objectType.endsWith("::shipment_passport::ShipmentPassport")
      );
      const passportId = passportObject?.type === "created" ? passportObject.objectId : undefined;
      const suiPassportManifest = await recordProgressCheckpoint({
        stage: "sui_passport_created",
        actor: currentRoleOwner,
        summary: passportId
          ? `Sui passport object created on testnet: ${passportId}.`
          : `Sui passport transaction confirmed on testnet: ${txDigest}.`,
        documents: shipment.documents.map((doc) => ({ name: doc.name, fileName: doc.fileName, uploaded: doc.uploaded })),
        aiIssues: issues,
        walrusPackage: walrusUpload,
        suiPassport: {
          passportId,
          txDigest,
          packageId: PACKAGE_ID,
          network: "testnet"
        }
      });

      onUpdate({
        status: "Passport Minted",
        walrus: walrusUpload,
        passportId,
        txDigest,
        memWalSpaceId: finalManifest.memwalNamespace,
        walrusManifestBlobId: walrusUpload.blobId,
        mintedAt: new Date().toISOString(),
        progressManifests: [...(shipment.progressManifests ?? []), walrusManifest, finalManifest, suiPassportManifest]
      });
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Final storage failed");
    } finally {
      setDocumentPhase("idle");
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
      <Link href="/shipments" className="inline-flex items-center gap-2 text-sm text-steel hover:text-pearl">
        <ArrowLeft className="h-4 w-4" />
        Back to shipments
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-[0.25em] text-sui">Shipment Details</p>
          <h1 className="mt-3 text-4xl font-semibold text-pearl">{shipment.id}</h1>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-steel">
            <span>Created by {capitalize(shipment.createdBy)}</span>
            <span>Created {formatDate(shipment.createdAt)}</span>
            <span>Updated {formatDate(shipment.updatedAt)}</span>
            {shipment.inviteToken && <span>Invite active</span>}
          </div>
        </div>
        <div className="shrink-0 md:pr-8">
          <Button onClick={finalizeShipment} disabled={!canFinalize || passportBusy}>
            {passportBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            {hasFinalManifest ? "Passport Created" : "Create Passport"}
          </Button>
          {workflowError && (
            <p className="mt-2 max-w-64 text-right text-xs font-semibold text-red-600">{workflowError}</p>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid gap-6">
          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Overview</h2>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {[
                {
                  role: "Exporter",
                  ...shipment.exporter,
                  country: shipment.shipment.origin
                },
                {
                  role: "Importer",
                  ...shipment.importer,
                  country: shipment.shipment.destination
                }
              ].map((party) => (
                <div key={party.role} className="rounded-lg border border-blue-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-[#4DA2FF]">{party.role}</p>
                      <h3 className="mt-1 text-lg font-extrabold text-pearl">{party.company}</h3>
                    </div>
                    <Building2 className="h-6 w-6 text-[#4DA2FF]" />
                  </div>
                  <div className="mt-4 grid gap-2 text-sm">
                    <p>
                      <span className="font-bold text-steel">Country:</span>{" "}
                      <span className="font-semibold text-pearl">{party.country}</span>
                    </p>
                    <p>
                      <span className="font-bold text-steel">Contact:</span>{" "}
                      <span className="font-semibold text-pearl">{party.contact}</span>
                    </p>
                    <div className="flex items-center gap-3 rounded-2xl bg-ink p-3">
                      <Mail className="h-4 w-4 text-[#4DA2FF]" />
                      <span className="font-semibold text-pearl">{party.email}</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-ink p-3">
                      <Phone className="h-4 w-4 text-[#4DA2FF]" />
                      <span className="font-semibold text-pearl">{party.phone}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Carrier", shipment.shipment.carrier],
                ["Incoterm", shipment.shipment.incoterm],
                ["Declared value", `${shipment.shipment.currency} ${shipment.shipment.declaredValue}`],
                ["Country of origin", shipment.cargo.countryOfOrigin],
                ["HS code", shipment.cargo.hsCode],
                ["Broker", shipment.broker || "—"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm text-steel">{label}</p>
                  <p className="mt-1 font-medium text-pearl">{value}</p>
                </div>
              ))}
            </div>
          </Panel>

          <AiPanel ai={ai} />

          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-pearl">Documents</h2>
                <p className="mt-1 text-sm text-steel">
                  Upload all shipment PDFs together so AI can sort and validate them in one run.
                </p>
              </div>
            </div>

            {!documentsLocked && (
              <div className="mt-5 grid gap-4">
                <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 sm:flex-row">
                  <input
                    value={newDocumentName}
                    onChange={(event) => setNewDocumentName(event.target.value)}
                    placeholder="Additional document name"
                    className="min-h-10 flex-1 rounded-lg border border-blue-100 bg-white px-3 text-sm font-semibold text-pearl outline-none focus:border-[#4DA2FF]"
                  />
                  <Button variant="secondary" onClick={addDocument} disabled={!newDocumentName.trim() || documentPhase !== "idle"}>
                    <Plus className="h-4 w-4" />
                    Add document
                  </Button>
                </div>

                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (documentPhase === "idle") setDragOver(true);
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (documentPhase === "idle") setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    if (documentPhase !== "idle") return;
                    addToStaged(Array.from(event.dataTransfer.files));
                  }}
                  onClick={() => documentPhase === "idle" && batchInputRef.current?.click()}
                  className={cn(
                    "rounded-2xl border-2 border-dashed p-8 text-center transition",
                    documentPhase === "extracting" ? "cursor-default" : "cursor-pointer",
                    dragOver ? "border-[#4DA2FF] bg-blue-50" : "border-[#4DA2FF]/45 bg-white hover:bg-blue-50/40"
                  )}
                >
                  {documentPhase === "extracting" ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-[#4DA2FF]" />
                      <h3 className="text-xl font-extrabold text-pearl">AI is sorting documents...</h3>
                    </div>
                  ) : (
                    <>
                      <Upload className="mx-auto h-10 w-10 text-[#4DA2FF]" />
                      <h3 className="mt-3 text-xl font-extrabold text-pearl">Drop PDFs here or click to add</h3>
                      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-steel">
                        Upload invoices, packing lists, BL/AWB, origin certificates, permits, and support files together.
                      </p>
                    </>
                  )}
                </div>

                <input
                  ref={batchInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    addToStaged(Array.from(event.target.files || []));
                    event.target.value = "";
                  }}
                />

                {stagedFiles.length > 0 && documentPhase === "idle" && (
                  <div className="grid gap-3 rounded-2xl border border-blue-100 bg-white p-4">
                    <p className="text-xs font-bold uppercase text-steel">
                      Staged — {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} ready for AI sorting
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {stagedFiles.map((file) => (
                        <div
                          key={file.name}
                          className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-pearl"
                        >
                          <FileCheck2 className="h-3 w-3 shrink-0 text-[#4DA2FF]" />
                          <span className="max-w-[220px] truncate" title={file.name}>{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setStagedFiles((current) => current.filter((item) => item.name !== file.name))}
                            className="ml-1 rounded-full text-steel transition hover:text-red-500"
                            aria-label={`Remove ${file.name}`}
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button onClick={extractStagedFiles} className="w-fit">
                      <Upload className="h-4 w-4" />
                      AI sort {stagedFiles.length} document{stagedFiles.length !== 1 ? "s" : ""}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
	                  <tr className="border-b border-blue-50 text-xs font-bold uppercase text-steel">
	                    <th className="pb-3 pr-4">Document</th>
	                    <th className="pb-3 pr-4">Status</th>
	                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {shipment.documents.map((doc) => (
                      <tr key={doc.name} className="align-top">
                        <td className="py-4 pr-4">
                          <p className="font-bold text-pearl">{doc.name}</p>
                          {doc.fileName && (
                            <p className="mt-1 text-xs font-semibold text-steel">File: {doc.fileName}</p>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          {documentsLocked && doc.uploaded ? (
                            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />
                              Uploaded to Walrus
                            </span>
                          ) : documentsLocked ? (
                            <span className="text-xs font-semibold text-steel">Not included</span>
                          ) : doc.uploaded ? (
	                            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
	                              <CheckCircle2 className="h-3 w-3" />
	                              Uploaded
	                            </span>
	                          ) : (
	                            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600">
	                              Pending
	                            </span>
	                          )}
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <aside className="grid h-fit min-w-0 gap-6">
          <ProgressManifestPanel manifests={shipment.progressManifests ?? []} recording={progressBusy} />
        </aside>
      </div>
    </div>
  );
}

function AiPanel({ ai }: {
  ai?: AiResult;
}) {
  const shortResults = ai?.checks
    .filter((check) => check.status === "missing" || check.status === "mismatch")
    .slice(0, 3);

  return (
    <Panel>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#4DA2FF]" />
          <h2 className="text-xl font-semibold text-pearl">AI Overview</h2>
        </div>
        {ai && <RiskBadge value={ai.riskLevel} />}
      </div>

      {!ai ? (
        <>
          <p className="mt-3 text-sm font-semibold text-steel">
            AI Validation has not started yet.
          </p>
        </>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-steel">AI Validation</p>
            <p className="mt-1 text-sm font-semibold text-pearl">{ai.summary}</p>
            <p className="mt-2 text-xs font-semibold text-steel">Ran {formatDate(ai.ranAt)}</p>
          </div>

          <div className="mt-4 grid gap-2">
            {(shortResults && shortResults.length > 0 ? shortResults : ai.checks.slice(0, 3)).map((check) => (
              <AiCheckRow key={check.field} check={check} />
            ))}
          </div>

        </>
      )}
    </Panel>
  );
}

function buildShipmentAiOverview(shipment: ShipmentRecord): AiResult {
  return buildAiOverview(shipment.documents, undefined, shipment.extractionStatus);
}

function buildAiOverview(
  docs: DocumentRequirement[],
  result?: AggregateLike,
  extractionStatus?: ShipmentRecord["extractionStatus"]
): AiResult {
  const uploadedDocs = docs.filter((doc) => doc.uploaded);
  const pendingDocs = docs.filter((doc) => !doc.uploaded);
  const requiredPendingDocs = pendingDocs.filter((doc) => doc.required);
  const issues = result?.cross_validation ?? [];
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const warningIssues = issues.filter((issue) => issue.severity === "warning");
  const checks: AiCheck[] = [];

  if (extractionStatus === "extracting") {
    checks.push({
      field: "AI Validation",
      status: "info",
      detail: "Documents are being read now.",
      documents: uploadedDocs.map((doc) => doc.name),
    });
  }

  if (uploadedDocs.length === 0) {
    checks.push({
      field: "Documents",
      status: "missing",
      detail: "No documents have been uploaded for this shipment yet.",
      documents: [],
    });
  } else {
    checks.push({
      field: "Uploaded documents",
      status: "matched",
      detail: `${uploadedDocs.length} document${uploadedDocs.length !== 1 ? "s" : ""} uploaded: ${uploadedDocs.map((doc) => doc.name).join(", ")}.`,
      documents: uploadedDocs.map((doc) => doc.name),
    });
  }

  if (requiredPendingDocs.length > 0) {
    checks.push({
      field: "Missing documents",
      status: "missing",
      detail: `${requiredPendingDocs.length} required document${requiredPendingDocs.length !== 1 ? "s are" : " is"} still pending: ${requiredPendingDocs.map((doc) => doc.name).join(", ")}.`,
      documents: requiredPendingDocs.map((doc) => doc.name),
    });
  }

  for (const issue of blockingIssues.slice(0, 3)) {
    checks.push({
      field: issue.field || "Document mismatch",
      status: "mismatch",
      detail: issue.message || "AI found a blocking mismatch.",
      documents: uploadedDocs.map((doc) => doc.name),
    });
  }

  for (const issue of warningIssues.slice(0, 2)) {
    checks.push({
      field: issue.field || "Document warning",
      status: "info",
      detail: issue.message || "AI found a warning to review.",
      documents: uploadedDocs.map((doc) => doc.name),
    });
  }

  if (checks.length === 0) {
    checks.push({
      field: "Documents",
      status: "matched",
      detail: "Uploaded documents are ready for final validation.",
      documents: uploadedDocs.map((doc) => doc.name),
    });
  }

  let score = 100;
  score -= requiredPendingDocs.length * 20;
  score -= blockingIssues.length * 30;
  score -= warningIssues.length * 10;
  if (uploadedDocs.length === 0) score = 0;
  score = Math.max(0, Math.min(100, score));

  const riskLevel: AiResult["riskLevel"] = blockingIssues.length > 0 || uploadedDocs.length === 0
    ? "High"
    : requiredPendingDocs.length > 0 || warningIssues.length > 0
      ? "Medium"
      : "Low";

  const summary = uploadedDocs.length === 0
    ? "No documents uploaded yet. AI validation is waiting for shipment documents."
    : blockingIssues.length > 0
      ? `AI found ${blockingIssues.length} blocking issue${blockingIssues.length !== 1 ? "s" : ""}.`
      : requiredPendingDocs.length > 0
        ? `AI detected ${uploadedDocs.length} uploaded document${uploadedDocs.length !== 1 ? "s" : ""}; ${requiredPendingDocs.length} required document${requiredPendingDocs.length !== 1 ? "s are" : " is"} still pending.`
        : warningIssues.length > 0
          ? `AI detected all required documents with ${warningIssues.length} warning${warningIssues.length !== 1 ? "s" : ""}.`
          : "AI detected the uploaded documents and found no blocking issues.";

  return {
    score,
    riskLevel,
    checks,
    ranAt: new Date().toISOString(),
    summary,
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { error: text } : {};
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

function docsWithExtractionResult(
  docs: DocumentRequirement[],
  result: AggregateLike,
  defaultOwner: DocumentOwner = "Importer"
): DocumentRequirement[] {
  const now = new Date().toISOString();
  const usedFileNames = new Set<string>();
  const nextDocs = docs.map((doc) => {
    const docLower = doc.name.toLowerCase();
    if (docLower.includes("commercial invoice") && result.detected?.commercial_invoice?.length) {
      const fileName = result.detected.commercial_invoice[0].file_name;
      usedFileNames.add(fileName);
      return { ...doc, uploaded: true, fileName, uploadedAt: now };
    }
    if (docLower.includes("packing list") && result.detected?.packing_list?.length) {
      const fileName = result.detected.packing_list[0].file_name;
      usedFileNames.add(fileName);
      return { ...doc, uploaded: true, fileName, uploadedAt: now };
    }
    if ((docLower.includes("bill of lading") || docLower.includes("air waybill")) && result.detected?.bill_of_lading?.length) {
      const fileName = result.detected.bill_of_lading[0].file_name;
      usedFileNames.add(fileName);
      return { ...doc, uploaded: true, fileName, uploadedAt: now };
    }
    if (docLower.includes("certificate of origin") && result.detected?.certificate_of_origin?.length) {
      const fileName = result.detected.certificate_of_origin[0].file_name;
      usedFileNames.add(fileName);
      return { ...doc, uploaded: true, fileName, uploadedAt: now };
    }
    return doc;
  });
  const existingFiles = new Set(nextDocs.map((doc) => doc.fileName).filter(Boolean));
  const existingNames = new Set(nextDocs.map((doc) => doc.name.toLowerCase()));
  const extras = detectedDocumentFiles(result)
    .filter((item) => !usedFileNames.has(item.fileName) && !existingFiles.has(item.fileName))
    .map((item, index) => {
      let name = item.label;
      if (existingNames.has(name.toLowerCase())) name = `${item.label} ${index + 2}`;
      existingNames.add(name.toLowerCase());
      return {
        name,
        owner: defaultOwner,
        required: false,
        uploaded: true,
        fileName: item.fileName,
        uploadedAt: now
      };
    });

  return [...nextDocs, ...extras];
}

function detectedDocumentFiles(result: AggregateLike) {
  return [
    ...(result.detected?.commercial_invoice ?? []).map((doc) => ({ label: "Commercial Invoice", fileName: doc.file_name })),
    ...(result.detected?.packing_list ?? []).map((doc) => ({ label: "Packing List", fileName: doc.file_name })),
    ...(result.detected?.bill_of_lading ?? []).map((doc) => ({ label: "Bill of Lading / Air Waybill", fileName: doc.file_name })),
    ...(result.detected?.certificate_of_origin ?? []).map((doc) => ({ label: "Certificate of Origin", fileName: doc.file_name }))
  ];
}

function ProgressManifestPanel({ manifests, recording }: { manifests: ProgressManifest[]; recording: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const orderedManifests = [...manifests].sort((a, b) => b.sequence - a.sequence);
  const visibleManifests = expanded ? orderedManifests : orderedManifests.slice(0, 2);
  const previewManifest = !expanded && orderedManifests.length > 2 ? orderedManifests[2] : null;

  return (
    <Panel className="min-w-0 overflow-hidden">
      <div className="flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-sui" />
        <h2 className="truncate text-xl font-semibold text-pearl">Progress</h2>
      </div>
      {recording && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#4DA2FF]" />
          <div>
            <p className="text-sm font-bold text-pearl">Recording progress...</p>
            <p className="mt-1 text-xs font-semibold text-steel">Uploading the checkpoint to MemWal.</p>
          </div>
        </div>
      )}
      {manifests.length === 0 && !recording ? (
        <p className="mt-3 text-sm text-steel">
          No progress has been recorded yet. Creating or checking documents will add the first checkpoint.
        </p>
      ) : manifests.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {visibleManifests.map((manifest) => (
            <ProgressItem key={manifest.id} manifest={manifest} />
          ))}
          {previewManifest && (
            <div className="pointer-events-none max-h-20 overflow-hidden opacity-45 blur-[1px]">
              <ProgressItem manifest={previewManifest} />
            </div>
          )}
          {orderedManifests.length > 2 && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-extrabold text-[#4DA2FF] hover:bg-blue-100"
            >
              {expanded ? "View less" : "View more"}
            </button>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

function ProgressItem({ manifest }: { manifest: ProgressManifest }) {
  const walrusPackage = getWalrusPackage(manifest);
  const suiPassport = getSuiPassportProgress(manifest);

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-steel">
          #{manifest.sequence} · {formatStage(manifest.stage)}
        </p>
        <p className="mt-1 text-sm font-bold text-pearl">{manifest.summary}</p>
      </div>
      <p className="mt-2 break-all font-mono text-[11px] text-steel">
        ID: {manifest.memwalBlobId ?? manifest.memwalNamespace}
      </p>
      {walrusPackage && (
        <a
          href={aggregatorUrl(walrusPackage.blobId, walrusPackage.aggregator)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4DA2FF] px-3 py-2 text-xs font-extrabold text-white shadow-glow hover:brightness-105"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Download ZIP from Walrus
        </a>
      )}
      {suiPassport && (
        <a
          href={`https://suiscan.xyz/${suiPassport.network}/tx/${suiPassport.txDigest}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pearl px-3 py-2 text-xs font-extrabold text-white shadow-glow hover:brightness-105"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Sui transaction
        </a>
      )}
      <p className="mt-2 text-[10px] font-semibold text-steel">{formatDate(manifest.createdAt)}</p>
    </div>
  );
}

function formatStage(stage: string) {
  return stage.replace(/_/g, " ");
}

function getWalrusPackage(manifest: ProgressManifest): WalrusUpload | null {
  if (manifest.stage !== "walrus_package_stored") return null;

  try {
    const parsed = JSON.parse(manifest.manifestJson) as { walrus_package?: Partial<WalrusUpload> };
    const walrusPackage = parsed.walrus_package;
    if (
      typeof walrusPackage?.blobId !== "string" ||
      typeof walrusPackage.fileName !== "string" ||
      typeof walrusPackage.sizeBytes !== "number" ||
      typeof walrusPackage.uploadedAt !== "string" ||
      typeof walrusPackage.publisher !== "string" ||
      typeof walrusPackage.aggregator !== "string"
    ) {
      return null;
    }

    return walrusPackage as WalrusUpload;
  } catch {
    return null;
  }
}

function getSuiPassportProgress(manifest: ProgressManifest): SuiPassportProgress | null {
  if (manifest.stage !== "sui_passport_created") return null;

  try {
    const parsed = JSON.parse(manifest.manifestJson) as { sui_passport?: Partial<SuiPassportProgress> };
    const suiPassport = parsed.sui_passport;
    if (
      typeof suiPassport?.txDigest !== "string" ||
      typeof suiPassport.packageId !== "string" ||
      suiPassport.network !== "testnet"
    ) {
      return null;
    }

    return suiPassport as SuiPassportProgress;
  } catch {
    return null;
  }
}

function AiCheckRow({ check }: { check: AiCheck }) {
  const tone =
    check.status === "matched"
      ? { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-600", Icon: CheckCircle2 }
      : check.status === "info"
        ? { bg: "bg-blue-50", border: "border-blue-100", text: "text-[#4DA2FF]", Icon: Info }
        : check.status === "mismatch"
          ? { bg: "bg-red-50", border: "border-red-100", text: "text-red-500", Icon: XCircle }
          : { bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-600", Icon: AlertCircle };
  const Icon = tone.Icon;
  return (
    <div className={cn("rounded-xl border px-3 py-2", tone.bg, tone.border)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone.text)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-extrabold text-pearl">{check.field}</p>
          <p className="mt-0.5 text-xs leading-5 text-steel">{check.detail}</p>
        </div>
      </div>
    </div>
  );
}

function DemoShipmentView({ shipment }: { shipment: ReturnType<typeof findShipment> & {} }) {
  const qrValue = `suiship://passport/${shipment.objectId || shipment.id}`;
  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
      <Link href="/shipments" className="inline-flex items-center gap-2 text-sm text-steel hover:text-pearl">
        <ArrowLeft className="h-4 w-4" />
        Back to shipments
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-sui">Demo shipment passport</p>
          <h1 className="mt-3 text-4xl font-semibold text-pearl">{shipment.id}</h1>
          <p className="mt-3 text-steel">
            {shipment.cargo} from {shipment.origin} to {shipment.destination}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={shipment.status} />
          <RiskBadge value={shipment.riskLevel} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid gap-6">
          <Panel>
            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["AI score", `${shipment.aiScore}%`, ShieldCheck],
                ["Documents", `${shipment.documents.length}`, FileCheck2],
                ["Transport", shipment.transportMode, Globe2],
                ["Updated", shipment.updatedAt, Clock3]
              ].map(([label, value, Icon]) => {
                const IconComponent = Icon as typeof Globe2;
                return (
                  <div key={String(label)} className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                    <IconComponent className="h-5 w-5 text-[#4DA2FF]" />
                    <p className="mt-4 text-sm text-steel">{label as string}</p>
                    <p className="mt-1 font-semibold text-pearl">{value as string}</p>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Passport overview</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Exporter", shipment.shipper],
                ["Importer", shipment.consignee],
                ["Carrier", shipment.carrier],
                ["Incoterm", shipment.incoterm],
                ["Declared value", shipment.declaredValue],
                ["Owner", shipment.owner]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm text-steel">{label}</p>
                  <p className="mt-1 font-medium text-pearl">{value}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Document hash verification</h2>
            <div className="mt-5 grid gap-3">
              {shipment.documents.map((document) => (
                <div key={document.hash} className="rounded-lg border border-blue-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-pearl">{document.name}</p>
                      <p className="mt-1 text-sm text-steel">{document.kind} stored off-chain</p>
                    </div>
                    <StatusBadge value={document.verified ? "Hash Verified" : "Pending"} />
                  </div>
                  <p className="mt-3 break-all rounded-lg bg-blue-50 px-3 py-2 text-xs text-steel">{document.hash}</p>
                  <p className="mt-2 break-all text-xs text-sui">{document.storageUri}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="grid h-fit gap-6">
          <Panel>
            <div className="flex items-center gap-3">
              <Boxes className="h-5 w-5 text-sui" />
              <h2 className="text-xl font-semibold text-pearl">On-chain proof</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <p className="text-steel">Sui object ID</p>
              <p className="break-all rounded-lg bg-blue-50 p-3 text-pearl">{shipment.objectId}</p>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center gap-3">
              <Fingerprint className="h-5 w-5 text-sui" />
              <h2 className="text-xl font-semibold text-pearl">QR shipment link</h2>
            </div>
            <div className="mt-5 flex justify-center">
              <QrCard value={qrValue} />
            </div>
            <p className="mt-4 break-all text-center text-xs text-steel">{qrValue}</p>
          </Panel>

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Customs action</h2>
            <p className="mt-2 text-sm text-steel">For a real minted object, this signs a Sui status update transaction.</p>
            <div className="mt-5">
              <PassportActions objectId={shipment.objectId} />
            </div>
          </Panel>
        </aside>
      </div>

      <Panel className="mt-6 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        <p className="text-sm font-semibold text-pearl">This is a demo passport shipped with SuiShip for previews.</p>
      </Panel>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
