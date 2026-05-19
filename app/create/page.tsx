"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  FilePlus2,
  Link2,
  Loader2,
  Lock,
  Plus,
  Share2,
  Ship,
  Upload,
  UserCheck,
  XCircle
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRole } from "@/components/role-context";
import { Button, Field, Panel, StatusBadge } from "@/components/ui";
import {
  generateInviteToken,
  generateShipmentId,
  useShipments,
  type DocumentOwner,
  type DocumentRequirement,
  type MintStorageResult,
  type ShipmentRecord,
  type WorkflowKey
} from "@/lib/shipments-store";
import { cn } from "@/lib/utils";
import type { AggregateResult } from "@/src/agent/schemas/aggregate-result";

const steps = ["Workflow", "Trade parties", "Shipment details", "Cargo details", "Document upload"];
const visibleStepIndexes = [0, 1, 2, 3, 4];
const lastVisibleStep = 4;

const workflowTitles: Record<WorkflowKey, string> = {
  importer: "Importer",
  exporter: "Exporter"
};

const documentCatalog: Array<{ name: string; defaultOwner: DocumentOwner; defaultRequired: boolean }> = [
  { name: "Commercial Invoice", defaultOwner: "Exporter", defaultRequired: true },
  { name: "Packing List", defaultOwner: "Exporter", defaultRequired: true },
  { name: "Air Waybill / Bill of Lading", defaultOwner: "Exporter", defaultRequired: true },
  { name: "Certificate of Origin", defaultOwner: "Exporter", defaultRequired: true },
  { name: "Customs Declaration", defaultOwner: "Importer", defaultRequired: false },
  { name: "Insurance Certificate", defaultOwner: "Importer", defaultRequired: false },
  { name: "Import / Export Permit", defaultOwner: "Importer", defaultRequired: false },
  { name: "Dangerous Goods Declaration", defaultOwner: "Exporter", defaultRequired: false }
];

const initialShipmentDetails = {
  shipmentId: "",
  origin: "Malaysia",
  originPort: "KUL Airport",
  destination: "United States",
  destinationPort: "LAX Airport",
  carrier: "DHL Global Forwarding",
  transportMode: "Air",
  incoterm: "DAP",
  etd: "2026-06-14",
  eta: "2026-06-18",
  declaredValue: "148200",
  currency: "USD",
  bookingRef: "",
  paymentTerms: "",
  blType: ""
};

const initialCargo = {
  description: "Semiconductor components",
  sku: "PMIC-8842",
  hsCode: "8542.31",
  quantity: "2400",
  grossWeight: "820 kg",
  netWeight: "760 kg",
  handlingUnits: "12 pallets",
  container: "",
  seal: "",
  countryOfOrigin: "Malaysia",
  dangerousGoods: "No",
  temperatureControlled: "No"
};

