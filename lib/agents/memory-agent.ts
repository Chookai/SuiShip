import type Database from "better-sqlite3";
import type { ShipmentRecord } from "@/lib/shipments-store";
import type { MemWalManifest } from "@/lib/memwal/types";
import {
  isMemWalConfigured,
  memwalRecall,
  memwalRemember,
  memwalRememberAndWait,
  type MemWalRecallItem,
} from "@/lib/memwal/client";
import {
  buildFieldComparisons,
  buildMemoryFactsFromComparisons,
  parseStructuredMemoryFacts,
  serializeStructuredMemoryFacts,
  type FieldComparison,
  type ShipmentMemoryFact,
} from "./field-comparisons";

export type PartyRole = "exporter" | "importer";

export type ShipmentMemoryFacts = {
  shipmentId: string;
  exporter: PartyFacts;
  importer: PartyFacts;
  invoiceNumber?: string;
  bolNumber?: string;
  cooNumber?: string;
  hsCode?: string;
  declaredValue?: number;
  currency?: string;
  origin?: string;
  destination?: string;
  cargoDescription?: string;
  verificationScore?: number;
  riskLevel?: "Low" | "Medium" | "High";
  comparisons?: FieldComparison[];
  rememberedFacts?: ShipmentMemoryFact[];
};

export type PartyFacts = {
  role: PartyRole;
  company: string;
  taxId?: string;
  namespaceKey: string;
  country?: string;
  address?: string;
  bankBeneficiaryName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankSwift?: string;
};

export type MemoryAnomalyFinding = {
  anomalyType: "bank_account_changed" | "duplicate_document" | "address_changed" | "country_of_origin_changed" | "document_issuer_changed" | "party_mismatch";
  severity: "error" | "warning";
  fieldPath: string;
  message: string;
  recalledValue: string;
  currentValue: string;
  priorShipmentReference?: string;
  memoryBlobId?: string;
};

export type RecalledMemory = MemWalRecallItem & {
  namespace: string;
};

type AnalyzeInput = {
  shipment: ShipmentRecord;
  facts: ShipmentMemoryFacts;
  passportId: string;
  txDigest: string;
  walrusBlobIds: string[];
};

export function normalizeNamespaceKey(value: string | undefined, fallback: string): string {
  const raw = (value?.trim() || fallback.trim() || "unknown-party").toLowerCase();
  return raw
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "unknown-party";
}

export function partyNamespace(namespaceKey: string): string {
  return `party:${normalizeNamespaceKey(namespaceKey, namespaceKey)}`;
}

export function documentNamespace(): string {
  return "global:documents";
}

export function buildShipmentMemoryFacts(shipment: ShipmentRecord, compactManifest?: string | null): ShipmentMemoryFacts {
  const parsed = parseCompactManifest(compactManifest);
  const invoice = parsed.commercial_invoice as Record<string, unknown> | undefined;
  const bol = parsed.bill_of_lading as Record<string, unknown> | undefined;
  const coo = parsed.certificate_of_origin as Record<string, unknown> | undefined;

  const invoiceLine = Array.isArray(invoice?.line_items) ? invoice.line_items[0] as Record<string, unknown> | undefined : undefined;
  const cooGood = Array.isArray(coo?.goods) ? coo.goods[0] as Record<string, unknown> | undefined : undefined;
  const declaredValue = firstNumber(invoice?.total_invoice_amount, shipment.shipment.declaredValue);

  return {
    shipmentId: shipment.id,
    exporter: buildPartyFacts(
      "exporter",
      shipment.exporter.company,
      shipment.exporter.taxId,
      shipment.shipment.origin,
      firstAddress(invoice?.shipper_address, bol?.shipper_address, coo?.exporter_address, shipment.exporter.registeredAddress),
      firstString(invoice?.bank_beneficiary_name, shipment.exporter.bankBeneficiaryName),
      firstString(invoice?.bank_account_number, shipment.exporter.bankAccountNumber),
      firstString(invoice?.bank_iban, shipment.exporter.bankIban),
      firstString(invoice?.bank_swift, shipment.exporter.bankSwift)
    ),
    importer: buildPartyFacts(
      "importer",
      shipment.importer.company,
      shipment.importer.taxId,
      shipment.shipment.destination,
      firstAddress(invoice?.recipient_address, bol?.consignee_address, coo?.importer_address)
    ),
    invoiceNumber: firstString(invoice?.invoice_number, invoice?.sender_reference),
    bolNumber: firstString(bol?.bl_number, bol?.invoice_reference),
    cooNumber: firstString(coo?.certificate_number),
    hsCode: firstString(invoiceLine?.hs_code, cooGood?.hs_code, shipment.cargo.hsCode),
    declaredValue,
    currency: firstString(invoice?.currency, shipment.shipment.currency),
    origin: firstString(coo?.country_of_origin, invoiceLine?.country_of_origin, shipment.cargo.countryOfOrigin, shipment.shipment.origin),
    destination: shipment.shipment.destination,
    cargoDescription: shipment.cargo.description,
    verificationScore: shipment.ai?.score,
    riskLevel: shipment.ai?.riskLevel,
  };
}

