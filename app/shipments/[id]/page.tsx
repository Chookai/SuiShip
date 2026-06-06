"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Loader2,
  Plus,
  Trash2,
  Upload,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CustodyChain } from "@/components/CustodyChain";
import { ShipmentCaseFile } from "@/components/ShipmentCaseFile";
import { ShipmentChatbot } from "@/components/ShipmentChatbot";
import { useRole } from "@/components/role-context";
import { Button, Panel } from "@/components/ui";
import {
  useShipments,
  type AiCheck,
  type AiResult,
  type DocumentOwner,
  type DocumentRequirement,
  type ProgressManifest,
  type ShipmentRecord,
} from "@/lib/shipments-store";
import { cn } from "@/lib/utils";
type AggregateLike = {
  extractedRef?: string;
  cross_validation?: Array<{ severity?: string; message?: string; field?: string }>;
  extractionProvenance?: Array<{
    fileId: string;
    fileName: string;
    mode: "live_haiku" | "cached_haiku" | "mock";
    model: string | null;
    latencyMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    extractedAt: string;
  }>;
  detected?: {
    commercial_invoice?: Array<{ file_name: string }>;
    packing_list?: Array<{ file_name: string }>;
    bill_of_lading?: Array<{ file_name: string }>;
    certificate_of_origin?: Array<{ file_name: string }>;
    other?: Array<{ file_name: string; extraction_result?: { detected_label?: string } }>;
  };
};

function isAirTransportMode(mode?: string) {
  return mode?.trim().toLowerCase() === "air";
}

