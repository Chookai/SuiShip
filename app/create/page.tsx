"use client";

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FilePlus2,
  Link2,
  Lock,
  PartyPopper,
  Share2,
  Ship,
  Upload,
  UserCheck
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
  type ShipmentRecord,
  type WorkflowKey
} from "@/lib/shipments-store";
import { cn } from "@/lib/utils";

const steps = ["Workflow", "Trade parties", "Shipment details", "Cargo details", "Document upload"];
const hiddenStepIndexes = new Set([2, 3]);
const visibleStepIndexes = steps.map((_, index) => index).filter((index) => !hiddenStepIndexes.has(index));
const lastVisibleStep = visibleStepIndexes[visibleStepIndexes.length - 1];

const workflowTitles: Record<WorkflowKey, string> = {
  importer: "Importer",
  exporter: "Exporter"
};

const documentCatalog: Array<{ name: string; defaultOwner: DocumentOwner; defaultRequired: boolean }> = [
  { name: "Commercial Invoice", defaultOwner: "Exporter", defaultRequired: true },
  { name: "Packing List", defaultOwner: "Exporter", defaultRequired: true },
  { name: "Air Waybill / Bill of Lading", defaultOwner: "Exporter", defaultRequired: true },
  { name: "Certificate of Origin", defaultOwner: "Exporter", defaultRequired: true },
  { name: "Customs Declaration", defaultOwner: "Importer", defaultRequired: true },
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
  currency: "USD"
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

  const counterpartyKey: "Importer" | "Exporter" = workflow === "importer" ? "Exporter" : "Importer";

  const [importer, setImporter] = useState({
    company: profiles.Importer.company,
    contact: profiles.Importer.contact,
    email: profiles.Importer.email,
    phone: profiles.Importer.phone
  });
  const [exporter, setExporter] = useState({
    company: profiles.Exporter.company,
    contact: profiles.Exporter.contact,
    email: profiles.Exporter.email,
    phone: profiles.Exporter.phone
  });
  const [broker, setBroker] = useState("");
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
    // Reset any in-progress creation when the workflow changes.
    setShipmentRecordId(null);
    setInviteToken(null);
    setCreatedInProgress(false);
  }, [workflow, profile]);

  const selectedWorkflow = workflowTitles[workflow];

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
      broker: broker || undefined,
      shipment: { ...details },
      cargo: { ...cargo },
      documents: docs,
      inviteToken: token
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

  function attachFiles(files: File[]) {
    const now = new Date().toISOString();
    setDocs((current) => {
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
    });
  }

  const creatorRequiredDocs = docs.filter((doc) => doc.required);
  const counterpartyRequiredDocs: DocumentRequirement[] = [];

  const allCreatorDocsUploaded = creatorRequiredDocs.every((doc) => doc.uploaded);

  function persistDraft(status: ShipmentRecord["status"]) {
    if (shipmentRecordId) {
      updateShipment(shipmentRecordId, {
        status,
        importer,
        exporter,
        broker: broker || undefined,
        shipment: { ...details },
        cargo: { ...cargo },
        documents: docs,
        inviteToken: inviteToken || undefined
      });
      return shipmentRecordId;
    }
    const record = buildShipmentRecord(status, inviteToken || undefined);
    addShipment(record);
    setShipmentRecordId(record.id);
    return record.id;
  }

  function createShipmentNow() {
    if (!allCreatorDocsUploaded) {
      setError("Upload all required documents before creating the shipment.");
      return;
    }
    setError(null);
    const status: ShipmentRecord["status"] = counterpartyRequiredDocs.length > 0 ? "In Progress" : "Documents Uploaded";
    persistDraft(status);
    setCreatedInProgress(true);
    window.setTimeout(() => {
      router.push("/shipments");
    }, 900);
  }

  function goBack() {
    const currentIndex = visibleStepIndexes.indexOf(activeStep);
    const previousIndex = Math.max(0, currentIndex - 1);
    setActiveStep(visibleStepIndexes[previousIndex] ?? 0);
  }

  function goNext() {
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
        <Panel className="h-fit">
          <div className="grid gap-2">
            {visibleStepIndexes.map((stepIndex, visibleIndex) => (
              <button
                key={steps[stepIndex]}
                onClick={() => setActiveStep(stepIndex)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition",
                  activeStep === stepIndex ? "bg-[#4DA2FF] text-white shadow-glow" : "bg-blue-50 text-steel hover:text-[#4DA2FF]"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs",
                    activeStep === stepIndex ? "bg-white/20" : "bg-white text-[#4DA2FF]"
                  )}
                >
                  {visibleIndex + 1}
                </span>
                {steps[stepIndex]}
              </button>
            ))}
          </div>
        </Panel>

        <div className="grid gap-6">
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
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Customs broker (optional)" value={broker} onChange={setBroker} placeholder="If applicable" />
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
                  label="Transport mode"
                  value={details.transportMode}
                  onChange={(value) => setDetails((current) => ({ ...current, transportMode: value }))}
                />
                <Field
                  label="Origin country"
                  value={details.origin}
                  onChange={(value) => setDetails((current) => ({ ...current, origin: value }))}
                />
                <Field
                  label="Origin port / airport"
                  value={details.originPort}
                  onChange={(value) => setDetails((current) => ({ ...current, originPort: value }))}
                />
                <Field
                  label="Destination country"
                  value={details.destination}
                  onChange={(value) => setDetails((current) => ({ ...current, destination: value }))}
                />
                <Field
                  label="Destination port / airport"
                  value={details.destinationPort}
                  onChange={(value) => setDetails((current) => ({ ...current, destinationPort: value }))}
                />
                <Field
                  label="Carrier"
                  value={details.carrier}
                  onChange={(value) => setDetails((current) => ({ ...current, carrier: value }))}
                />
                <Field
                  label="Incoterm"
                  value={details.incoterm}
                  onChange={(value) => setDetails((current) => ({ ...current, incoterm: value }))}
                />
                <Field
                  label="ETD"
                  type="date"
                  value={details.etd}
                  onChange={(value) => setDetails((current) => ({ ...current, etd: value }))}
                />
                <Field
                  label="ETA"
                  type="date"
                  value={details.eta}
                  onChange={(value) => setDetails((current) => ({ ...current, eta: value }))}
                />
                <Field
                  label="Declared value"
                  value={details.declaredValue}
                  onChange={(value) => setDetails((current) => ({ ...current, declaredValue: value }))}
                />
                <Field
                  label="Currency"
                  value={details.currency}
                  onChange={(value) => setDetails((current) => ({ ...current, currency: value }))}
                />
              </div>
            )}

            {activeStep === 3 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Product description"
                  value={cargo.description}
                  onChange={(value) => setCargo((current) => ({ ...current, description: value }))}
                />
                <Field
                  label="SKU / part number"
                  value={cargo.sku}
                  onChange={(value) => setCargo((current) => ({ ...current, sku: value }))}
                />
                <Field
                  label="HS code"
                  value={cargo.hsCode}
                  onChange={(value) => setCargo((current) => ({ ...current, hsCode: value }))}
                />
                <Field
                  label="Quantity"
                  value={cargo.quantity}
                  onChange={(value) => setCargo((current) => ({ ...current, quantity: value }))}
                />
                <Field
                  label="Gross weight"
                  value={cargo.grossWeight}
                  onChange={(value) => setCargo((current) => ({ ...current, grossWeight: value }))}
                />
                <Field
                  label="Net weight"
                  value={cargo.netWeight}
                  onChange={(value) => setCargo((current) => ({ ...current, netWeight: value }))}
                />
                <Field
                  label="Cartons / pallets / containers"
                  value={cargo.handlingUnits}
                  onChange={(value) => setCargo((current) => ({ ...current, handlingUnits: value }))}
                />
                <Field
                  label="Container number"
                  value={cargo.container}
                  onChange={(value) => setCargo((current) => ({ ...current, container: value }))}
                />
                <Field
                  label="Seal number"
                  value={cargo.seal}
                  onChange={(value) => setCargo((current) => ({ ...current, seal: value }))}
                />
                <Field
                  label="Country of origin"
                  value={cargo.countryOfOrigin}
                  onChange={(value) => setCargo((current) => ({ ...current, countryOfOrigin: value }))}
                />
                <Field
                  label="Dangerous goods"
                  value={cargo.dangerousGoods}
                  onChange={(value) => setCargo((current) => ({ ...current, dangerousGoods: value }))}
                />
                <Field
                  label="Temperature controlled"
                  value={cargo.temperatureControlled}
                  onChange={(value) => setCargo((current) => ({ ...current, temperatureControlled: value }))}
                />
              </div>
            )}

            {activeStep === 4 && (
                <DocumentUploadStep
                  docs={docs}
                  onAttachFiles={attachFiles}
                  error={error}
                  hasCounterpartyDocs={counterpartyRequiredDocs.length > 0}
                  shipmentSaved={Boolean(shipmentRecordId)}
                />
            )}

          </Panel>

          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={activeStep === visibleStepIndexes[0]} onClick={goBack}>
              Back
            </Button>
            {activeStep < lastVisibleStep ? (
              <Button onClick={goNext}>Next step</Button>
            ) : (
              <Button onClick={createShipmentNow} disabled={!allCreatorDocsUploaded || createdInProgress}>
                {createdInProgress ? <PartyPopper className="h-4 w-4" /> : <FilePlus2 className="h-4 w-4" />}
                {createdInProgress ? "Shipment created — opening list" : "Create shipment"}
              </Button>
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
  onChange
}: {
  title: string;
  party: { company: string; contact: string; email: string; phone: string };
  locked: boolean;
  onChange: (party: { company: string; contact: string; email: string; phone: string }) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        locked ? "border-[#4DA2FF]/40 bg-blue-50" : "border-blue-100 bg-white"
      )}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-2xl",
            locked ? "bg-[#4DA2FF] text-white" : "bg-blue-50 text-[#4DA2FF]"
          )}
        >
          {locked ? <Lock className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-steel">{locked ? "Auto-filled" : "Counterparty"}</p>
          <h3 className="text-lg font-extrabold text-pearl">{title}</h3>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Company" value={party.company} onChange={(value) => onChange({ ...party, company: value })} />
        <Field label="Contact person" value={party.contact} onChange={(value) => onChange({ ...party, contact: value })} />
        <Field label="Email" value={party.email} onChange={(value) => onChange({ ...party, email: value })} />
        <Field label="Phone" value={party.phone} onChange={(value) => onChange({ ...party, phone: value })} />
      </div>
      {locked && (
        <p className="mt-3 text-xs font-semibold text-steel">
          Loaded from your SuiShip profile. Edits here only affect this shipment.
        </p>
      )}
    </div>
  );
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
  onAttachFiles,
  error,
  hasCounterpartyDocs,
  shipmentSaved
}: {
  docs: DocumentRequirement[];
  onAttachFiles: (files: File[]) => void;
  error: string | null;
  hasCounterpartyDocs: boolean;
  shipmentSaved: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadedCount = docs.filter((doc) => doc.uploaded).length;
  const requiredCount = docs.filter((doc) => doc.required).length;

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-steel">
        Upload all shipment documents together. SuiShip AI will detect the document type, match it to the importer/exporter
        rules, and place each file into the correct shipment document slot.
      </div>

      <div className="rounded-2xl border border-dashed border-[#4DA2FF]/45 bg-white p-6 text-center">
        <Upload className="mx-auto h-10 w-10 text-[#4DA2FF]" />
        <h3 className="mt-3 text-xl font-extrabold text-pearl">Upload document bundle</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-steel">
          Add invoice, packing list, bill of lading, certificates, permits, and any supporting files. Filename keywords are
          used for this mock AI detection.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#4DA2FF] px-5 py-2 text-sm font-extrabold text-white shadow-glow"
        >
          <Upload className="h-4 w-4" />
          Upload documents
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length > 0) onAttachFiles(files);
            event.target.value = "";
          }}
        />
        <p className="mt-4 text-sm font-bold text-steel">
          {uploadedCount}/{requiredCount} required documents detected
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-blue-50 text-xs font-bold uppercase text-steel">
              <th className="pb-3 pr-4">Document type</th>
              <th className="pb-3 pr-4">Responsible</th>
              <th className="pb-3 pr-4">Required</th>
              <th className="pb-3 pr-4">AI detected file</th>
              <th className="pb-3 pr-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-50">
            {docs.map((doc) => (
              <tr key={doc.name} className="align-top">
                <td className="py-4 pr-4 font-bold text-pearl">{doc.name}</td>
                <td className="py-4 pr-4">
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-steel">{doc.owner}</span>
                </td>
                <td className="py-4 pr-4 font-bold text-pearl">{doc.required ? "Required" : "Optional"}</td>
                <td className="py-4 pr-4">
                  {doc.fileName ? (
                    <span className="font-semibold text-pearl">{doc.fileName}</span>
                  ) : (
                    <span className="text-steel">Waiting for AI match</span>
                  )}
                </td>
                <td className="py-4 pr-4">
                  {doc.uploaded ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Detected
                    </span>
                  ) : doc.required ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600">
                      Missing
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-steel">
                      Optional
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-blue-100 bg-white p-5 text-sm text-steel">
        <h3 className="text-lg font-extrabold text-pearl">Ready to create</h3>
        <p className="mt-1">
          {hasCounterpartyDocs
            ? "Once you have uploaded your side required documents, click Create shipment below. The shipment will be saved as In Progress while waiting for the counterparty documents."
            : "Once all required documents are detected, click Create shipment below to save and open it in your shipments list."}
          {shipmentSaved && " Draft already saved — creating again updates it."}
        </p>
      </div>
    </div>
  );
}