export async function writePartyMemoryFromShipment(input: AnalyzeInput): Promise<void> {
  if (!isMemWalConfigured()) return;
  const comparisons = input.facts.comparisons ?? [];
  const structuredFacts = buildMemoryFactsFromComparisons({
    exporterNamespace: input.facts.exporter.namespaceKey,
    shipmentId: input.facts.shipmentId,
    comparisons,
    walrusBlobIds: input.walrusBlobIds,
    txDigest: input.txDigest,
    passportId: input.passportId,
  });

  const text = [
    serializeStructuredMemoryFacts({
      exporterNamespace: input.facts.exporter.namespaceKey,
      shipmentId: input.facts.shipmentId,
      facts: structuredFacts,
      passportId: input.passportId,
      txDigest: input.txDigest,
      walrusBlobIds: input.walrusBlobIds,
    }),
    buildPartyNarrative(input.facts.exporter, input),
  ].join("\n\n");

  await memwalRememberAndWait(text, partyNamespace(input.facts.exporter.namespaceKey), 120_000);
}

export async function writeDocumentFingerprint(input: {
  facts: ShipmentMemoryFacts;
  passportId: string;
  txDigest: string;
  walrusBlobIds: string[];
}): Promise<void> {
  if (!isMemWalConfigured()) return;
  if (!input.facts.invoiceNumber && !input.facts.bolNumber && !input.facts.cooNumber) return;

  const text = [
    "DOCUMENT FINGERPRINT",
    `shipment_id: ${input.facts.shipmentId}`,
    `invoice_number: ${input.facts.invoiceNumber ?? "unknown"}`,
    `bol_number: ${input.facts.bolNumber ?? "unknown"}`,
    `coo_number: ${input.facts.cooNumber ?? "unknown"}`,
    `exporter_key: ${input.facts.exporter.namespaceKey}`,
    `importer_key: ${input.facts.importer.namespaceKey}`,
    `origin: ${input.facts.origin ?? "unknown"}`,
    `verified: true`,
    `sui_passport: ${input.passportId}`,
    `sui_tx: ${input.txDigest}`,
    `walrus_evidence: ${input.walrusBlobIds.join(", ")}`,
  ].join("\n");

  await memwalRememberAndWait(text, documentNamespace(), 120_000);
}

export async function writeShipmentMemoryAfterMint(input: {
  shipment: ShipmentRecord;
  compactManifest?: string | null;
  passportId: string;
  txDigest: string;
  walrusBlobIds: string[];
}): Promise<void> {
  if (!isMemWalConfigured()) return;
  const facts = buildShipmentMemoryFacts(input.shipment, input.compactManifest);
  const rememberedFacts: ShipmentMemoryFact[] = [];
  const documentFingerprints: RecalledMemory[] = [];
  facts.comparisons = buildFieldComparisons({
    shipment: input.shipment,
    compactManifest: input.compactManifest ?? null,
    rememberedFacts,
    documentFingerprints,
  }).comparisons;
  await writePartyMemoryFromShipment({ shipment: input.shipment, facts, passportId: input.passportId, txDigest: input.txDigest, walrusBlobIds: input.walrusBlobIds });
  await writeDocumentFingerprint({ facts, passportId: input.passportId, txDigest: input.txDigest, walrusBlobIds: input.walrusBlobIds });
}