export default function CreateShipmentPage() {
  const router = useRouter();
  const { role, profile, profiles } = useRole();
  const { addShipment, updateShipment } = useShipments();

  const defaultWorkflow: WorkflowKey = role === "Exporter" ? "exporter" : "importer";

  const [workflow, setWorkflow] = useState<WorkflowKey>(defaultWorkflow);
  const [activeStep, setActiveStep] = useState(0);
  const [shipmentRecordId, setShipmentRecordId] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [createdInProgress, setCreatedInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mintResult, setMintResult] = useState<MintStorageResult | null>(null);

  // Async extraction state
  const [extractionStatus, setExtractionStatus] = useState<"idle" | "extracting" | "complete" | "failed">("idle");
  const [extractResult, setExtractResult] = useState<AggregateResult | null>(null);

  const counterpartyKey: "Importer" | "Exporter" = workflow === "importer" ? "Exporter" : "Importer";

  const [importer, setImporter] = useState({
    company: profiles.Importer.company,
    contact: profiles.Importer.contact,
    email: profiles.Importer.email,
    phone: profiles.Importer.phone,
    taxId: ""
  });
  const [exporter, setExporter] = useState({
    company: profiles.Exporter.company,
    contact: profiles.Exporter.contact,
    email: profiles.Exporter.email,
    phone: profiles.Exporter.phone,
    taxId: ""
  });
  const [broker, setBroker] = useState("");
  const [freightForwarder, setFreightForwarder] = useState("");
  const [notifyPartyEnabled, setNotifyPartyEnabled] = useState(false);
  const [notifyParty, setNotifyParty] = useState({ company: "", contact: "", email: "", phone: "", taxId: "" });
  const [details, setDetails] = useState({ ...initialShipmentDetails, shipmentId: generateShipmentId(defaultWorkflow) });
  const [cargo, setCargo] = useState(initialCargo);

  const initialDocs = useMemo<DocumentRequirement[]>(
    () =>
      documentCatalog.map((doc) => ({
        name: doc.name,
        owner: doc.defaultOwner,
        required: doc.defaultRequired,
        uploaded: false
      })),
    []
  );
  const [docs, setDocs] = useState<DocumentRequirement[]>(initialDocs);

  // Re-sync the creator's auto-filled party when the workflow changes.
  useEffect(() => {
    if (workflow === "importer") {
      setImporter((current) => ({ ...current, ...profile }));
    } else if (workflow === "exporter") {
      setExporter((current) => ({ ...current, ...profile }));
    }
    setDetails((current) => ({ ...current, shipmentId: generateShipmentId(workflow) }));
    setShipmentRecordId(null);
    setInviteToken(null);
    setCreatedInProgress(false);
  }, [workflow, profile]);

  // Step enforcement — steps 2, 3, 4 all require step 1 to be complete

  const selectedWorkflow = workflowTitles[workflow];

  // Step enforcement
  const isStep1Complete = useMemo(() => {
    const ok = (p: { company: string; contact: string; email: string }) =>
      p.company.trim().length > 0 && p.contact.trim().length > 0 && p.email.trim().length > 0;
    return ok(importer) && ok(exporter);
  }, [importer, exporter]);

  function canAccessStep(stepIndex: number): boolean {
    if (stepIndex === 0 || stepIndex === 1) return true;
    return isStep1Complete;
  }

  function isStepComplete(stepIndex: number): boolean {
    if (stepIndex === 0) return true;
    if (stepIndex === 1) return isStep1Complete;
    if (stepIndex === 2 || stepIndex === 3) return isStep1Complete;
    return false;
  }

  function buildShipmentRecord(status: ShipmentRecord["status"], token?: string): ShipmentRecord {
    const now = new Date().toISOString();
    return {
      id: details.shipmentId,
      createdAt: now,
      updatedAt: now,
      createdBy: workflow,
      workflow,
      status,
      importer,
      exporter,
      notifyParty: notifyPartyEnabled ? { ...notifyParty } : undefined,
      broker: broker || undefined,
      freightForwarder: freightForwarder || undefined,
      shipment: { ...details },
      cargo: { ...cargo },
      documents: docs,
      inviteToken: token,
      extractedRef: extractResult?.extractedRef,
      extractionStatus: extractionStatus === "extracting" ? "extracting"
        : extractionStatus === "complete" ? "complete"
        : extractionStatus === "failed" ? "failed"
        : undefined
    };
  }

  function generateInviteLink() {
    const token = inviteToken || generateInviteToken();
    setInviteToken(token);
    const record = buildShipmentRecord("Awaiting Counterparty", token);
    addShipment(record);
    setShipmentRecordId(record.id);
    return token;
  }

  function inviteUrl(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/invite/${token}?shipment=${encodeURIComponent(details.shipmentId)}`;
  }

  async function copyInviteLink() {
    const token = inviteToken || generateInviteLink();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  function docsWithAttachedFiles(current: DocumentRequirement[], files: File[]) {
    const now = new Date().toISOString();
    const next = current.map((doc) => ({ ...doc }));
    files.forEach((file) => {
      const detectedIndex = detectDocumentIndex(file.name, next);
      if (detectedIndex >= 0) {
        const target = next[detectedIndex];
        next[detectedIndex] = {
          ...target,
          uploaded: true,
          fileName: file.name,
          uploadedAt: now
        };
      }
    });
    return next;
  }

  function docsWithExtractionResult(
    current: DocumentRequirement[],
    result: AggregateResult
  ): DocumentRequirement[] {
    const now = new Date().toISOString();
    return current.map((doc) => {
      const docLower = doc.name.toLowerCase();
      if (docLower.includes("commercial invoice") && result.detected.commercial_invoice.length > 0) {
        return { ...doc, uploaded: true, fileName: result.detected.commercial_invoice[0].file_name, uploadedAt: now };
      }
      if (docLower.includes("packing list") && result.detected.packing_list.length > 0) {
        return { ...doc, uploaded: true, fileName: result.detected.packing_list[0].file_name, uploadedAt: now };
      }
      if ((docLower.includes("bill of lading") || docLower.includes("air waybill")) && result.detected.bill_of_lading.length > 0) {
        return { ...doc, uploaded: true, fileName: result.detected.bill_of_lading[0].file_name, uploadedAt: now };
      }
      if (docLower.includes("certificate of origin") && result.detected.certificate_of_origin.length > 0) {
        return { ...doc, uploaded: true, fileName: result.detected.certificate_of_origin[0].file_name, uploadedAt: now };
      }
      return doc;
    });
  }

  const creatorRequiredDocs = docs.filter((doc) => doc.required);
  const counterpartyRequiredDocs: DocumentRequirement[] = [];

  const allCreatorDocsUploaded = creatorRequiredDocs.every((doc) => doc.uploaded);

  function persistDraft(
    status: ShipmentRecord["status"],
    exStatus?: "extracting" | "complete" | "failed",
    docsOverride?: DocumentRequirement[]
  ) {
    const patch: Partial<ShipmentRecord> = {
      status,
      importer,
      exporter,
      notifyParty: notifyPartyEnabled ? { ...notifyParty } : undefined,
      broker: broker || undefined,
      freightForwarder: freightForwarder || undefined,
      shipment: { ...details },
      cargo: { ...cargo },
      documents: docsOverride ?? docs,
      inviteToken: inviteToken || undefined,
      extractedRef: extractResult?.extractedRef,
      extractionStatus: exStatus
    };
    if (shipmentRecordId) {
      updateShipment(shipmentRecordId, patch);
      return shipmentRecordId;
    }
    const record = buildShipmentRecord(status);
    if (docsOverride) record.documents = docsOverride;
    if (exStatus) record.extractionStatus = exStatus;
    addShipment(record);
    setShipmentRecordId(record.id);
    return record.id;
  }

  async function saveShipmentSnapshot(
    id: string,
    status: ShipmentRecord["status"],
    exStatus: "extracting" | "complete" | "failed",
    docsOverride: DocumentRequirement[]
  ) {
    const record = buildShipmentRecord(status);
    record.id = id;
    record.status = status;
    record.documents = docsOverride;
    record.extractionStatus = exStatus;
    record.updatedAt = new Date().toISOString();

    const response = await fetch("/api/shipments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!response.ok) {
      throw new Error(`Failed to save shipment before processing: HTTP ${response.status}`);
    }
  }

  async function parseJsonOrThrow(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      throw new Error(`Route returned HTML (${response.status}). Restart the Next dev server and try again.`);
    }

    throw new Error(text || `Unexpected non-JSON response (${response.status})`);
  }

  // Fire-and-forget extraction; merges new results into existing ones for accumulation
  async function startExtractionAsync(files: File[], shipmentId: string, baseDocs: DocumentRequirement[]) {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("shipmentId", shipmentId);
    try {
      await saveShipmentSnapshot(shipmentId, "In Progress", "extracting", baseDocs);
      const res = await fetch("/api/documents/extract", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const incoming: AggregateResult = await res.json();
      let merged = incoming;
      setExtractResult((prev) => {
        merged = prev ? mergeExtractionResults(prev, incoming) : incoming;
        return merged;
      });
      setExtractionStatus("complete");
      const updatedDocs = docsWithExtractionResult(baseDocs, merged);
      setDocs(updatedDocs);
      updateShipment(shipmentId, {
        extractionStatus: "complete",
        extractedRef: merged.extractedRef,
        documents: updatedDocs
      });
    } catch {
      setExtractionStatus("failed");
      updateShipment(shipmentId, { extractionStatus: "failed" });
    }
  }

  function handleFilesSelected(files: File[]) {
    if (files.length === 0) return;
    const nextDocs = docsWithAttachedFiles(docs, files);
    setDocs(nextDocs); // immediate filename display
    setExtractionStatus("extracting");
    const id = persistDraft("In Progress", "extracting", nextDocs);
    startExtractionAsync(files, id, nextDocs); // fire and forget
  }

  const hasValidationErrors = (extractResult?.cross_validation ?? []).some(
    (v) => v.severity === "error"
  );

  async function createShipmentNow() {
    if (!allCreatorDocsUploaded && extractionStatus !== "extracting") {
      setError("Upload all required documents before creating the shipment.");
      return;
    }
    if (extractionStatus === "extracting") {
      setError("Document extraction is still running. Wait for validation to complete, then create the shipment.");
      return;
    }
    if (extractionStatus === "failed" || !extractResult) {
      setError("Document extraction failed or has not completed. Re-upload the files and try again.");
      return;
    }
    if (hasValidationErrors) {
      setError("Shipment creation is blocked: cross-document mismatches detected. Fix the source documents and re-upload.");
      return;
    }
    setError(null);
    setCreatedInProgress(true);
    const status: ShipmentRecord["status"] = counterpartyRequiredDocs.length > 0 ? "In Progress" : "Documents Uploaded";
    const id = persistDraft(status, "complete");

    try {
      await saveShipmentSnapshot(id, status, "complete", docs);
      const response = await fetch("/api/shipments/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: id,
          ownerAddress: "0xmock_owner_address",
        }),
      });
      const payload = await parseJsonOrThrow(response);
      if (!response.ok) {
        const errorMessage =
          typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Mint failed with HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const result = payload as MintStorageResult;
      setMintResult(result);
      updateShipment(id, {
        status: "Passport Minted",
        passportId: result.passportId,
        txDigest: result.txDigest,
        mintedAt: result.mintedAt,
        walrusBlobIds: result.walrusBlobIds,
        walrusManifestBlobId: result.walrusBlobIds[0],
        memWalSpaceId: result.memWalSpaceId,
        manifestHash: result.manifestHash,
      });
      window.setTimeout(() => {
        router.push(`/shipments/${encodeURIComponent(id)}`);
      }, 1200);
    } catch (err) {
      setCreatedInProgress(false);
      setError(err instanceof Error ? err.message : "Shipment storage failed");
    }
  }

  function goBack() {
    const currentIndex = visibleStepIndexes.indexOf(activeStep);
    const previousIndex = Math.max(0, currentIndex - 1);
    setActiveStep(visibleStepIndexes[previousIndex] ?? 0);
    setError(null);
  }

  function goNext() {
    if (activeStep === 1 && !isStep1Complete) {
      setError("Please fill in company, contact, and email for both importer and exporter before continuing.");
      return;
    }
    setError(null);
    const currentIndex = visibleStepIndexes.indexOf(activeStep);
    const nextIndex = Math.min(visibleStepIndexes.length - 1, currentIndex + 1);
    setActiveStep(visibleStepIndexes[nextIndex] ?? lastVisibleStep);
  }

  const workflowOptions = useMemo<WorkflowKey[]>(() => {
    return role === "Exporter" ? ["exporter", "importer"] : ["importer", "exporter"];
  }, [role]);

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-10">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-pearl">Create Shipment</h1>
          <p className="mt-3 max-w-3xl text-steel">
            Start as an {role.toLowerCase()}. Auto-fill your own company, invite the counterparty, and upload only the
            documents your side owns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={selectedWorkflow} />
          <StatusBadge value={createdInProgress ? "In Progress" : shipmentRecordId ? "Awaiting Counterparty" : "Draft"} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Panel className="hidden h-fit xl:block">
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-steel">Progress</p>
          <div className="relative grid gap-0">
            {visibleStepIndexes.map((stepIndex, visibleIndex) => {
              const accessible = canAccessStep(stepIndex);
              const complete = isStepComplete(stepIndex);
              const isActive = activeStep === stepIndex;
              const isLast = visibleIndex === visibleStepIndexes.length - 1;
              return (
                <div key={steps[stepIndex]} className="relative flex items-stretch gap-3">
                  {/* Connector line + circle column */}
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (accessible) {
                          setActiveStep(stepIndex);
                          setError(null);
                        }
                      }}
                      disabled={!accessible}
                      aria-label={steps[stepIndex]}
                      className={cn(
                        "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ring-2 transition",
                        isActive
                          ? "bg-[#4DA2FF] text-white ring-[#4DA2FF]"
                          : complete
                            ? "bg-emerald-50 text-emerald-600 ring-emerald-400"
                            : accessible
                              ? "bg-white text-steel ring-blue-200 hover:ring-[#4DA2FF]/60"
                              : "cursor-not-allowed bg-white text-steel/40 ring-blue-100"
                      )}
                    >
                      {!accessible ? (
                        <Lock className="h-3 w-3" />
                      ) : complete && !isActive ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        visibleIndex + 1
                      )}
                    </button>
                    {!isLast && (
                      <div className={cn(
                        "w-0.5 flex-1 my-1",
                        complete ? "bg-emerald-200" : "bg-blue-100"
                      )} style={{ minHeight: "20px" }} />
                    )}
                  </div>
                  {/* Label */}
                  <button
                    type="button"
                    onClick={() => {
                      if (accessible) {
                        setActiveStep(stepIndex);
                        setError(null);
                      }
                    }}
                    disabled={!accessible}
                    className={cn(
                      "flex-1 pb-5 pt-1 text-left text-sm font-bold transition",
                      isLast && "pb-0",
                      !accessible && "cursor-not-allowed opacity-40",
                      isActive ? "text-[#4DA2FF]" : complete ? "text-emerald-600" : "text-steel hover:text-[#4DA2FF]"
                    )}
                  >
                    {steps[stepIndex]}
                    {isActive && (
                      <span className="ml-2 inline-block rounded-full bg-[#4DA2FF]/10 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#4DA2FF]">
                        Current
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="grid gap-6">
          {/* Mobile step progress bar — hidden on xl where sidebar shows */}
          <div className="flex items-center gap-1 xl:hidden">
            {visibleStepIndexes.map((stepIndex) => {
              const complete = isStepComplete(stepIndex);
              const isActive = activeStep === stepIndex;
              return (
                <div key={stepIndex} className="flex flex-1 flex-col items-center gap-1">
                  <div className={cn(
                    "h-1.5 w-full rounded-full transition",
                    isActive ? "bg-[#4DA2FF]" : complete ? "bg-emerald-400" : "bg-blue-100"
                  )} />
                  {isActive && (
                    <span className="text-[10px] font-bold text-[#4DA2FF]">{steps[stepIndex]}</span>
                  )}
                </div>
              );
            })}
          </div>

          <Panel>
            <div className="mb-6 flex items-center gap-3">
              <Ship className="h-5 w-5 text-[#4DA2FF]" />
              <h2 className="text-2xl font-extrabold text-pearl">{steps[activeStep]}</h2>
            </div>

            {activeStep === 0 && (
              <div className="grid gap-5">
                <p className="text-sm text-steel">
                  You are signed in as <span className="font-bold text-pearl">{role}</span> ({profile.company}). Pick the side
                  you act as on this shipment.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {workflowOptions.map((key) => {
                    const active = workflow === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setWorkflow(key)}
                        className={cn(
                          "flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border p-5 text-center text-xl font-extrabold transition",
                          active
                            ? "border-[#4DA2FF] bg-[#4DA2FF] text-white shadow-glow"
                            : "border-blue-100 bg-white text-pearl hover:border-[#4DA2FF]/50"
                        )}
                      >
                        <span>{workflowTitles[key]}</span>
                        <span className={cn("text-xs font-semibold", active ? "text-white/85" : "text-steel")}>
                          {key === "importer"
                            ? "Your side receives the goods"
                            : key === "exporter"
                              ? "Your side ships the goods"
                              : "You coordinate both sides"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-steel">
                  The {selectedWorkflow.toLowerCase()} starts the passport and invites the{" "}
                  {workflow === "importer" ? "exporter" : "importer"} via a share link.
                </div>
              </div>
            )}

            {activeStep === 1 && (
              <div className="grid gap-6">
                <PartyCard
                  title={workflow === "importer" ? "Importer (you)" : "Importer"}
                  locked={workflow === "importer"}
                  party={importer}
                  onChange={setImporter}
                />
                <PartyCard
                  title={workflow === "exporter" ? "Exporter (you)" : "Exporter"}
                  locked={workflow === "exporter"}
                  party={exporter}
                  onChange={setExporter}
                />

                {/* Notify party — required for Bill of Lading */}
                {notifyPartyEnabled ? (
                  <PartyCard
                    title="Notify party"
                    locked={false}
                    party={notifyParty}
                    onChange={setNotifyParty}
                    subtitle="Appears on the B/L — typically the bank (for LC) or freight forwarder."
                    onRemove={() => { setNotifyPartyEnabled(false); setNotifyParty({ company: "", contact: "", email: "", phone: "", taxId: "" }); }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setNotifyPartyEnabled(true)}
                    className="flex items-center gap-2 self-start rounded-2xl border border-dashed border-blue-200 px-4 py-2.5 text-sm font-bold text-[#4DA2FF] transition hover:border-[#4DA2FF] hover:bg-blue-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add notify party (B/L third party)
                  </button>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Customs broker (optional)" value={broker} onChange={setBroker} placeholder="If applicable" />
                  <Field label="Freight forwarder (optional)" value={freightForwarder} onChange={setFreightForwarder} placeholder="If applicable" />
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white">
                          <Share2 className="h-5 w-5 text-[#4DA2FF]" />
                        </span>
                        <div>
                          <p className="font-extrabold text-pearl">Invite the {counterpartyKey.toLowerCase()}</p>
                          <p className="text-sm text-steel">
                            Send this link so {counterpartyKey === "Exporter" ? exporter.company || "the exporter" : importer.company || "the importer"}{" "}
                            can join SuiShip and upload their required documents.
                          </p>
                        </div>
                      </div>
                      <Button variant="secondary" onClick={copyInviteLink}>
                        <Link2 className="h-4 w-4" />
                        {inviteToken ? "Regenerate link" : "Generate invite link"}
                      </Button>
                    </div>
                    {inviteToken && (
                      <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-white p-3 text-sm font-semibold text-pearl md:flex-row md:items-center md:justify-between">
                        <span className="break-all">{inviteUrl(inviteToken)}</span>
                        <button
                          type="button"
                          onClick={copyInviteLink}
                          className="inline-flex items-center gap-2 rounded-full bg-[#4DA2FF] px-3 py-2 text-xs font-extrabold text-white"
                        >
                          <Copy className="h-3 w-3" />
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}
                </div>

                {error && (
                  <p className="flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </p>
                )}
              </div>
            )}

            {activeStep === 2 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Shipment ID / Reference No."
                  value={details.shipmentId}
                  onChange={(value) => setDetails((current) => ({ ...current, shipmentId: value }))}
                />
                <Field
                  label="Carrier booking reference"
                  value={details.bookingRef}
                  onChange={(value) => setDetails((current) => ({ ...current, bookingRef: value }))}
                  placeholder="e.g. HLCU1234567"
                />
                <Field
                  label="Transport mode"
                  value={details.transportMode}
                  onChange={(value) => setDetails((current) => ({ ...current, transportMode: value }))}
                />
                <Field label="Incoterm" value={details.incoterm} onChange={(value) => setDetails((current) => ({ ...current, incoterm: value }))} />
                <Field label="Origin country" value={details.origin} onChange={(value) => setDetails((current) => ({ ...current, origin: value }))} />
                <Field label="Origin port / airport" value={details.originPort} onChange={(value) => setDetails((current) => ({ ...current, originPort: value }))} />
                <Field label="Destination country" value={details.destination} onChange={(value) => setDetails((current) => ({ ...current, destination: value }))} />
                <Field label="Destination port / airport" value={details.destinationPort} onChange={(value) => setDetails((current) => ({ ...current, destinationPort: value }))} />
                <Field label="Carrier" value={details.carrier} onChange={(value) => setDetails((current) => ({ ...current, carrier: value }))} />
                <Field
                  label="B/L type"
                  value={details.blType}
                  onChange={(value) => setDetails((current) => ({ ...current, blType: value }))}
                  placeholder="e.g. Original / Telex Release / Seaway Bill"
                />
                <Field label="ETD" type="date" value={details.etd} onChange={(value) => setDetails((current) => ({ ...current, etd: value }))} />
                <Field label="ETA" type="date" value={details.eta} onChange={(value) => setDetails((current) => ({ ...current, eta: value }))} />
                <Field label="Declared value" value={details.declaredValue} onChange={(value) => setDetails((current) => ({ ...current, declaredValue: value }))} />
                <Field label="Currency" value={details.currency} onChange={(value) => setDetails((current) => ({ ...current, currency: value }))} />
                <Field
                  label="Payment terms"
                  value={details.paymentTerms}
                  onChange={(value) => setDetails((current) => ({ ...current, paymentTerms: value }))}
                  placeholder="e.g. 30 days net / Letter of Credit / TT"
                />
              </div>
            )}

            {activeStep === 3 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Product description" value={cargo.description} onChange={(value) => setCargo((current) => ({ ...current, description: value }))} />
                <Field label="SKU / part number" value={cargo.sku} onChange={(value) => setCargo((current) => ({ ...current, sku: value }))} />
                <Field label="HS code" value={cargo.hsCode} onChange={(value) => setCargo((current) => ({ ...current, hsCode: value }))} />
                <Field label="Quantity" value={cargo.quantity} onChange={(value) => setCargo((current) => ({ ...current, quantity: value }))} />
                <Field label="Gross weight" value={cargo.grossWeight} onChange={(value) => setCargo((current) => ({ ...current, grossWeight: value }))} />
                <Field label="Net weight" value={cargo.netWeight} onChange={(value) => setCargo((current) => ({ ...current, netWeight: value }))} />
                <Field label="Cartons / pallets / containers" value={cargo.handlingUnits} onChange={(value) => setCargo((current) => ({ ...current, handlingUnits: value }))} />
                <Field label="Container number" value={cargo.container} onChange={(value) => setCargo((current) => ({ ...current, container: value }))} />
                <Field label="Seal number" value={cargo.seal} onChange={(value) => setCargo((current) => ({ ...current, seal: value }))} />
                <Field label="Country of origin" value={cargo.countryOfOrigin} onChange={(value) => setCargo((current) => ({ ...current, countryOfOrigin: value }))} />
                <Field label="Dangerous goods" value={cargo.dangerousGoods} onChange={(value) => setCargo((current) => ({ ...current, dangerousGoods: value }))} />
                <Field label="Temperature controlled" value={cargo.temperatureControlled} onChange={(value) => setCargo((current) => ({ ...current, temperatureControlled: value }))} />
              </div>
            )}

            {activeStep === 4 && (
              <DocumentUploadStep
                docs={docs}
                onFilesSelected={handleFilesSelected}
                extractionStatus={extractionStatus}
                extractResult={extractResult}
                error={error}
                hasCounterpartyDocs={counterpartyRequiredDocs.length > 0}
                shipmentSaved={Boolean(shipmentRecordId)}
                hasValidationErrors={hasValidationErrors}
              />
            )}

          </Panel>

          {error && activeStep !== 1 && (
            <p className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-600">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {mintResult && <MintResultPanel result={mintResult} />}

          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={activeStep === visibleStepIndexes[0]} onClick={goBack}>
              Back
            </Button>
            {activeStep < lastVisibleStep ? (
              <Button onClick={goNext}>Next step</Button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <Button
                  onClick={createShipmentNow}
                  disabled={(!allCreatorDocsUploaded && extractionStatus === "idle") || extractionStatus === "extracting" || createdInProgress || hasValidationErrors}
                >
                  {createdInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                  {createdInProgress ? "Storing and minting..." : "Create shipment"}
                </Button>
                {hasValidationErrors && (
                  <span className="flex items-center gap-1 text-xs font-bold text-red-500">
                    <XCircle className="h-3 w-3" />
                    Blocked — fix document mismatches above
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PartyCard({
  title,
  party,
  locked,
  onChange,
  subtitle,
  onRemove
}: {
  title: string;
  party: { company: string; contact: string; email: string; phone: string; taxId: string };
  locked: boolean;
  onChange: (party: { company: string; contact: string; email: string; phone: string; taxId: string }) => void;
  subtitle?: string;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        locked ? "border-[#4DA2FF]/40 bg-blue-50" : "border-blue-100 bg-white"
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              locked ? "bg-[#4DA2FF] text-white" : "bg-blue-50 text-[#4DA2FF]"
            )}
          >
            {locked ? <Lock className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-steel">{locked ? "Auto-filled" : subtitle ? "Optional party" : "Counterparty"}</p>
            <h3 className="text-lg font-extrabold text-pearl">{title}</h3>
            {subtitle && <p className="text-xs text-steel">{subtitle}</p>}
          </div>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full px-2.5 py-1 text-xs font-bold text-steel transition hover:bg-red-50 hover:text-red-500"
          >
            Remove
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Company" value={party.company} onChange={(value) => onChange({ ...party, company: value })} />
        <Field label="Contact person" value={party.contact} onChange={(value) => onChange({ ...party, contact: value })} />
        <Field label="Email" value={party.email} onChange={(value) => onChange({ ...party, email: value })} />
        <Field label="Phone" value={party.phone} onChange={(value) => onChange({ ...party, phone: value })} />
        <Field
          label="EORI / Tax ID (optional)"
          value={party.taxId ?? ""}
          onChange={(value) => onChange({ ...party, taxId: value })}
          placeholder="e.g. GB123456789000"
        />
      </div>
      {locked && (
        <p className="mt-3 text-xs font-semibold text-steel">
          Loaded from your SuiShip profile. Edits here only affect this shipment.
        </p>
      )}
    </div>
  );
}

function MintResultPanel({ result }: { result: MintStorageResult }) {
  return (
    <Panel className="border-emerald-200 bg-emerald-50">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-emerald-800">Shipment stored and passport minted</p>
          <div className="mt-3 grid gap-2 text-xs font-semibold text-emerald-900">
            <StorageLine label="Passport" value={result.passportId} />
            <StorageLine label="Tx digest" value={result.txDigest} />
            <StorageLine label="MemWal" value={result.memWalSpaceId} />
            <StorageLine label="Manifest hash" value={result.manifestHash} />
          </div>
          {result.walrusBlobIds.length > 0 && (
            <div className="mt-3 grid gap-2">
              <p className="text-xs font-extrabold uppercase tracking-widest text-emerald-700">Walrus blobs</p>
              {result.walrusBlobIds.map((blobId, index) => (
                <a
                  key={`${blobId}-${index}`}
                  href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs font-bold text-pearl hover:text-[#4DA2FF]"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="shrink-0">{index === 0 ? "Manifest" : `Document ${index}`}</span>
                  <span className="min-w-0 truncate font-mono">{blobId}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function StorageLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)]">
      <span className="text-emerald-700">{label}</span>
      <span className="min-w-0 break-all font-mono text-pearl">{value}</span>
    </div>
  );
}

function mergeExtractionResults(existing: AggregateResult, incoming: AggregateResult): AggregateResult {
  const detected = {
    commercial_invoice: incoming.detected.commercial_invoice.length > 0
      ? incoming.detected.commercial_invoice
      : existing.detected.commercial_invoice,
    packing_list: incoming.detected.packing_list.length > 0
      ? incoming.detected.packing_list
      : existing.detected.packing_list,
    bill_of_lading: incoming.detected.bill_of_lading.length > 0
      ? incoming.detected.bill_of_lading
      : existing.detected.bill_of_lading,
    certificate_of_origin: incoming.detected.certificate_of_origin.length > 0
      ? incoming.detected.certificate_of_origin
      : existing.detected.certificate_of_origin,
  };
  const allTypes = ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin"] as const;
  const missing = allTypes.filter((t) => detected[t].length === 0);
  return {
    detected,
    missing,
    duplicates: [...existing.duplicates, ...incoming.duplicates],
    garbage: [...existing.garbage, ...incoming.garbage],
    low_confidence: [...existing.low_confidence, ...incoming.low_confidence],
    cross_validation: incoming.cross_validation,
    errors: [...existing.errors, ...incoming.errors],
    summary: {
      ...incoming.summary,
      total_files: existing.summary.total_files + incoming.summary.total_files,
      successfully_extracted: existing.summary.successfully_extracted + incoming.summary.successfully_extracted,
      is_complete: missing.length === 0,
    },
    extractedRef: incoming.extractedRef ?? existing.extractedRef,
  };
}

function detectDocumentIndex(fileName: string, docs: DocumentRequirement[]) {
  const normalized = fileName.toLowerCase();
  const rules: Array<{ index: number; keywords: string[] }> = docs.map((doc, index) => {
    const name = doc.name.toLowerCase();
    if (name.includes("commercial invoice")) return { index, keywords: ["commercial", "invoice", "inv"] };
    if (name.includes("packing list")) return { index, keywords: ["packing", "packlist", "packing-list"] };
    if (name.includes("air waybill") || name.includes("bill of lading")) return { index, keywords: ["awb", "waybill", "bill-of-lading", "bol", "lading"] };
    if (name.includes("certificate of origin")) return { index, keywords: ["origin", "coo", "certificate"] };
    if (name.includes("customs declaration")) return { index, keywords: ["customs", "declaration"] };
    if (name.includes("insurance")) return { index, keywords: ["insurance"] };
    if (name.includes("permit")) return { index, keywords: ["permit", "import", "export"] };
    if (name.includes("dangerous")) return { index, keywords: ["dangerous", "dg", "hazmat"] };
    return { index, keywords: [name] };
  });

  const matched = rules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)));
  if (matched) return matched.index;
  return docs.findIndex((doc) => !doc.uploaded);
}

function DocumentUploadStep({
  docs,
  onFilesSelected,
  extractionStatus,
  extractResult,
  error,
  hasCounterpartyDocs,
  shipmentSaved,
  hasValidationErrors
}: {
  docs: DocumentRequirement[];
  onFilesSelected: (files: File[]) => void;
  extractionStatus: "idle" | "extracting" | "complete" | "failed";
  extractResult: AggregateResult | null;
  error: string | null;
  hasCounterpartyDocs: boolean;
  shipmentSaved: boolean;
  hasValidationErrors: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [openDocKey, setOpenDocKey] = useState<string | null>(null);

  const uploadedCount = docs.filter((doc) => doc.uploaded).length;
  const requiredCount = docs.filter((doc) => doc.required).length;
  const isExtracting = extractionStatus === "extracting";
  const isComplete = extractionStatus === "complete";
  const isFailed = extractionStatus === "failed";

  function addToStaged(files: File[]) {
    setStagedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...files.filter((f) => !existing.has(f.name))];
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (isExtracting) return;
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (files.length > 0) addToStaged(files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    addToStaged(Array.from(e.target.files || []));
    e.target.value = "";
  }

  function handleExtract() {
    if (stagedFiles.length === 0 || isExtracting) return;
    const toExtract = [...stagedFiles];
    setStagedFiles([]);
    onFilesSelected(toExtract);
  }

  function fmtWeight(w: { value: number | null; unit: string | null } | null | undefined) {
    if (!w || w.value == null) return null;
    return `${w.value}${w.unit ? " " + w.unit : ""}`;
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-steel">
        Stage your shipment documents in the box below, then click{" "}
        <span className="font-bold text-pearl">Extract documents</span> to run AI analysis. You can add more files and
        extract again if some are missing — results accumulate automatically.
      </div>

      {/* Drag-and-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!isExtracting) setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); if (!isExtracting) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isExtracting && inputRef.current?.click()}
        className={cn(
          "rounded-2xl border-2 border-dashed p-8 text-center transition",
          isExtracting ? "cursor-default" : "cursor-pointer",
          dragOver ? "border-[#4DA2FF] bg-blue-50" : "border-[#4DA2FF]/45 bg-white hover:bg-blue-50/40"
        )}
      >
        {isExtracting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-[#4DA2FF]" />
            <h3 className="text-xl font-extrabold text-pearl">Analyzing with AI...</h3>
            <p className="mx-auto max-w-sm text-sm text-steel">
              Claude Haiku is reading your documents. You can navigate away — extraction continues in the background.
            </p>
          </div>
        ) : (
          <>
            <Upload className="mx-auto h-10 w-10 text-[#4DA2FF]" />
            <h3 className="mt-3 text-xl font-extrabold text-pearl">Drop PDFs here or click to add</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-steel">
              {isComplete
                ? "Drop more files above to add missing documents, then click Extract."
                : "Commercial invoice, packing list, bill of lading, certificates, permits, and any supporting files."}
            </p>
            {!isComplete && (
              <p className="mt-4 text-sm font-bold text-steel">
                {uploadedCount}/{requiredCount} required documents detected
              </p>
            )}
          </>
        )}
      </div>

      <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" className="hidden" onChange={handleFileInput} />

      {/* Staged file list + extract button */}
      {stagedFiles.length > 0 && !isExtracting && (
        <div className="rounded-2xl border border-blue-100 bg-white p-4 grid gap-3">
          <p className="text-xs font-bold uppercase text-steel">
            Staged — {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} ready to extract
          </p>
          <div className="flex flex-wrap gap-2">
            {stagedFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-pearl"
              >
                <FilePlus2 className="h-3 w-3 shrink-0 text-[#4DA2FF]" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setStagedFiles((prev) => prev.filter((f) => f.name !== file.name)); }}
                  className="ml-1 rounded-full text-steel transition hover:text-red-500"
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleExtract}
            className="self-start inline-flex items-center gap-2 rounded-full bg-[#4DA2FF] px-5 py-2.5 text-sm font-bold text-white shadow-glow transition hover:bg-[#3d8ee6]"
          >
            <Upload className="h-4 w-4" />
            Extract {stagedFiles.length} document{stagedFiles.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Extraction status banner — contextual based on validation outcome */}
      {(isComplete || isFailed) && (() => {
        const errorCount = extractResult?.cross_validation.filter((v) => v.severity === "error").length ?? 0;
        const warnCount = extractResult?.cross_validation.filter((v) => v.severity === "warning").length ?? 0;
        if (isFailed) return (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <XCircle className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-bold text-red-700">Extraction failed</p>
              <p className="text-sm text-red-600">Drop your files above and click Extract to retry.</p>
            </div>
          </div>
        );
        if (errorCount > 0) return (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <XCircle className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-bold text-red-700">Creation blocked — {errorCount} mismatch{errorCount !== 1 ? "es" : ""} detected</p>
              <p className="text-sm text-red-600">Fix the source documents and re-upload.</p>
            </div>
          </div>
        );
        if (warnCount > 0) return (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-bold text-amber-700">AI extraction complete — {warnCount} warning{warnCount !== 1 ? "s" : ""}</p>
              <p className="text-sm text-amber-600">Review the soft mismatches below before creating.</p>
            </div>
          </div>
        );
        return (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="font-bold text-emerald-700">AI validation passed</p>
              <p className="text-sm text-emerald-600">All documents are consistent. Drop more files above to add missing ones.</p>
            </div>
          </div>
        );
      })()}

      {/* Summary cards */}
      {isComplete && extractResult && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Commercial Invoice", count: extractResult.detected.commercial_invoice.length },
            { label: "Packing List", count: extractResult.detected.packing_list.length },
            { label: "Bill of Lading", count: extractResult.detected.bill_of_lading.length },
            { label: "Certificate of Origin", count: extractResult.detected.certificate_of_origin.length },
          ].map(({ label, count }) => (
            <div
              key={label}
              className={cn(
                "rounded-2xl border p-3 text-center text-sm font-bold",
                count > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
              )}
            >
              {count > 0 ? <CheckCircle2 className="mx-auto mb-1 h-4 w-4" /> : <AlertCircle className="mx-auto mb-1 h-4 w-4" />}
              {label}
              <p className="mt-0.5 font-semibold">{count > 0 ? `${count} detected` : "Missing"}</p>
            </div>
          ))}
        </div>
      )}

      {/* Extracted document details — one expandable card per detected doc */}
      {isComplete && extractResult && (
        <div className="grid gap-3">
          {extractResult.detected.commercial_invoice.map((doc) => {
            const r = doc.extraction_result;
            if (r.document_type !== "commercial_invoice") return null;
            const d = r.data;
            const open = openDocKey === doc.file_id;
            return (
              <div key={doc.file_id} className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenDocKey(open ? null : doc.file_id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-blue-50/40"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-xs font-bold uppercase text-steel">Commercial Invoice</p>
                      <p className="font-extrabold text-pearl">{doc.file_name}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#4DA2FF]">{open ? "Hide" : "Show"} details</span>
                </button>
                {open && (
                  <div className="border-t border-blue-50 px-5 py-4">
                    {([
                      ["Invoice #", d.invoice_number],
                      ["Date", d.invoice_date],
                      ["Currency", d.currency],
                      ["Incoterms", d.incoterms],
                      ["Total Amount", d.totals?.total_invoice_amount],
                      ["Total Net Weight", fmtWeight(d.totals?.total_net_weight)],
                      ["Shipper", d.sender?.name],
                      ["Recipient", d.recipient?.name],
                      ["Payment Terms", d.payment_terms],
                      ["Line Items", d.line_items.length > 0 ? `${d.line_items.length} item${d.line_items.length !== 1 ? "s" : ""}` : null],
                    ] as [string, string | number | null | undefined][]).map(([label, value]) => (
                      <div key={label} className="flex items-start gap-2 border-b border-blue-50 py-1.5 last:border-0">
                        <span className="w-36 shrink-0 text-xs font-bold text-steel">{label}</span>
                        <span className="text-sm text-pearl">{value != null ? String(value) : "—"}</span>
                      </div>
                    ))}
                    {r.extraction_notes.length > 0 && (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                        <p className="mb-1 font-bold">Extraction notes:</p>
                        <ul className="list-inside list-disc space-y-0.5">
                          {r.extraction_notes.map((note, i) => <li key={i}>{note}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {extractResult.detected.packing_list.map((doc) => {
            const r = doc.extraction_result;
            if (r.document_type !== "packing_list") return null;
            const d = r.data;
            const open = openDocKey === doc.file_id;
            return (
              <div key={doc.file_id} className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenDocKey(open ? null : doc.file_id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-blue-50/40"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-xs font-bold uppercase text-steel">Packing List</p>
                      <p className="font-extrabold text-pearl">{doc.file_name}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#4DA2FF]">{open ? "Hide" : "Show"} details</span>
                </button>
                {open && (
                  <div className="border-t border-blue-50 px-5 py-4">
                    {([
                      ["Reference #", d.packing_list_number ?? d.invoice_number],
                      ["Ship Date", d.ship_date],
                      ["Incoterms", d.incoterms],
                      ["Total Packages", d.totals?.total_packages],
                      ["Total Gross Weight", fmtWeight(d.totals?.total_gross_weight)],
                      ["Total Net Weight", fmtWeight(d.totals?.total_net_weight)],
                      ["Shipper", d.shipper?.name],
                      ["Consignee", d.consignee?.name],
                      ["Line Items", d.line_items.length > 0 ? `${d.line_items.length} item${d.line_items.length !== 1 ? "s" : ""}` : null],
                    ] as [string, string | number | null | undefined][]).map(([label, value]) => (
                      <div key={label} className="flex items-start gap-2 border-b border-blue-50 py-1.5 last:border-0">
                        <span className="w-36 shrink-0 text-xs font-bold text-steel">{label}</span>
                        <span className="text-sm text-pearl">{value != null ? String(value) : "—"}</span>
                      </div>
                    ))}
                    {r.extraction_notes.length > 0 && (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                        <p className="mb-1 font-bold">Extraction notes:</p>
                        <ul className="list-inside list-disc space-y-0.5">
                          {r.extraction_notes.map((note, i) => <li key={i}>{note}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {extractResult.detected.bill_of_lading.map((doc) => {
            const r = doc.extraction_result;
            if (r.document_type !== "bill_of_lading") return null;
            const d = r.data;
            const open = openDocKey === doc.file_id;
            return (
              <div key={doc.file_id} className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenDocKey(open ? null : doc.file_id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-blue-50/40"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-xs font-bold uppercase text-steel">Bill of Lading</p>
                      <p className="font-extrabold text-pearl">{doc.file_name}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#4DA2FF]">{open ? "Hide" : "Show"} details</span>
                </button>
                {open && (
                  <div className="border-t border-blue-50 px-5 py-4">
                    {([
                      ["B/L Number", d.bl_number],
                      ["B/L Type", d.bl_type],
                      ["Vessel / Voyage", d.vessel_voyage],
                      ["Port of Loading", d.port_of_loading],
                      ["Port of Discharge", d.port_of_discharge],
                      ["Shipment Date", d.shipment_date],
                      ["Carrier", d.carrier],
                      ["Freight Payment", d.freight_payment],
                      ["Shipper", d.shipper?.name],
                      ["Consignee", d.consignee?.name],
                    ] as [string, string | null | undefined][]).map(([label, value]) => (
                      <div key={label} className="flex items-start gap-2 border-b border-blue-50 py-1.5 last:border-0">
                        <span className="w-36 shrink-0 text-xs font-bold text-steel">{label}</span>
                        <span className="text-sm text-pearl">{value ?? "—"}</span>
                      </div>
                    ))}
                    {r.extraction_notes.length > 0 && (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                        <p className="mb-1 font-bold">Extraction notes:</p>
                        <ul className="list-inside list-disc space-y-0.5">
                          {r.extraction_notes.map((note, i) => <li key={i}>{note}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {extractResult.detected.certificate_of_origin.map((doc) => {
            const r = doc.extraction_result;
            if (r.document_type !== "certificate_of_origin") return null;
            const d = r.data;
            const open = openDocKey === doc.file_id;
            return (
              <div key={doc.file_id} className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenDocKey(open ? null : doc.file_id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-blue-50/40"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-xs font-bold uppercase text-steel">Certificate of Origin</p>
                      <p className="font-extrabold text-pearl">{doc.file_name}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#4DA2FF]">{open ? "Hide" : "Show"} details</span>
                </button>
                {open && (
                  <div className="border-t border-blue-50 px-5 py-4">
                    {([
                      ["Certificate #", d.certificate_number],
                      ["Issue Date", d.issue_date],
                      ["Certificate Type", d.certificate_type],
                      ["Issuing Authority", d.issuing_authority],
                      ["Country of Origin", d.country_of_origin],
                      ["Exporter", d.exporter?.name],
                      ["Importer", d.importer?.name],
                      ["Goods", d.goods.length > 0 ? `${d.goods.length} item${d.goods.length !== 1 ? "s" : ""}` : null],
                    ] as [string, string | number | null | undefined][]).map(([label, value]) => (
                      <div key={label} className="flex items-start gap-2 border-b border-blue-50 py-1.5 last:border-0">
                        <span className="w-36 shrink-0 text-xs font-bold text-steel">{label}</span>
                        <span className="text-sm text-pearl">{value != null ? String(value) : "—"}</span>
                      </div>
                    ))}
                    {r.extraction_notes.length > 0 && (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                        <p className="mb-1 font-bold">Extraction notes:</p>
                        <ul className="list-inside list-disc space-y-0.5">
                          {r.extraction_notes.map((note, i) => <li key={i}>{note}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Extraction errors */}
          {extractResult.errors.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="font-bold text-red-700">Extraction errors:</p>
              <ul className="mt-1 space-y-1 text-sm text-red-600">
                {extractResult.errors.map((e) => (
                  <li key={e.file_id}>
                    <span className="font-semibold">{e.file_name}</span>: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Extracted reference number */}
      {isComplete && extractResult?.extractedRef && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#4DA2FF]" />
          <div>
            <p className="text-xs font-bold uppercase text-steel">Extracted reference number</p>
            <p className="mt-0.5 font-extrabold text-pearl">{extractResult.extractedRef}</p>
          </div>
        </div>
      )}

      {/* Non-shipping files */}
      {isComplete && extractResult && extractResult.garbage.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm">
          <p className="font-bold text-amber-700">Non-shipping files detected:</p>
          <ul className="mt-1 list-inside list-disc text-amber-600">
            {extractResult.garbage.map((g) => (
              <li key={g.file.file_id}>{g.file.file_name} — {g.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Cross-validation errors — block creation (shown regardless of is_complete) */}
      {hasValidationErrors && extractResult && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <div>
              <p className="font-bold text-red-700">Shipment creation blocked — cross-document mismatches:</p>
              <ul className="mt-1 list-inside list-disc text-red-600">
                {extractResult.cross_validation.filter((v) => v.severity === "error").map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-red-500">Fix the source documents so all fields align, then re-upload and extract.</p>
            </div>
          </div>
        </div>
      )}

      {/* Cross-validation warnings — non-blocking */}
      {extractResult && extractResult.cross_validation.filter((v) => v.severity === "warning").length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-bold text-amber-700">Soft mismatches — review before creating:</p>
              <ul className="mt-1 list-inside list-disc text-amber-600">
                {extractResult.cross_validation.filter((v) => v.severity === "warning").map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Document status cards */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-steel">Document checklist</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {docs.map((doc) => {
            const borderClass = doc.uploaded
              ? "border-emerald-200 bg-emerald-50/40"
              : isExtracting
                ? "border-[#4DA2FF]/30 bg-blue-50/40"
                : doc.required
                  ? "border-red-200 bg-red-50/30"
                  : "border-blue-100 bg-white";
            return (
              <div key={doc.name} className={cn("rounded-2xl border p-4 transition", borderClass)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-pearl leading-tight">{doc.name}</p>
                    {doc.fileName && (
                      <p className="mt-0.5 truncate text-xs text-steel" title={doc.fileName}>{doc.fileName}</p>
                    )}
                    {!doc.fileName && isExtracting && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-[#4DA2FF]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analyzing…
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {doc.uploaded ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Detected
                      </span>
                    ) : isExtracting ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-[#4DA2FF]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analyzing
                      </span>
                    ) : doc.required ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-600">
                        <XCircle className="h-3 w-3" />
                        Missing
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-steel">
                        Optional
                      </span>
                    )}
                    <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-steel">
                      {doc.owner}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pre-flight checklist */}
      {(() => {
        const errorCount = extractResult?.cross_validation.filter((v) => v.severity === "error").length ?? 0;
        const warnCount = extractResult?.cross_validation.filter((v) => v.severity === "warning").length ?? 0;
        const docsReady = docs.filter((d) => d.required).every((d) => d.uploaded);
        return (
          <div className="rounded-2xl border border-blue-100 bg-white p-5">
            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-steel">Pre-flight checklist</h3>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                {docsReady || isExtracting
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <XCircle className="h-4 w-4 text-red-400" />}
                <span className={docsReady || isExtracting ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>
                  {docsReady ? "All required documents uploaded" : isExtracting ? "Documents uploading…" : "Required documents missing"}
                </span>
              </div>
              {errorCount > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="font-semibold text-red-600">{errorCount} cross-document mismatch{errorCount !== 1 ? "es" : ""} — creation blocked</span>
                </div>
              )}
              {errorCount === 0 && extractResult && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold text-emerald-700">No blocking document mismatches</span>
                </div>
              )}
              {warnCount > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-amber-600">{warnCount} warning{warnCount !== 1 ? "s" : ""} — review recommended</span>
                </div>
              )}
              {!extractResult && !isExtracting && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-steel" />
                  <span className="text-steel">Upload documents and run AI extraction to validate</span>
                </div>
              )}
            </div>
            {hasCounterpartyDocs && (
              <p className="mt-3 text-xs text-steel">
                {shipmentSaved ? "Draft saved. Creating again updates it." : ""}
                {" "}The shipment will be saved as <span className="font-bold text-pearl">In Progress</span> while waiting for counterparty documents.
              </p>
            )}
          </div>
        );
      })()}

      {error && (
        <p className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-600">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