function transportDocumentLabel(mode?: string) {
  return isAirTransportMode(mode) ? "Air Waybill (AWB)" : "Bill of Lading";
}

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const { shipments, ready, addShipment, updateShipment } = useShipments();
  const { role } = useRole();
  const rawId = decodeURIComponent(params?.id || "");
  const [serverShipment, setServerShipment] = useState<ShipmentRecord | null>(null);
  const [lookupComplete, setLookupComplete] = useState(false);

  const stored = useMemo(() => shipments.find((shipment) => shipment.id === rawId), [shipments, rawId]);

  // Always fetch from server on mount (even when stored in localStorage) so that
  // server-side passport mints (passportId, txDigest, walrusBlobIds) are synced back.
  useEffect(() => {
    if (!ready || !rawId) return;

    let cancelled = false;
    setLookupComplete(false);

    fetch(`/api/shipments/${encodeURIComponent(rawId)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as ShipmentRecord;
      })
      .then((record) => {
        if (cancelled || !record) {
          if (!cancelled) setLookupComplete(true);
          return;
        }
        if (stored) {
          updateShipment(rawId, record);
        } else {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rawId]);

  if (!ready || (!stored && !serverShipment && !lookupComplete)) {
    return (
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
        <Panel>
          <p className="text-pearl">Loading shipment...</p>
        </Panel>
      </div>
    );
  }

  if (stored) {
    const currentRoleOwner: DocumentOwner = role === "Importer" ? "Importer" : "Exporter";
    return (
      <StoredShipmentView
        shipment={stored}
        currentRoleOwner={currentRoleOwner}
        onUpdate={(patch) => updateShipment(stored.id, patch)}
      />
    );
  }

  if (serverShipment) {
    const currentRoleOwner: DocumentOwner = role === "Importer" ? "Importer" : "Exporter";
    return (
      <StoredShipmentView
        shipment={serverShipment}
        currentRoleOwner={currentRoleOwner}
        onUpdate={(patch) => updateShipment(serverShipment.id, patch)}
      />
    );
  }

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

function StoredShipmentView({
  shipment,
  currentRoleOwner,
  onUpdate,
}: {
  shipment: ShipmentRecord;
  currentRoleOwner: DocumentOwner;
  onUpdate: (patch: Partial<ShipmentRecord>) => void;
}) {
  const router = useRouter();
  const currentAccount = useCurrentAccount();
  const { role: actorRole } = useRole();
  const [documentPhase, setDocumentPhase] = useState<"idle" | "extracting" | "validating" | "minting">("idle");
  const [panelRefreshNonce, setPanelRefreshNonce] = useState(0);

  async function refreshAfterEndorsement() {
    setPanelRefreshNonce((n) => n + 1);
    try {
      const res = await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}`);
      if (res.ok) {
        const record = (await res.json()) as ShipmentRecord;
        onUpdate(record);
      }
    } catch {
      // custody chain already refetched passport state
    }
    router.refresh();
  }
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [newDocumentName, setNewDocumentName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const requiredDocs = shipment.documents.filter((doc) => doc.required);
  const requiredDocsComplete = requiredDocs.length > 0 && requiredDocs.every((doc) => doc.uploaded);
  const mintedExists = Boolean(shipment.passportId || shipment.txDigest);
  const hasFinalManifest = (shipment.progressManifests ?? []).some((manifest) => manifest.stage === "final_manifest");
  const documentsLocked = mintedExists || hasFinalManifest || Boolean(shipment.walrus);
  const passportBusy = documentPhase === "validating" || documentPhase === "minting";
  const canFinalize =
    requiredDocsComplete &&
    shipment.extractionStatus === "complete" &&
    !mintedExists &&
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
  }): Promise<ProgressManifest> {
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
      // noop
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
      // Step 1: Extract documents (AI sort)
      const formData = new FormData();
      formData.append("shipmentId", shipment.id);
      files.forEach((file) => formData.append("files", file));
      const res = await fetch("/api/documents/extract", { method: "POST", body: formData });
      const payload = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `Extraction failed with HTTP ${res.status}`));
      }
      const detectedDocs = docsWithExtractionResult(
        shipment.documents,
        payload as AggregateLike,
        shipment.shipment.transportMode,
        currentRoleOwner
      );

      const allRequiredUploaded = detectedDocs.filter((doc) => doc.required).every((doc) => doc.uploaded);
      onUpdate({
        documents: detectedDocs,
        ai: buildAiOverview(detectedDocs, payload as AggregateLike),
        extractionStatus: "complete",
        extractedRef: typeof (payload as { extractedRef?: unknown }).extractedRef === "string" ? (payload as { extractedRef: string }).extractedRef : shipment.extractedRef,
        status: allRequiredUploaded ? "Documents Uploaded" : "In Progress"
      });

      setDocumentPhase("validating");
      try {
        await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadedCount: files.length }),
        });
      } catch {
        // non-fatal — Document Agent may retry via GET/POST
      }
      setPanelRefreshNonce((k: number) => k + 1);

      // MemWal upload event (fire-and-forget)
      const uploadCompany = currentRoleOwner === "Exporter"
        ? shipment.exporter.company
        : shipment.importer.company;
      const newlyUploaded = detectedDocs.filter(d => d.uploaded && !shipment.documents.find(od => od.name === d.name && od.uploaded));
      fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/memory-write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "documents_uploaded",
          actor: uploadCompany,
          role: currentRoleOwner,
          document_count: files.length,
          documents_uploaded: newlyUploaded.length > 0
            ? newlyUploaded.map(d => d.name)
            : files.map(f => f.name),
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});

    } catch (err) {
      onUpdate({ extractionStatus: "failed" });
      setWorkflowError(err instanceof Error ? err.message : "Document extraction failed");
    } finally {
      setDocumentPhase("idle");
    }
  }

  async function clearSelectedDocuments() {
    if (selectedDocs.size === 0 || documentsLocked) return;
    const clearedNames = [...selectedDocs];
    const clearedFileNames = shipment.documents
      .filter((doc) => selectedDocs.has(doc.name) && doc.fileName)
      .map((doc) => doc.fileName!);

    const updatedDocs = shipment.documents.map((doc) => {
      if (!selectedDocs.has(doc.name)) return doc;
      return {
        ...doc,
        uploaded: false,
        fileName: undefined,
        uploadedAt: undefined,
        extractionSource: undefined,
        extractionModel: undefined,
        extractionLatencyMs: undefined,
        extractionInputTokens: undefined,
        extractionOutputTokens: undefined,
        extractedAt: undefined,
      };
    });
    setSelectedDocs(new Set());
    onUpdate({ documents: updatedDocs });

    const companyName = currentRoleOwner === "Exporter"
      ? shipment.exporter.company
      : shipment.importer.company;

    // Delete cleared files from shipment_files in DB
    if (clearedFileNames.length > 0) {
      try {
        await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/clear-docs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileNames: clearedFileNames }),
        });
      } catch {
        // non-fatal
      }
    }

    try {
      await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/memory-write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "documents_cleared",
          actor: companyName,
          role: currentRoleOwner,
          cleared_documents: clearedNames,
          timestamp: new Date().toISOString(),
        }),
      });
      setPanelRefreshNonce((k: number) => k + 1);
    } catch {
      // non-fatal
    }
  }

  function toggleDocSelection(docName: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docName)) next.delete(docName);
      else next.add(docName);
      return next;
    });
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

    try {
      const readinessRes = await fetch(
        `/api/shipments/${encodeURIComponent(shipment.id)}/mint/readiness`
      );
      const readinessPayload = await parseJsonResponse(readinessRes);
      if (!readinessRes.ok) {
        throw new Error(getErrorMessage(readinessPayload, "Could not check mint readiness"));
      }

      const readiness = readinessPayload as {
        ok?: boolean;
        blockers?: string[];
        needsRevalidate?: boolean;
      };

      if (!readiness.ok && !readiness.needsRevalidate) {
        const blockers = readiness.blockers ?? [];
        setWorkflowError(
          blockers.join(" ") ||
            "Resolve validation issues in Document Agent before creating the passport."
        );
        return;
      }

      let validationPayload: unknown = null;

      if (readiness.ok) {
        const cachedRes = await fetch(
          `/api/shipments/${encodeURIComponent(shipment.id)}/validate`
        );
        if (cachedRes.ok) {
          validationPayload = await cachedRes.json();
        }
      } else {
        setDocumentPhase("validating");
        const validationRes = await fetch(
          `/api/shipments/${encodeURIComponent(shipment.id)}/validate`,
          { method: "POST" }
        );
        validationPayload = await parseJsonResponse(validationRes);
        if (!validationRes.ok) {
          throw new Error(
            getErrorMessage(validationPayload, `Validation failed with HTTP ${validationRes.status}`)
          );
        }
        setPanelRefreshNonce((current: number) => current + 1);

        const recheckRes = await fetch(
          `/api/shipments/${encodeURIComponent(shipment.id)}/mint/readiness`
        );
        const recheck = (await parseJsonResponse(recheckRes)) as {
          ok?: boolean;
          blockers?: string[];
        };
        if (!recheckRes.ok || !recheck.ok) {
          setWorkflowError(
            (recheck.blockers ?? []).join(" ") ||
              "Validation did not pass. Review Document Agent before minting."
          );
          return;
        }
      }

      const issues = Array.isArray((validationPayload as { issues?: unknown })?.issues)
        ? ((validationPayload as { issues: Array<{ severity?: string; message?: string }> }).issues)
        : [];
      const blockingIssues = issues.filter((issue) => issue.severity === "error");
      if (blockingIssues.length > 0) {
        setWorkflowError(
          blockingIssues.map((issue) => issue.message).filter(Boolean).join(" ") ||
            "Validation found blocking document mismatches."
        );
        return;
      }

      setDocumentPhase("minting");
      const mintRes = await fetch(`/api/shipments/${encodeURIComponent(shipment.id)}/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAddress: currentAccount.address }),
      });
      const mintPayload = await parseJsonResponse(mintRes);
      if (!mintRes.ok) {
        throw new Error(getErrorMessage(mintPayload, `Mint failed with HTTP ${mintRes.status}`));
      }
      const mintedShipment = mintPayload as ShipmentRecord;
      onUpdate({
        ...mintedShipment,
        progressManifests: mintedShipment.progressManifests ?? shipment.progressManifests,
      });
      setPanelRefreshNonce((current: number) => current + 1);
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
          <p className="text-2xl font-bold uppercase tracking-wide text-sui">Shipment Details</p>
          <h1 className="mt-3 text-4xl font-semibold text-pearl">{shipment.id}</h1>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-steel">
            <span>Created by {creatorCompanyName(shipment)}</span>
            <span>Created: {formatDate(shipment.createdAt)}</span>
            <span>Updated: {formatDate(shipment.updatedAt)}</span>
          </div>
        </div>
        <div className="shrink-0 md:pr-8">
          {!mintedExists && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={finalizeShipment} disabled={!canFinalize || passportBusy}>
                {passportBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Fingerprint className="h-4 w-4" />
                )}
                {documentPhase === "minting"
                  ? "Creating passport…"
                  : documentPhase === "validating"
                    ? "Validating…"
                    : "Create Passport"}
              </Button>
            </div>
          )}
          {workflowError && (
            <p className="mt-2 max-w-64 text-right text-xs font-semibold text-red-600">{workflowError}</p>
          )}
        </div>
      </div>

      {/* Passport Minted Banner */}
      {mintedExists && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-emerald-800">Passport Created</h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shipment.passportId && (
                  <div className="rounded-xl border border-emerald-100 bg-white p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-steel">Sui Passport NFT</p>
                    <a
                      href={`https://suiscan.xyz/testnet/object/${shipment.passportId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1.5 font-mono text-xs text-sui hover:underline"
                    >
                      {shipment.passportId.slice(0, 10)}…{shipment.passportId.slice(-8)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {shipment.txDigest && (
                  <div className="rounded-xl border border-emerald-100 bg-white p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-steel">Sui Transaction</p>
                    <a
                      href={`https://suiscan.xyz/testnet/tx/${shipment.txDigest}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1.5 font-mono text-xs text-sui hover:underline"
                    >
                      {shipment.txDigest.slice(0, 10)}…{shipment.txDigest.slice(-8)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {shipment.walrusManifestBlobId && (
                  <div className="rounded-xl border border-blue-100 bg-white p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-steel">Walrus Evidence</p>
                    <a
                      href={`https://walruscan.com/testnet/blob/${shipment.walrusManifestBlobId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1.5 font-mono text-xs text-sui hover:underline"
                    >
                      {shipment.walrusManifestBlobId.slice(0, 10)}…{shipment.walrusManifestBlobId.slice(-8)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              {shipment.mintedAt && (
                <p className="mt-3 text-xs text-steel">Minted at {formatDate(shipment.mintedAt)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custody Chain — endorsement timeline (only after mint) */}
      {mintedExists && (
        <div className="mt-6">
          <CustodyChain
            shipmentId={shipment.id}
            onEndorsed={refreshAfterEndorsement}
          />
        </div>
      )}

      {/* Progress line → Trade Parties → Overview → Agent Hub (all inside ShipmentCaseFile) */}
      <div className="mt-6">
        <ShipmentCaseFile
          shipment={shipment}
          refreshKey={panelRefreshNonce}
        />
      </div>

      {/* Documents */}
      <div className="mt-6">
        <Panel className="min-w-0 overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-pearl">Documents</h2>
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
                  documentPhase !== "idle" ? "cursor-default" : "cursor-pointer",
                  dragOver ? "border-[#4DA2FF] bg-blue-50" : "border-[#4DA2FF]/45 bg-white hover:bg-blue-50/40"
                )}
              >
                {documentPhase === "extracting" || documentPhase === "validating" ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-[#4DA2FF]" />
                    <h3 className="text-xl font-extrabold text-pearl">
                      {documentPhase === "validating"
                        ? "AI is validating documents..."
                        : "AI is sorting documents..."}
                    </h3>
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

          {!documentsLocked && selectedDocs.size > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-700">
                {selectedDocs.size} document{selectedDocs.size !== 1 ? "s" : ""} selected
              </p>
              <button
                type="button"
                onClick={clearSelectedDocuments}
                disabled={documentPhase !== "idle"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Clear selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedDocs(new Set())}
                className="text-xs font-semibold text-steel hover:text-pearl"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-blue-50 text-xs font-bold uppercase text-steel">
                  {!documentsLocked && <th className="pb-3 pr-2 w-8" />}
                  <th className="pb-3 pr-4">Document</th>
                  <th className="pb-3 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50">
                {shipment.documents.map((doc) => (
                  <tr key={doc.name} className="align-top">
                    {!documentsLocked && (
                      <td className="py-4 pr-2">
                        {doc.uploaded && (
                          <input
                            type="checkbox"
                            checked={selectedDocs.has(doc.name)}
                            onChange={() => toggleDocSelection(doc.name)}
                            className="h-4 w-4 rounded border-blue-300 text-sui focus:ring-sui"
                          />
                        )}
                      </td>
                    )}
                    <td className="py-4 pr-4">
                      <p className="font-bold text-pearl">{doc.name}</p>
                      {doc.fileName && (
                        <p className="mt-1 text-xs font-semibold text-steel">File: {doc.fileName}</p>
                      )}
                      {extractionSourceLabel(doc) && (
                        <p className="mt-1 text-xs font-bold text-[#4DA2FF]">{extractionSourceLabel(doc)}</p>
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

      <ShipmentChatbot shipmentId={shipment.id} role={actorRole} />
    </div>
  );
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
  transportMode?: string,
  defaultOwner: DocumentOwner = "Importer"
): DocumentRequirement[] {
  const now = new Date().toISOString();
  const usedFileNames = new Set<string>();
  const nextDocs = docs.map((doc) => {
    const docLower = doc.name.toLowerCase();
    if (docLower.includes("commercial invoice") && result.detected?.commercial_invoice?.length) {
      const fileName = result.detected.commercial_invoice[0].file_name;
      usedFileNames.add(fileName);
      return withExtractionProvenance(doc, fileName, result, now);
    }
    if (docLower.includes("packing list") && result.detected?.packing_list?.length) {
      const fileName = result.detected.packing_list[0].file_name;
      usedFileNames.add(fileName);
      return withExtractionProvenance(doc, fileName, result, now);
    }
    if ((docLower.includes("bill of lading") || docLower.includes("air waybill")) && result.detected?.bill_of_lading?.length) {
      const fileName = result.detected.bill_of_lading[0].file_name;
      usedFileNames.add(fileName);
      return withExtractionProvenance(doc, fileName, result, now);
    }
    if (docLower.includes("certificate of origin") && result.detected?.certificate_of_origin?.length) {
      const fileName = result.detected.certificate_of_origin[0].file_name;
      usedFileNames.add(fileName);
      return withExtractionProvenance(doc, fileName, result, now);
    }
    return doc;
  });
  // Match remaining files to unmatched checklist entries by filename similarity
  const unmatchedDocs = nextDocs.filter(d => !d.uploaded && !d.fileName);
  const allDetectedFiles = [
    ...(result.detected?.commercial_invoice ?? []).map(d => d.file_name),
    ...(result.detected?.packing_list ?? []).map(d => d.file_name),
    ...(result.detected?.bill_of_lading ?? []).map(d => d.file_name),
    ...(result.detected?.certificate_of_origin ?? []).map(d => d.file_name),
    ...(result.detected?.other ?? []).map(d => d.file_name),
  ];
  const unassignedFiles = (result.extractionProvenance ?? [])
    .map(p => p.fileName)
    .filter(fn => !usedFileNames.has(fn));

  for (const fileName of unassignedFiles) {
    const fileBase = fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").toLowerCase();
    const match = unmatchedDocs.find(d => {
      const docLower = d.name.toLowerCase();
      return fileBase.includes(docLower) || docLower.includes(fileBase);
    });
    if (match) {
      const idx = nextDocs.indexOf(match);
      if (idx >= 0) {
        nextDocs[idx] = withExtractionProvenance(match, fileName, result, now);
        usedFileNames.add(fileName);
      }
    }
  }

  const existingFiles = new Set(nextDocs.map((doc) => doc.fileName).filter(Boolean));
  const existingNames = new Set(nextDocs.map((doc) => doc.name.toLowerCase()));
  const extras = detectedDocumentFiles(result, transportMode)
    .filter((item) => !usedFileNames.has(item.fileName) && !existingFiles.has(item.fileName))
    .map((item, index) => {
      let name = item.label;
      if (existingNames.has(name.toLowerCase())) name = `${item.label} ${index + 2}`;
      existingNames.add(name.toLowerCase());
      return withExtractionProvenance({
        name,
        owner: defaultOwner,
        required: false,
        uploaded: true,
      }, item.fileName, result, now);
    });

  return [...nextDocs, ...extras];
}

function withExtractionProvenance(
  doc: DocumentRequirement,
  fileName: string,
  result: AggregateLike,
  uploadedAt: string
): DocumentRequirement {
  const provenance = result.extractionProvenance?.find((item) => item.fileName === fileName);
  return {
    ...doc,
    uploaded: true,
    fileName,
    uploadedAt,
    extractionSource: provenance?.mode,
    extractionModel: provenance?.model ?? undefined,
    extractionLatencyMs: provenance?.latencyMs ?? undefined,
    extractionInputTokens: provenance?.inputTokens ?? undefined,
    extractionOutputTokens: provenance?.outputTokens ?? undefined,
    extractedAt: provenance?.extractedAt,
  };
}

function extractionSourceLabel(doc: DocumentRequirement) {
  const model = doc.extractionModel ? ` ${doc.extractionModel}` : "";
  const latency = typeof doc.extractionLatencyMs === "number" && doc.extractionLatencyMs > 0
    ? ` · ${(doc.extractionLatencyMs / 1000).toFixed(1)}s`
    : "";
  const tokens = typeof doc.extractionInputTokens === "number" && typeof doc.extractionOutputTokens === "number"
    ? ` · ${doc.extractionInputTokens + doc.extractionOutputTokens} tokens`
    : "";

  if (doc.extractionSource === "live_haiku") return `Live Haiku${model}${latency}${tokens}`;
  if (doc.extractionSource === "cached_haiku") return `Cached Haiku result${model}${tokens}`;
  if (doc.extractionSource === "mock") return "Mock extraction";
  return null;
}

function detectedDocumentFiles(result: AggregateLike, transportMode?: string) {
  return [
    ...(result.detected?.commercial_invoice ?? []).map((doc) => ({ label: "Commercial Invoice", fileName: doc.file_name })),
    ...(result.detected?.packing_list ?? []).map((doc) => ({ label: "Packing List", fileName: doc.file_name })),
    ...(result.detected?.bill_of_lading ?? []).map((doc) => ({ label: transportDocumentLabel(transportMode), fileName: doc.file_name })),
    ...(result.detected?.certificate_of_origin ?? []).map((doc) => ({ label: "Certificate of Origin", fileName: doc.file_name })),
    ...(result.detected?.other ?? []).map((doc) => ({
      label: doc.extraction_result?.detected_label
        ?? doc.file_name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      fileName: doc.file_name,
    })),
  ];
}

function creatorCompanyName(shipment: ShipmentRecord): string {
  const party = shipment.createdBy === "importer" ? shipment.importer : shipment.exporter;
  const company = party.company?.trim();
  return company || capitalize(shipment.createdBy);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