export function writePrevalidationPartyMemory(facts: ShipmentMemoryFacts): void {
  if (!isMemWalConfigured()) return;
  const exp = facts.exporter;
  const text = [
    "PARTY IDENTITY (pre-validation — no blockchain anchors yet)",
    `shipment_id: ${facts.shipmentId}`,
    `exporter_company: ${exp.company}`,
    `exporter_tax_id: ${exp.taxId ?? "unknown"}`,
    `exporter_namespace: ${exp.namespaceKey}`,
    `exporter_address: ${exp.address ?? "unknown"}`,
    `exporter_bank_beneficiary: ${exp.bankBeneficiaryName ?? "unknown"}`,
    `exporter_bank_account: ${exp.bankAccountNumber ?? "unknown"}`,
    `exporter_bank_iban: ${exp.bankIban ?? "unknown"}`,
    `exporter_bank_swift: ${exp.bankSwift ?? "unknown"}`,
    `invoice_number: ${facts.invoiceNumber ?? "unknown"}`,
    `bol_number: ${facts.bolNumber ?? "unknown"}`,
    `coo_number: ${facts.cooNumber ?? "unknown"}`,
    `hs_code: ${facts.hsCode ?? "unknown"}`,
    `origin: ${facts.origin ?? "unknown"}`,
    `status: pre_validation`,
  ].join("\n");
  memwalRemember(text, partyNamespace(exp.namespaceKey)).catch(() => {});
}

export async function readPartyMemory(namespaceKey: string, query = "exporter identity profile legal name tax id registered address bank beneficiary bank account IBAN SWIFT country origin document issuer provenance", limit = 5): Promise<RecalledMemory[]> {
  if (!isMemWalConfigured()) return [];
  const namespace = partyNamespace(namespaceKey);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const results = await memwalRecall(query, namespace, limit);
      return results.map((result) => ({ ...result, namespace }));
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return [];
}

export async function readDocumentFingerprints(invoiceNumber?: string, bolNumber?: string, cooNumber?: string, limit = 8): Promise<RecalledMemory[]> {
  if (!isMemWalConfigured()) return [];
  const query = [
    invoiceNumber ? `invoice ${invoiceNumber}` : null,
    bolNumber ? `BOL ${bolNumber}` : null,
    cooNumber ? `certificate of origin ${cooNumber}` : null,
    "document fingerprint duplicate shipment passport walrus",
  ].filter(Boolean).join(" ");
  const namespace = documentNamespace();
  const results = await memwalRecall(query, namespace, limit);
  return results.map((result) => ({ ...result, namespace }));
}

export async function readCrossShipmentMemory(facts: ShipmentMemoryFacts): Promise<{
  exporterHistory: RecalledMemory[];
  importerHistory: RecalledMemory[];
  documentFingerprints: RecalledMemory[];
}> {
  if (!isMemWalConfigured()) {
    return { exporterHistory: [], importerHistory: [], documentFingerprints: [] };
  }

  const [exporter, documents] = await Promise.allSettled([
    readPartyMemory(facts.exporter.namespaceKey),
    readDocumentFingerprints(facts.invoiceNumber, facts.bolNumber, facts.cooNumber),
  ]);
  const exporterHistory = exporter.status === "fulfilled" ? exporter.value : [];

  return {
    exporterHistory,
    importerHistory: [],
    documentFingerprints: documents.status === "fulfilled" ? documents.value : [],
  };
}

export function parseRememberedFacts(memories: RecalledMemory[]): ShipmentMemoryFact[] {
  return parseStructuredMemoryFacts(memories);
}

