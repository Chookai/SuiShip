"use client";

import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  Building2,
  CheckCircle2,
  Clock3,
  CloudUpload,
  Copy,
  ExternalLink,
  FileArchive,
  FileCheck2,
  Fingerprint,
  Globe2,
  Info,
  Loader2,
  Lock,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { PassportActions } from "@/components/passport-actions";
import { QrCard } from "@/components/qr-card";
import { useRole } from "@/components/role-context";
import { Button, Panel, RiskBadge, StatusBadge } from "@/components/ui";
import { findShipment } from "@/lib/demo-data";
import { runAiVerification } from "@/lib/ai-verification";
import {
  useShipments,
  type AiCheck,
  type AiResult,
  type DocumentOwner,
  type DocumentRequirement,
  type ShipmentRecord,
  type WalrusUpload
} from "@/lib/shipments-store";
import { cn } from "@/lib/utils";
import { aggregatorUrl, storeBlob, WALRUS_AGGREGATOR, WALRUS_PUBLISHER } from "@/lib/walrus";

export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const { shipments, ready, updateShipment } = useShipments();
  const { role } = useRole();
  const rawId = decodeURIComponent(params?.id || "");

  const stored = useMemo(() => shipments.find((shipment) => shipment.id === rawId), [shipments, rawId]);
  const demo = useMemo(() => (stored ? null : findShipment(rawId)), [rawId, stored]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
        <Panel>
          <p className="text-pearl">Loading shipment...</p>
        </Panel>
      </div>
    );
  }

  if (!stored && !demo) {
    notFound();
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
  const [showAiDetail, setShowAiDetail] = useState(true);
  const qrValue = `suiship://passport/${shipment.id}`;
  const requiredDocs = shipment.documents.filter((doc) => doc.required);
  const uploadedDocs = requiredDocs.filter((doc) => doc.uploaded).length;
  const ai = shipment.ai;

  function updateDoc(index: number, patch: Partial<DocumentRequirement>) {
    const nextDocs = shipment.documents.map((doc, idx) => (idx === index ? { ...doc, ...patch } : doc));
    // Any doc edit invalidates the previous AI run so the score stays honest.
    onUpdate({ documents: nextDocs, ai: undefined });
  }

  function attachFile(index: number, file: File) {
    updateDoc(index, {
      uploaded: true,
      fileName: file.name,
      uploadedAt: new Date().toISOString()
    });
  }

  function clearFile(index: number) {
    updateDoc(index, { uploaded: false, fileName: undefined, uploadedAt: undefined });
  }

  function runAi() {
    const result = runAiVerification(shipment);
    onUpdate({ ai: result });
    setShowAiDetail(true);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-10">
      <Link href="/shipments" className="inline-flex items-center gap-2 text-sm text-steel hover:text-pearl">
        <ArrowLeft className="h-4 w-4" />
        Back to shipments
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-sui">Shipment passport</p>
          <h1 className="mt-3 text-4xl font-semibold text-pearl">{shipment.id}</h1>
          <p className="mt-3 text-steel">
            {shipment.cargo.description} from {shipment.shipment.origin} to {shipment.shipment.destination}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={shipment.status} />
          <StatusBadge value={`Created by ${capitalize(shipment.createdBy)}`} />
          {ai && <RiskBadge value={ai.riskLevel} />}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid gap-6">
          <Panel>
            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["AI score", ai ? `${ai.score}%` : "—", ShieldCheck],
                ["Documents", `${uploadedDocs}/${requiredDocs.length}`, FileCheck2],
                ["Transport", shipment.shipment.transportMode, Globe2],
                ["Updated", formatDate(shipment.updatedAt), Clock3]
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
                ["Exporter", shipment.exporter.company],
                ["Importer", shipment.importer.company],
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

          <Panel>
            <h2 className="text-xl font-semibold text-pearl">Exporter and importer details</h2>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {[
                {
                  role: "Exporter",
                  ...shipment.exporter,
                  country: shipment.shipment.origin,
                  responsibility: "Prepares export documents, commercial invoice, packing list, and origin proofs."
                },
                {
                  role: "Importer",
                  ...shipment.importer,
                  country: shipment.shipment.destination,
                  responsibility: "Receives customs package, coordinates broker review, and confirms import clearance."
                }
              ].map((party) => (
                <div key={party.role} className="rounded-2xl border border-blue-100 bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-[#4DA2FF]">{party.role}</p>
                      <h3 className="mt-1 text-xl font-extrabold text-pearl">{party.company}</h3>
                    </div>
                    <Building2 className="h-6 w-6 text-[#4DA2FF]" />
                  </div>
                  <div className="mt-5 grid gap-3 text-sm">
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
                    <p className="rounded-2xl bg-blue-50 p-3 font-semibold leading-6 text-steel">{party.responsibility}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-pearl">Documents</h2>
                <p className="mt-1 text-sm text-steel">
                  Each side uploads the documents assigned to them. You are signed in as{" "}
                  <span className="font-bold text-pearl">{currentRoleOwner}</span>.
                </p>
              </div>
              <AiScoreBadge ai={ai} />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-blue-50 text-xs font-bold uppercase text-steel">
                    <th className="pb-3 pr-4">Document</th>
                    <th className="pb-3 pr-4">In charge</th>
                    <th className="pb-3 pr-4">Required</th>
                    <th className="pb-3 pr-4">Upload</th>
                    <th className="pb-3 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {shipment.documents.map((doc, index) => {
                    const canUpload = doc.owner === currentRoleOwner;
                    return (
                      <tr key={doc.name} className="align-top">
                        <td className="py-4 pr-4">
                          <p className="font-bold text-pearl">{doc.name}</p>
                          {doc.fileName && (
                            <p className="mt-1 text-xs font-semibold text-steel">File: {doc.fileName}</p>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          <select
                            value={doc.owner}
                            onChange={(event) => updateDoc(index, { owner: event.target.value as DocumentOwner })}
                            className={cn(
                              "min-h-10 rounded-2xl border px-3 text-sm font-semibold outline-none",
                              canUpload
                                ? "border-[#4DA2FF]/50 bg-blue-50 text-pearl"
                                : "border-blue-100 bg-white text-pearl"
                            )}
                          >
                            <option value="Importer">Importer</option>
                            <option value="Exporter">Exporter</option>
                          </select>
                        </td>
                        <td className="py-4 pr-4">
                          <label className="inline-flex items-center gap-2 text-sm font-bold text-pearl">
                            <input
                              type="checkbox"
                              checked={doc.required}
                              onChange={(event) => updateDoc(index, { required: event.target.checked })}
                              className="h-4 w-4 rounded border-blue-200 text-[#4DA2FF] focus:ring-[#4DA2FF]"
                            />
                            {doc.required ? "Required" : "Optional"}
                          </label>
                        </td>
                        <td className="py-4 pr-4">
                          {canUpload ? (
                            <UploadCell
                              doc={doc}
                              onAttach={(file) => attachFile(index, file)}
                              onClear={() => clearFile(index)}
                            />
                          ) : (
                            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-steel">
                              <Lock className="h-3 w-3" />
                              {doc.owner} only
                            </span>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          {doc.uploaded ? (
                            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />
                              Uploaded
                            </span>
                          ) : doc.required ? (
                            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600">
                              Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-steel">
                              Optional
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-steel">
              Tip: switch role in the sidebar (Importer ↔ Exporter) to upload documents owned by the other side.
            </p>
          </Panel>
        </div>

        <aside className="grid h-fit min-w-0 gap-6">
          <AiPanel
            ai={ai}
            onRun={runAi}
            showDetail={showAiDetail}
            onToggleDetail={() => setShowAiDetail((open) => !open)}
          />

          <WalrusPanel
            ai={ai}
            walrus={shipment.walrus}
            onUploaded={(upload) => onUpdate({ walrus: upload })}
            onClear={() => onUpdate({ walrus: undefined })}
          />

          <Panel>
            <div className="flex items-center gap-3">
              <Boxes className="h-5 w-5 text-sui" />
              <h2 className="text-xl font-semibold text-pearl">Workflow</h2>
            </div>
            <div className="mt-5 grid gap-2 text-sm">
              <p className="text-steel">Created by</p>
              <p className="font-extrabold text-pearl">{capitalize(shipment.createdBy)}</p>
              <p className="mt-3 text-steel">Created</p>
              <p className="font-semibold text-pearl">{formatDate(shipment.createdAt)}</p>
              <p className="mt-3 text-steel">Updated</p>
              <p className="font-semibold text-pearl">{formatDate(shipment.updatedAt)}</p>
            </div>
            {shipment.inviteToken && (
              <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm">
                <div className="flex items-center gap-2 font-bold text-pearl">
                  <Lock className="h-4 w-4 text-[#4DA2FF]" />
                  Counterparty invite active
                </div>
                <p className="mt-1 break-all text-xs text-steel">Token: {shipment.inviteToken}</p>
              </div>
            )}
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
            <p className="mt-2 text-sm text-steel">For a minted passport, this signs a Sui status update transaction.</p>
            <div className="mt-5">
              <PassportActions objectId={undefined} />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function AiPanel({
  ai,
  onRun,
  showDetail,
  onToggleDetail
}: {
  ai?: AiResult;
  onRun: () => void;
  showDetail: boolean;
  onToggleDetail: () => void;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#4DA2FF]" />
          <h2 className="text-xl font-semibold text-pearl">AI verification</h2>
        </div>
        {ai && <RiskBadge value={ai.riskLevel} />}
      </div>

      {!ai ? (
        <>
          <p className="mt-3 text-sm text-steel">
            Cross-checks uploaded files for invoice, HS code, quantity, value, parties and origin.
          </p>
          <Button onClick={onRun} className="mt-4 w-full">
            <Sparkles className="h-4 w-4" />
            Run AI check
          </Button>
        </>
      ) : (
        <>
          <div
            className={cn(
              "mt-4 flex items-end justify-between rounded-2xl border px-4 py-3",
              ai.riskLevel === "Low" && "border-emerald-100 bg-emerald-50",
              ai.riskLevel === "Medium" && "border-amber-100 bg-amber-50",
              ai.riskLevel === "High" && "border-red-100 bg-red-50"
            )}
          >
            <div>
              <p
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wide",
                  ai.riskLevel === "Low" && "text-emerald-600",
                  ai.riskLevel === "Medium" && "text-amber-600",
                  ai.riskLevel === "High" && "text-red-500"
                )}
              >
                Score
              </p>
              <p className="text-4xl font-extrabold text-pearl">{ai.score}</p>
            </div>
            <p className="text-[10px] font-semibold text-steel">{formatDate(ai.ranAt)}</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Match" value={ai.checks.filter((c) => c.status === "matched").length} tone="emerald" />
            <MiniStat label="1 src" value={ai.checks.filter((c) => c.status === "info").length} tone="blue" />
            <MiniStat
              label="Issue"
              value={ai.checks.filter((c) => c.status === "missing" || c.status === "mismatch").length}
              tone="amber"
            />
          </div>

          <p className="mt-3 text-xs leading-5 text-steel">{ai.summary}</p>

          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={onToggleDetail} className="flex-1">
              <Search className="h-3 w-3" />
              {showDetail ? "Hide" : "Details"}
            </Button>
            <Button onClick={onRun} className="flex-1">
              <Sparkles className="h-3 w-3" />
              Re-run
            </Button>
          </div>

          {showDetail && (
            <div className="mt-4 grid gap-2">
              {ai.checks.map((check) => (
                <AiCheckRow key={check.field} check={check} />
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

const MIN_AI_SCORE_FOR_WALRUS = 90;

function WalrusPanel({
  ai,
  walrus,
  onUploaded,
  onClear
}: {
  ai?: AiResult;
  walrus?: WalrusUpload;
  onUploaded: (upload: WalrusUpload) => void;
  onClear: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const aiPassed = !!ai && ai.score >= MIN_AI_SCORE_FOR_WALRUS;
  const canUpload = aiPassed && !!file && phase !== "uploading";

  async function handleUpload() {
    if (!file) return;
    setPhase("uploading");
    setError(null);
    try {
      const { blobId, endEpoch } = await storeBlob({ file, epochs: 5 });
      onUploaded({
        blobId,
        fileName: file.name,
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
        endEpoch,
        publisher: WALRUS_PUBLISHER,
        aggregator: WALRUS_AGGREGATOR
      });
      setFile(null);
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
    }
  }

  async function copyBlobId() {
    if (!walrus?.blobId) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(walrus.blobId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <Panel className="min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CloudUpload className="h-5 w-5 shrink-0 text-[#4DA2FF]" />
          <h2 className="truncate text-xl font-semibold text-pearl">Walrus storage</h2>
        </div>
        {walrus && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Uploaded
          </span>
        )}
      </div>

      {!walrus ? (
        <>
          <p className="mt-3 text-sm text-steel">
            Zip all required documents into one file, then upload to Walrus testnet.
          </p>

          {!aiPassed && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Run AI verification and reach a score of at least {MIN_AI_SCORE_FOR_WALRUS} before uploading.
                {ai ? ` Current score: ${ai.score}.` : ""}
              </span>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              setFile(picked || null);
              setError(null);
              event.target.value = "";
            }}
          />

          <div className="mt-4 flex w-full min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-extrabold text-pearl transition hover:bg-blue-100",
                !aiPassed && "opacity-60"
              )}
            >
              <FileArchive className="h-3.5 w-3.5 text-[#4DA2FF]" />
              {file ? "Change zip" : "Choose zip"}
            </button>
            <span
              className="block min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap text-xs font-semibold text-steel"
              title={file?.name}
            >
              {file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected"}
            </span>
          </div>

          <Button onClick={handleUpload} disabled={!canUpload} className="mt-3 w-full">
            {phase === "uploading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                Upload to Walrus
              </>
            )}
          </Button>

          {error && (
            <details className="mt-3 rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-600">
              <summary className="flex cursor-pointer items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Upload failed — show details
              </summary>
              <p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px] font-medium">{error}</p>
            </details>
          )}
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="rounded-2xl bg-blue-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-steel">Blob ID</p>
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="min-w-0 break-all font-mono text-xs font-bold text-pearl">{walrus.blobId}</p>
                <button
                  type="button"
                  onClick={copyBlobId}
                  className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-[#4DA2FF] hover:bg-blue-50"
                >
                  <Copy className="inline h-3 w-3" /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <InfoTile label="File" value={walrus.fileName} />
              <InfoTile label="Size" value={formatBytes(walrus.sizeBytes)} />
              <InfoTile label="Uploaded" value={formatDate(walrus.uploadedAt)} />
              <InfoTile label="End epoch" value={walrus.endEpoch?.toString() || "—"} />
            </div>

            <a
              href={aggregatorUrl(walrus.blobId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#4DA2FF] px-4 py-2 text-sm font-extrabold text-white shadow-glow hover:brightness-105"
            >
              <ExternalLink className="h-4 w-4" />
              Open on Walrus aggregator
            </a>

            <button
              type="button"
              onClick={onClear}
              className="rounded-2xl bg-blue-50 px-4 py-2 text-xs font-bold text-steel hover:text-red-500"
            >
              Replace zip / re-upload
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-blue-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-steel">{label}</p>
      <p className="mt-0.5 truncate text-xs font-bold text-pearl">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function UploadCell({
  doc,
  onAttach,
  onClear
}: {
  doc: DocumentRequirement;
  onAttach: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold transition",
            doc.uploaded ? "bg-emerald-50 text-emerald-600" : "bg-[#4DA2FF] text-white shadow-glow hover:brightness-105"
          )}
        >
          <Upload className="h-3 w-3" />
          {doc.uploaded ? "Replace" : "Upload"}
        </button>
        {doc.uploaded && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-steel hover:text-red-500"
          >
            Clear
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onAttach(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function AiScoreBadge({ ai }: { ai?: AiResult }) {
  if (!ai) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-steel">
        <Sparkles className="h-3 w-3 text-[#4DA2FF]" />
        AI not run yet
      </div>
    );
  }
  const tone =
    ai.riskLevel === "Low"
      ? "bg-emerald-50 text-emerald-600"
      : ai.riskLevel === "Medium"
        ? "bg-amber-50 text-amber-600"
        : "bg-red-50 text-red-500";
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold", tone)}>
      <Sparkles className="h-3 w-3" />
      AI score: {ai.score}
    </div>
  );
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

function MiniStat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-100 bg-emerald-50 text-emerald-600"
      : tone === "amber"
        ? "border-amber-100 bg-amber-50 text-amber-600"
        : "border-blue-100 bg-blue-50 text-[#4DA2FF]";
  return (
    <div className={cn("rounded-xl border px-2 py-2 text-center", toneClass)}>
      <p className="text-lg font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide">{label}</p>
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