export function detectAnomalies(facts: ShipmentMemoryFacts, memory: {
  exporterHistory: RecalledMemory[];
  importerHistory: RecalledMemory[];
  documentFingerprints: RecalledMemory[];
}): MemoryAnomalyFinding[] {
  const findings: MemoryAnomalyFinding[] = [];
  compareParty(findings, facts.exporter, facts, memory.exporterHistory);
  compareParty(findings, facts.importer, facts, memory.importerHistory);

  for (const item of memory.documentFingerprints) {
    const priorShipment = extractField(item.text, "shipment_id");
    if (priorShipment && priorShipment === facts.shipmentId) continue;
    const priorInvoice = extractField(item.text, "invoice_number");
    const priorBol = extractField(item.text, "bol_number");
    const priorCoo = extractField(item.text, "coo_number");
    if (facts.invoiceNumber && priorInvoice && sameValue(facts.invoiceNumber, priorInvoice)) {
      findings.push({
        anomalyType: "duplicate_document",
        severity: "error",
        fieldPath: "documents.invoice_number",
        message: `Invoice ${facts.invoiceNumber} was already seen in shipment ${priorShipment ?? "unknown"}.`,
        recalledValue: priorInvoice,
        currentValue: facts.invoiceNumber,
        priorShipmentReference: priorShipment,
        memoryBlobId: item.blobId,
      });
    }
    if (facts.bolNumber && priorBol && sameValue(facts.bolNumber, priorBol)) {
      findings.push({
        anomalyType: "duplicate_document",
        severity: "error",
        fieldPath: "shipment.bl_number",
        message: `BOL ${facts.bolNumber} was already seen in shipment ${priorShipment ?? "unknown"}.`,
        recalledValue: priorBol,
        currentValue: facts.bolNumber,
        priorShipmentReference: priorShipment,
        memoryBlobId: item.blobId,
      });
    }
    if (facts.cooNumber && priorCoo && sameValue(facts.cooNumber, priorCoo)) {
      findings.push({
        anomalyType: "duplicate_document",
        severity: "error",
        fieldPath: "documents.coo_number",
        message: `Certificate of origin ${facts.cooNumber} was already seen in shipment ${priorShipment ?? "unknown"}.`,
        recalledValue: priorCoo,
        currentValue: facts.cooNumber,
        priorShipmentReference: priorShipment,
        memoryBlobId: item.blobId,
      });
    }
  }

  return dedupeAnomalies(findings);
}

export function buildCrossShipmentContext(facts: ShipmentMemoryFacts, memory: {
  exporterHistory: RecalledMemory[];
  importerHistory: RecalledMemory[];
  documentFingerprints: RecalledMemory[];
}, anomalies: MemoryAnomalyFinding[]): string {
  return [
    "## Cross-Shipment MemWal Memory",
    `Exporter namespace: ${partyNamespace(facts.exporter.namespaceKey)} (${memory.exporterHistory.length} recalled)`,
    memory.exporterHistory.map(formatMemoryForPrompt).join("\n"),
    `Importer namespace: ${partyNamespace(facts.importer.namespaceKey)} (${memory.importerHistory.length} recalled)`,
    memory.importerHistory.map(formatMemoryForPrompt).join("\n"),
    `Document fingerprint namespace: ${documentNamespace()} (${memory.documentFingerprints.length} recalled)`,
    memory.documentFingerprints.map(formatMemoryForPrompt).join("\n"),
    "## Deterministic Anomalies",
    anomalies.length > 0 ? JSON.stringify(anomalies, null, 2) : "none",
  ].join("\n").slice(0, 9000);
}

export function latestManifestJson(shipmentId: string, db: Database.Database): string | null {
  const row = db.prepare("SELECT manifest_json FROM manifest_cache WHERE shipment_id = ?").get(shipmentId) as { manifest_json: string } | undefined;
  return row?.manifest_json ?? null;
}

export function factsFromManifestJson(manifestJson: string): ShipmentMemoryFacts | null {
  try {
    const manifest = JSON.parse(manifestJson) as MemWalManifest;
    const pseudo: ShipmentRecord = {
      id: manifest.shipment_id,
      createdAt: manifest.created_at,
      updatedAt: manifest.created_at,
      createdBy: "exporter",
      workflow: "exporter",
      status: "Passport Minted",
      importer: { company: manifest.parties.consignee.name, contact: "", email: "", phone: "", taxId: manifest.parties.consignee.tax_id },
      exporter: { company: manifest.parties.shipper.name, contact: "", email: "", phone: "", taxId: manifest.parties.shipper.tax_id },
      shipment: {
        origin: manifest.shipment.origin,
        originPort: manifest.shipment.origin_port,
        destination: manifest.shipment.destination,
        destinationPort: manifest.shipment.destination_port,
        carrier: manifest.shipment.carrier,
        transportMode: manifest.shipment.transport_mode,
        incoterm: manifest.shipment.incoterm,
        etd: manifest.shipment.etd,
        eta: manifest.shipment.eta,
        declaredValue: manifest.cargo.declared_value,
        currency: manifest.cargo.currency,
        bookingRef: manifest.shipment.booking_ref,
        paymentTerms: manifest.shipment.payment_terms,
        blType: manifest.shipment.bl_type,
      },
      cargo: {
        description: manifest.cargo.description,
        sku: "",
        hsCode: manifest.cargo.hs_code,
        quantity: manifest.cargo.quantity,
        grossWeight: manifest.cargo.gross_weight,
        netWeight: manifest.cargo.net_weight,
        handlingUnits: "",
        container: "",
        seal: "",
        countryOfOrigin: manifest.cargo.country_of_origin,
        dangerousGoods: String(manifest.cargo.dangerous_goods),
        temperatureControlled: String(manifest.cargo.temperature_controlled),
      },
      documents: [],
      ai: {
        score: manifest.ai_verification.score,
        riskLevel: manifest.ai_verification.risk_level,
        ranAt: manifest.ai_verification.ran_at,
        summary: "",
        checks: [],
      },
    };
    return buildShipmentMemoryFacts(pseudo, JSON.stringify({
      commercial_invoice: { total_invoice_amount: manifest.cargo.declared_value, currency: manifest.cargo.currency },
      bill_of_lading: { bl_number: manifest.shipment.bl_number },
    }));
  } catch {
    return null;
  }
}

function buildPartyFacts(
  role: PartyRole,
  company: string,
  taxId: string | undefined,
  country: string,
  address?: string,
  bankBeneficiaryName?: string,
  bankAccountNumber?: string,
  bankIban?: string,
  bankSwift?: string
): PartyFacts {
  return {
    role,
    company,
    taxId,
    namespaceKey: normalizeNamespaceKey(taxId, company),
    country,
    address,
    bankBeneficiaryName,
    bankAccountNumber,
    bankIban,
    bankSwift,
  };
}

function buildPartyNarrative(party: PartyFacts, input: AnalyzeInput): string {
  const f = input.facts;
  return [
    `${party.company} (tax_id: ${party.taxId ?? "unknown"}) is a verified ${party.role} in SuiShip.`,
    `Namespace key is ${party.namespaceKey}.`,
    `IDENTITY legal_name: ${party.company}.`,
    `IDENTITY tax_id: ${party.taxId ?? "unknown"}.`,
    `IDENTITY registered_address: ${party.address ?? "unknown"}.`,
    `IDENTITY bank_beneficiary_name: ${party.bankBeneficiaryName ?? "unknown"}.`,
    `IDENTITY bank_account_number: ${party.bankAccountNumber ?? "unknown"}.`,
    `IDENTITY bank_iban: ${party.bankIban ?? "unknown"}.`,
    `IDENTITY bank_swift: ${party.bankSwift ?? "unknown"}.`,
    `BEHAVIOR country_of_origin: ${f.origin ?? "unknown"}.`,
    `DOCUMENT invoice_number: ${f.invoiceNumber ?? "unknown"}; bol_number: ${f.bolNumber ?? "unknown"}; coo_number: ${f.cooNumber ?? "unknown"}.`,
    `AI verification score was ${f.verificationScore ?? "unknown"} (${f.riskLevel ?? "unknown"} risk).`,
    `Verified in Sui passport ${input.passportId}, transaction ${input.txDigest}.`,
    `Source documents are stored in Walrus blobs: ${input.walrusBlobIds.join(", ")}.`,
    `PROVENANCE: shipment_id=${f.shipmentId}; sui_passport=${input.passportId}; sui_tx=${input.txDigest}; walrus_evidence=${input.walrusBlobIds.join(",")}`,
  ].join(" ");
}

function compareParty(findings: MemoryAnomalyFinding[], party: PartyFacts, facts: ShipmentMemoryFacts, memories: RecalledMemory[]) {
  for (const memory of memories) {
    const priorShipment = extractField(memory.text, "shipment_id");
    if (priorShipment && priorShipment === facts.shipmentId) continue;
    const text = memory.text;
    const currentBank = party.bankAccountNumber ?? party.bankIban ?? party.bankSwift;
    const priorBank = extractIdentityField(text, "bank_account_number") ?? extractIdentityField(text, "bank_iban") ?? extractIdentityField(text, "bank_swift");
    if (currentBank && priorBank && !sameValue(currentBank, priorBank)) {
      findings.push({
        anomalyType: "bank_account_changed",
        severity: "error",
        fieldPath: `${party.role}.bank_account`,
        message: `Payment diversion: ${party.role} bank account differs from recalled identity memory.`,
        recalledValue: priorBank,
        currentValue: currentBank,
        priorShipmentReference: priorShipment,
        memoryBlobId: memory.blobId,
      });
    }

    const priorAddress = extractIdentityField(text, "registered_address");
    if (party.address && priorAddress && !sameValue(party.address, priorAddress) && priorAddress !== "unknown") {
      findings.push({
        anomalyType: "address_changed",
        severity: "error",
        fieldPath: `${party.role}.address`,
        message: `Identity fraud: ${party.role} registered address differs from recalled identity memory.`,
        recalledValue: priorAddress,
        currentValue: party.address,
        priorShipmentReference: priorShipment,
        memoryBlobId: memory.blobId,
      });
    }

    const priorOrigin = extractIdentityField(text, "country_of_origin");
    if (party.role === "exporter" && facts.origin && priorOrigin && !sameValue(facts.origin, priorOrigin) && priorOrigin !== "unknown") {
      findings.push({
        anomalyType: "country_of_origin_changed",
        severity: "warning",
        fieldPath: "cargo.country_of_origin",
        message: `Origin fraud / tariff evasion: country of origin changed from ${priorOrigin} to ${facts.origin} for the same exporter.`,
        recalledValue: priorOrigin,
        currentValue: facts.origin,
        priorShipmentReference: priorShipment,
        memoryBlobId: memory.blobId,
      });
    }
  }
}

function parseCompactManifest(compactManifest?: string | null): Record<string, unknown> {
  if (!compactManifest) return {};
  try {
    return JSON.parse(compactManifest) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstAddress(...values: unknown[]): string | undefined {
  for (const value of values) {
    const formatted = formatAddress(value);
    if (formatted) return formatted;
  }
  return undefined;
}

function formatAddress(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return undefined;
  const address = value as Record<string, unknown>;
  const formatted = [
    address.street,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ");
  return formatted || undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function sameValue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function extractField(text: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*[:=]\\s*([^;\\n]+)`, "i"));
  return match?.[1]?.trim();
}

function extractIdentityField(text: string, field: string): string | undefined {
  const match = text.match(new RegExp(`${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^.;\\n]+)`, "i"));
  const value = match?.[1]?.trim();
  return value && !/unknown|not provided/i.test(value) ? value : undefined;
}

function formatMemoryForPrompt(item: RecalledMemory): string {
  return `[${item.namespace}] blob=${item.blobId} distance=${item.distance.toFixed(4)}\n${item.text.slice(0, 1200)}`;
}

function dedupeAnomalies(findings: MemoryAnomalyFinding[]): MemoryAnomalyFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.anomalyType}:${finding.fieldPath}:${finding.recalledValue}:${finding.currentValue}:${finding.priorShipmentReference ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
