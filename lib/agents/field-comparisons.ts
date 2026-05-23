import type { ShipmentRecord } from "@/lib/shipments-store";
import type { RecalledMemory } from "./memory-agent";

export type FieldComparison = {
  field: string;
  label: string;
  enteredValue: string | number | null;
  extractedValue: string | number | null;
  rememberedValue: string | number | null;
  finalValue?: string | number | null;
  sourceDocuments: string[];
  findingType:
    | "entered_vs_extracted"
    | "cross_shipment_memory"
    | "duplicate_document"
    | "missing_data"
    | "consistency";
  severity: "info" | "warning" | "critical";
  confidence: number;
  explanation: string;
  recommendedAction: string;
  evidence?: EvidenceLink[];
};

export type EvidenceLink = {
  label: string;
  kind: "walrus" | "sui_tx" | "sui_object" | "document" | "memwal";
  value: string;
};

export type ShipmentMemoryFact = {
  exporterNamespace: string;
  shipmentId: string;
  field: string;
  enteredValue: string | number | null;
  extractedValue: string | number | null;
  finalAcceptedValue: string | number | null;
  source: "entered" | "extracted" | "agent_resolved";
  confidence: number;
  evidence: {
    documentType?: string;
    documentName?: string;
    walrusBlobId?: string;
    suiTxDigest?: string;
    suiPassport?: string;
  };
  createdAt: string;
};

export type AgentMemoryTraceStep = {
  id: string;
  label: string;
  status: "complete" | "warning" | "critical";
  detail: string;
};

type ExtractedField = {
  value: string | number | null;
  documents: string[];
};

type FieldPolicy = {
  field: string;
  label: string;
  entered: (shipment: ShipmentRecord) => string | number | null;
  extracted: (manifest: Record<string, unknown>) => ExtractedField;
  severity: "warning" | "critical";
  recommendedAction: string;
  finalPreference: "extracted" | "entered";
  compareWithMemory: boolean;
};

export type ComparisonBundle = {
  comparisons: FieldComparison[];
  trace: AgentMemoryTraceStep[];
  baselineStatus: "baseline_established" | "prior_memory_found";
};

export function buildFieldComparisons(input: {
  shipment: ShipmentRecord;
  compactManifest: string | null;
  rememberedFacts: ShipmentMemoryFact[];
  documentFingerprints: RecalledMemory[];
}): ComparisonBundle {
  const manifest = parseManifest(input.compactManifest);
  const comparisons: FieldComparison[] = [];
  const trace: AgentMemoryTraceStep[] = [
    {
      id: "documents_extracted",
      label: "Documents extracted",
      status: "complete",
      detail: "The agent read uploaded shipment PDFs and normalized key fields.",
    },
  ];

  const rememberedByField = newestFactByField(input.rememberedFacts);
  for (const policy of FIELD_POLICIES) {
    const enteredValue = policy.entered(input.shipment);
    const extracted = policy.extracted(manifest);
    const remembered = rememberedByField.get(policy.field);
    const finalValue = chooseFinalValue(enteredValue, extracted.value, policy.finalPreference);

    if (isMissing(enteredValue) && isMissing(extracted.value)) {
      comparisons.push({
        field: policy.field,
        label: policy.label,
        enteredValue,
        extractedValue: extracted.value,
        rememberedValue: remembered?.finalAcceptedValue ?? null,
        finalValue,
        sourceDocuments: extracted.documents,
        findingType: "missing_data",
        severity: "info",
        confidence: 0.7,
        explanation: `${policy.label} is not available in the form or extracted documents.`,
        recommendedAction: "Upload a clearer document or enter the missing field before final review.",
        evidence: evidenceFromFact(remembered),
      });
      continue;
    }

    const enteredExtractedMismatch = !valuesEquivalent(policy.field, enteredValue, extracted.value) && !isMissing(enteredValue) && !isMissing(extracted.value);
    if (enteredExtractedMismatch) {
      comparisons.push({
        field: policy.field,
        label: policy.label,
        enteredValue,
        extractedValue: extracted.value,
        rememberedValue: remembered?.finalAcceptedValue ?? null,
        finalValue,
        sourceDocuments: extracted.documents,
        findingType: "entered_vs_extracted",
        severity: policy.severity,
        confidence: 0.94,
        explanation: `${policy.label} entered in the shipment form does not match the value extracted from the documents.`,
        recommendedAction: policy.recommendedAction,
        evidence: evidenceFromFact(remembered),
      });
    }

    if (policy.compareWithMemory && !isMissing(finalValue)) {
      comparisons.push({
        field: policy.field,
        label: policy.label,
        enteredValue,
        extractedValue: extracted.value,
        rememberedValue: remembered?.finalAcceptedValue ?? null,
        finalValue,
        sourceDocuments: extracted.documents,
        findingType: "consistency",
        severity: "info",
        confidence: 0.9,
        explanation: `${policy.label} captured for exporter identity memory.`,
        recommendedAction: "",
        evidence: evidenceFromFact(remembered),
      });
    }

    const memoryMismatch = policy.compareWithMemory && remembered
      ? firstMemoryMismatch(policy.field, enteredValue, extracted.value, finalValue, remembered.finalAcceptedValue)
      : null;
    if (remembered && memoryMismatch && !isMissing(remembered.finalAcceptedValue)) {
      comparisons.push({
        field: policy.field,
        label: policy.label,
        enteredValue,
        extractedValue: extracted.value,
        rememberedValue: remembered.finalAcceptedValue,
        finalValue: memoryMismatch.value as string | number,
        sourceDocuments: extracted.documents,
        findingType: "cross_shipment_memory",
        severity: memorySeverity(policy.field, memoryMismatch.value, remembered.finalAcceptedValue),
        confidence: Math.max(0.75, remembered.confidence),
        explanation: memoryExplanation(policy.field, policy.label, memoryMismatch.value, remembered.finalAcceptedValue, input.rememberedFacts.length),
        recommendedAction: memoryRecommendedAction(policy.field),
        evidence: evidenceFromFact(remembered),
      });
    }
  }

  comparisons.push(...buildDuplicateComparisons(input.shipment.id, manifest, input.documentFingerprints));

  trace.push({
    id: "entered_extracted_compared",
    label: "Entered fields compared with extracted facts",
    status: comparisons.some((c) => c.findingType === "entered_vs_extracted" && c.severity === "critical") ? "critical" : "complete",
    detail: `${comparisons.filter((c) => c.findingType === "entered_vs_extracted").length} form-vs-document difference(s) found.`,
  });

  const baselineStatus = input.rememberedFacts.length > 0 ? "prior_memory_found" : "baseline_established";
  trace.push({
    id: "memwal_recall",
    label: baselineStatus === "prior_memory_found" ? "MemWal recalled exporter baseline" : "No prior exporter memory found",
    status: "complete",
    detail: baselineStatus === "prior_memory_found"
      ? `${input.rememberedFacts.length} structured fact(s) recalled from MemWal.`
      : "This shipment will establish the exporter's baseline memory after mint.",
  });

  trace.push({
    id: "memory_comparison",
    label: "Differences detected",
    status: comparisons.some((c) => c.severity === "critical") ? "critical" : comparisons.some((c) => c.severity === "warning") ? "warning" : "complete",
    detail: `${comparisons.filter((c) => c.findingType !== "missing_data" && c.findingType !== "consistency").length} actionable comparison(s) found.`,
  });

  trace.push({
    id: "evidence_anchored",
    label: "Evidence anchored to Walrus/Sui",
    status: "complete",
    detail: "MemWal facts and document fingerprints include Walrus blob and Sui passport references when minted.",
  });

  return { comparisons, trace, baselineStatus };
}

export function buildMemoryFactsFromComparisons(input: {
  exporterNamespace: string;
  shipmentId: string;
  comparisons: FieldComparison[];
  walrusBlobIds: string[];
  txDigest: string;
  passportId: string;
  createdAt?: string;
}): ShipmentMemoryFact[] {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return FIELD_POLICIES.filter((policy) => policy.compareWithMemory).map((policy): ShipmentMemoryFact => {
    const comparison = input.comparisons.find((item) => item.field === policy.field);
    const finalAcceptedValue = comparison?.finalValue ?? comparison?.extractedValue ?? comparison?.enteredValue ?? null;
    return {
      exporterNamespace: input.exporterNamespace,
      shipmentId: input.shipmentId,
      field: policy.field,
      enteredValue: comparison?.enteredValue ?? null,
      extractedValue: comparison?.extractedValue ?? null,
      finalAcceptedValue,
      source: !isMissing(comparison?.extractedValue ?? null) ? "extracted" : "entered",
      confidence: comparison?.confidence ?? 0.85,
      evidence: {
        documentName: comparison?.sourceDocuments[0],
        walrusBlobId: input.walrusBlobIds[0],
        suiTxDigest: input.txDigest,
        suiPassport: input.passportId,
      },
      createdAt,
    };
  }).filter((fact) => !isMissing(fact.finalAcceptedValue));
}

export function parseStructuredMemoryFacts(memories: RecalledMemory[]): ShipmentMemoryFact[] {
  const facts: ShipmentMemoryFact[] = [];
  for (const memory of memories) {
    const marker = "SUISHIP_STRUCTURED_FACTS";
    const idx = memory.text.indexOf(marker);
    if (idx === -1) continue;
    const jsonStart = memory.text.indexOf("{", idx);
    if (jsonStart === -1) continue;
    const jsonEnd = memory.text.indexOf("END_SUISHIP_STRUCTURED_FACTS", jsonStart);
    const jsonText = jsonEnd === -1 ? memory.text.slice(jsonStart) : memory.text.slice(jsonStart, jsonEnd).trim();
    try {
      const parsed = JSON.parse(jsonText) as { facts?: ShipmentMemoryFact[] };
      if (Array.isArray(parsed.facts)) {
        facts.push(...parsed.facts);
      }
    } catch {
      // Ignore older or malformed memories; narrative fallback still exists.
    }
  }
  return facts;
}

export function serializeStructuredMemoryFacts(input: {
  exporterNamespace: string;
  shipmentId: string;
  facts: ShipmentMemoryFact[];
  passportId: string;
  txDigest: string;
  walrusBlobIds: string[];
}): string {
  return `SUISHIP_STRUCTURED_FACTS\n${JSON.stringify({
    schema_version: "1.0",
    exporterNamespace: input.exporterNamespace,
    shipmentId: input.shipmentId,
    passportId: input.passportId,
    txDigest: input.txDigest,
    walrusBlobIds: input.walrusBlobIds,
    facts: input.facts,
  }, null, 2)}\nEND_SUISHIP_STRUCTURED_FACTS`;
}

const FIELD_POLICIES: FieldPolicy[] = [
  {
    field: "exporter.name",
    label: "Exporter name",
    entered: (s) => s.exporter.company,
    extracted: (m) => firstExtracted(["commercial_invoice.shipper_name", "bill_of_lading.shipper_name", "certificate_of_origin.exporter_name"], m),
    severity: "critical",
    recommendedAction: "Confirm the exporter identity and request corrected documents if the parties differ.",
    finalPreference: "extracted",
    compareWithMemory: true,
  },
  {
    field: "exporter.tax_id",
    label: "Exporter tax ID",
    entered: (s) => s.exporter.taxId ?? null,
    extracted: (m) => firstExtracted(["commercial_invoice.shipper_tax_id", "bill_of_lading.shipper_tax_id", "certificate_of_origin.exporter_tax_id"], m),
    severity: "critical",
    recommendedAction: "Confirm the exporter tax identifier before relying on this shipment history.",
    finalPreference: "entered",
    compareWithMemory: true,
  },
  {
    field: "exporter.registered_address",
    label: "Exporter registered address",
    entered: (s) => s.exporter.registeredAddress ?? null,
    extracted: (m) => firstAddressExtracted(["commercial_invoice.shipper_address", "bill_of_lading.shipper_address", "certificate_of_origin.exporter_address"], m),
    severity: "critical",
    recommendedAction: "Verify the exporter registered address against company registry records before release.",
    finalPreference: "extracted",
    compareWithMemory: true,
  },
  {
    field: "exporter.bank_beneficiary_name",
    label: "Exporter bank beneficiary",
    entered: (s) => s.exporter.bankBeneficiaryName ?? null,
    extracted: (m) => firstExtracted(["commercial_invoice.bank_beneficiary_name", "commercial_invoice.shipper_name"], m),
    severity: "critical",
    recommendedAction: "Confirm the beneficiary name with the exporter through a trusted channel.",
    finalPreference: "extracted",
    compareWithMemory: true,
  },
  {
    field: "exporter.bank_account",
    label: "Exporter bank account",
    entered: (s) => s.exporter.bankAccountNumber ?? s.exporter.bankIban ?? s.exporter.bankSwift ?? null,
    extracted: (m) => firstExtracted(["commercial_invoice.bank_account_number", "commercial_invoice.bank_iban", "commercial_invoice.bank_swift"], m),
    severity: "critical",
    recommendedAction: "Hold payment and verify bank details out-of-band; this is consistent with payment diversion fraud.",
    finalPreference: "extracted",
    compareWithMemory: true,
  },
  {
    field: "importer.name",
    label: "Importer name",
    entered: (s) => s.importer.company,
    extracted: (m) => firstExtracted(["commercial_invoice.recipient_name", "bill_of_lading.consignee_name", "certificate_of_origin.importer_name"], m),
    severity: "critical",
    recommendedAction: "Confirm the importer identity and correct mismatched documents.",
    finalPreference: "extracted",
    compareWithMemory: false,
  },
  {
    field: "shipment.origin",
    label: "Origin",
    entered: (s) => s.shipment.origin,
    extracted: (m) => firstExtracted(["bill_of_lading.port_of_loading", "certificate_of_origin.country_of_origin"], m),
    severity: "warning",
    recommendedAction: "Review route details and verify the origin shown on transport documents.",
    finalPreference: "entered",
    compareWithMemory: false,
  },
  {
    field: "shipment.destination",
    label: "Destination",
    entered: (s) => s.shipment.destination,
    extracted: (m) => firstExtracted(["bill_of_lading.port_of_discharge", "commercial_invoice.recipient_city", "packing_list.consignee_city"], m),
    severity: "warning",
    recommendedAction: "Review route details and verify the destination shown on transport documents.",
    finalPreference: "entered",
    compareWithMemory: false,
  },
  {
    field: "cargo.hs_code",
    label: "HS code",
    entered: (s) => s.cargo.hsCode,
    extracted: (m) => firstExtracted(["commercial_invoice.line_items.0.hs_code", "certificate_of_origin.goods.0.hs_code", "bill_of_lading.cargo.0.hs_code"], m),
    severity: "critical",
    recommendedAction: "Resolve the HS code before customs submission; tariff classification affects duties and admissibility.",
    finalPreference: "extracted",
    compareWithMemory: false,
  },
  {
    field: "cargo.declared_value",
    label: "Declared value",
    entered: (s) => s.shipment.declaredValue,
    extracted: (m) => firstExtracted(["commercial_invoice.total_invoice_amount"], m),
    severity: "critical",
    recommendedAction: "Reconcile commercial value against the invoice and update the form or document set.",
    finalPreference: "extracted",
    compareWithMemory: false,
  },
  {
    field: "cargo.country_of_origin",
    label: "Country of origin",
    entered: (s) => s.cargo.countryOfOrigin,
    extracted: (m) => firstExtracted(["certificate_of_origin.country_of_origin", "commercial_invoice.line_items.0.country_of_origin"], m),
    severity: "critical",
    recommendedAction: "Investigate potential origin laundering or tariff-evasion risk.",
    finalPreference: "extracted",
    compareWithMemory: true,
  },
  {
    field: "documents.invoice_number",
    label: "Invoice number",
    entered: () => null,
    extracted: (m) => firstExtracted(["commercial_invoice.invoice_number"], m),
    severity: "critical",
    recommendedAction: "Verify the invoice number and ensure documents belong to this shipment.",
    finalPreference: "extracted",
    compareWithMemory: false,
  },
  {
    field: "shipment.bl_number",
    label: "BOL number",
    entered: (s) => s.shipment.bookingRef ?? null,
    extracted: (m) => firstExtracted(["bill_of_lading.bl_number", "commercial_invoice.sender_reference"], m),
    severity: "critical",
    recommendedAction: "Verify the bill of lading number and reject duplicate or mismatched transport references.",
    finalPreference: "extracted",
    compareWithMemory: false,
  },
  {
    field: "shipment.payment_terms",
    label: "Payment / bank reference",
    entered: (s) => s.shipment.paymentTerms ?? null,
    extracted: (m) => firstExtracted(["commercial_invoice.payment_terms"], m),
    severity: "critical",
    recommendedAction: "Reconcile payment terms against the invoice for this shipment.",
    finalPreference: "extracted",
    compareWithMemory: false,
  },
  {
    field: "cargo.description",
    label: "Cargo description",
    entered: (s) => s.cargo.description,
    extracted: (m) => firstExtracted(["commercial_invoice.line_items.0.description", "bill_of_lading.cargo.0.description", "certificate_of_origin.goods.0.description"], m),
    severity: "warning",
    recommendedAction: "Review cargo description differences and request clarification if the goods differ materially.",
    finalPreference: "extracted",
    compareWithMemory: false,
  },
  {
    field: "documents.origin_issuer",
    label: "Origin certificate issuer",
    entered: () => null,
    extracted: (m) => firstExtracted(["certificate_of_origin.issuing_authority"], m),
    severity: "warning",
    recommendedAction: "Verify the certificate issuer is appropriate for this exporter and origin country.",
    finalPreference: "extracted",
    compareWithMemory: true,
  },
];

function parseManifest(compactManifest: string | null): Record<string, unknown> {
  if (!compactManifest) return {};
  try {
    return JSON.parse(compactManifest) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function firstExtracted(paths: string[], manifest: Record<string, unknown>): ExtractedField {
  for (const path of paths) {
    const value = getPath(manifest, path);
    if (!isMissing(value)) {
      return { value: value as string | number, documents: [path.split(".")[0]] };
    }
  }
  return { value: null, documents: [] };
}

function firstAddressExtracted(paths: string[], manifest: Record<string, unknown>): ExtractedField {
  for (const path of paths) {
    const value = getPath(manifest, path);
    const formatted = formatAddress(value);
    if (!isMissing(formatted)) {
      return { value: formatted, documents: [path.split(".")[0]] };
    }
  }
  return { value: null, documents: [] };
}

function formatAddress(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object") return null;
  const address = value as Record<string, unknown>;
  return [
    address.street,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ") || null;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce((current: unknown, part) => {
    if (current == null) return undefined;
    if (Array.isArray(current)) return current[Number(part)];
    if (typeof current === "object") return (current as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

function chooseFinalValue(entered: string | number | null, extracted: string | number | null, preference: "entered" | "extracted") {
  if (preference === "extracted") return !isMissing(extracted) ? extracted : entered;
  return !isMissing(entered) ? entered : extracted;
}

function newestFactByField(facts: ShipmentMemoryFact[]) {
  const map = new Map<string, ShipmentMemoryFact>();
  for (const fact of facts) {
    const existing = map.get(fact.field);
    if (!existing || existing.createdAt < fact.createdAt) {
      map.set(fact.field, fact);
    }
  }
  return map;
}

function valuesEquivalent(field: string, a: unknown, b: unknown): boolean {
  if (isMissing(a) || isMissing(b)) return true;
  if (field.includes("declared_value")) {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (na == null || nb == null) return normalizeText(a) === normalizeText(b);
    const diff = Math.abs(na - nb);
    return diff <= Math.max(1, Math.abs(nb) * 0.02);
  }
  if (field.includes("hs_code")) return normalizeText(a).replace(/\./g, "") === normalizeText(b).replace(/\./g, "");
  if (field.includes("name")) return normalizeText(a).replace(/\b(llc|ltd|inc|corp|co|limited)\b/g, "").trim() === normalizeText(b).replace(/\b(llc|ltd|inc|corp|co|limited)\b/g, "").trim();
  return normalizeText(a) === normalizeText(b);
}

function firstMemoryMismatch(
  field: string,
  entered: unknown,
  extracted: unknown,
  finalValue: unknown,
  remembered: unknown
): { source: string; value: unknown } | null {
  const candidates = [
    { source: "extracted documents", value: extracted },
    { source: "resolved shipment value", value: finalValue },
    { source: "entered form", value: entered },
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (isMissing(candidate.value)) continue;
    const normalized = normalizeText(candidate.value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (!memoryValuesEquivalent(field, candidate.value, remembered)) return candidate;
  }
  return null;
}

function memorySeverity(field: string, current: unknown, remembered: unknown): "warning" | "critical" {
  void current;
  void remembered;
  if (field.includes("bank") || field.includes("tax_id") || field.includes("name") || field.includes("registered_address")) return "critical";
  if (field.includes("country_of_origin")) return "critical";
  return "warning";
}

function memoryValuesEquivalent(field: string, current: unknown, remembered: unknown): boolean {
  if (isMissing(current) || isMissing(remembered)) return true;
  if (
    field === "exporter.name" ||
    field === "exporter.tax_id" ||
    field === "exporter.registered_address" ||
    field === "exporter.bank_beneficiary_name" ||
    field === "exporter.bank_account"
  ) {
    return String(current).trim() === String(remembered).trim();
  }
  return valuesEquivalent(field, current, remembered);
}

function memoryExplanation(field: string, label: string, current: unknown, remembered: unknown, priorCount: number): string {
  if (field === "exporter.bank_account") {
    return `Payment diversion: exporter bank account differs from all ${priorCount} prior shipment(s). Bank: ${maskAccount(remembered)} -> ${maskAccount(current)}. This pattern is consistent with Business Email Compromise (BEC) or invoice fraud.`;
  }
  if (field === "exporter.registered_address") {
    return `Identity fraud: same exporter name, different registered address. Remembered ${remembered}; current ${current}.`;
  }
  if (field === "cargo.country_of_origin") {
    return `Origin fraud / tariff evasion: country of origin changed from ${remembered} to ${current} for the same exporter.`;
  }
  if (field === "documents.origin_issuer") {
    return `Document issuer consistency: certificate issuer changed from ${remembered} to ${current}.`;
  }
  return `${label} differs from this exporter's remembered identity baseline.`;
}

function memoryRecommendedAction(field: string): string {
  if (field === "exporter.bank_account") return "Hold payment and verify the beneficiary account with the exporter using a trusted channel.";
  if (field === "exporter.registered_address") return "Verify the exporter identity against registry records and prior KYC documents.";
  if (field === "cargo.country_of_origin") return "Request origin support and screen for tariff, sanctions, or preference-rule exposure.";
  return "Review the identity change with compliance before release.";
}

function buildDuplicateComparisons(shipmentId: string, manifest: Record<string, unknown>, fingerprints: RecalledMemory[]): FieldComparison[] {
  const invoice = firstExtracted(["commercial_invoice.invoice_number"], manifest).value;
  const bol = firstExtracted(["bill_of_lading.bl_number"], manifest).value;
  const coo = firstExtracted(["certificate_of_origin.certificate_number"], manifest).value;
  const comparisons: FieldComparison[] = [];
  for (const item of fingerprints) {
    const priorShipment = extractField(item.text, "shipment_id");
    if (priorShipment && priorShipment === shipmentId) continue;
    const priorInvoice = extractField(item.text, "invoice_number");
    const priorBol = extractField(item.text, "bol_number");
    const priorCoo = extractField(item.text, "coo_number");
    if (!isMissing(invoice) && priorInvoice && valuesEquivalent("documents.invoice_number", invoice, priorInvoice)) {
      comparisons.push(duplicateComparison("documents.invoice_number", "Invoice number", invoice, priorInvoice, priorShipment, item));
    }
    if (!isMissing(bol) && priorBol && valuesEquivalent("shipment.bl_number", bol, priorBol)) {
      comparisons.push(duplicateComparison("shipment.bl_number", "BOL number", bol, priorBol, priorShipment, item));
    }
    if (!isMissing(coo) && priorCoo && valuesEquivalent("documents.coo_number", coo, priorCoo)) {
      comparisons.push(duplicateComparison("documents.coo_number", "COO number", coo, priorCoo, priorShipment, item));
    }
  }
  return comparisons;
}

function duplicateComparison(field: string, label: string, current: unknown, remembered: unknown, priorShipment: string | undefined, item: RecalledMemory): FieldComparison {
  const explanation = field === "shipment.bl_number"
    ? `Bill of lading ${current} was previously recorded in shipment ${priorShipment ?? "unknown"}. A bill of lading is a unique title document; duplication indicates the cargo may not exist or has already been released.`
    : field === "documents.coo_number"
      ? `Certificate of origin ${current} was previously recorded in shipment ${priorShipment ?? "unknown"}. Reuse can indicate forged or recycled origin documentation.`
      : `Double-financing fraud: invoice ${current} was previously recorded in shipment ${priorShipment ?? "unknown"}. The same invoice can be used to obtain financing twice.`;
  return {
    field,
    label,
    enteredValue: null,
    extractedValue: current as string | number,
    rememberedValue: remembered as string | number,
    finalValue: current as string | number,
    sourceDocuments: [],
    findingType: "duplicate_document",
    severity: "critical",
    confidence: 0.98,
    explanation,
    recommendedAction: "Hold the shipment and verify the document is not being reused fraudulently.",
    evidence: item.blobId ? [{ label: "MemWal memory", kind: "memwal", value: item.blobId }] : [],
  };
}

export function maskAccount(value: unknown): string {
  const raw = String(value ?? "").replace(/\s+/g, "");
  if (!raw) return "unknown";
  const visible = raw.slice(-4);
  return `****${visible}`;
}

function evidenceFromFact(fact: ShipmentMemoryFact | undefined): EvidenceLink[] {
  if (!fact) return [];
  const evidence: EvidenceLink[] = [];
  if (fact.evidence.walrusBlobId) evidence.push({ label: "Walrus evidence", kind: "walrus", value: fact.evidence.walrusBlobId });
  if (fact.evidence.suiTxDigest) evidence.push({ label: "Sui transaction", kind: "sui_tx", value: fact.evidence.suiTxDigest });
  if (fact.evidence.suiPassport) evidence.push({ label: "Sui passport", kind: "sui_object", value: fact.evidence.suiPassport });
  return evidence;
}

function extractField(text: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`${escaped}\\s*[:=]\\s*([^;\\n]+)`, "i"))?.[1]?.trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isMissing(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "" || normalized === "unknown" || normalized === "unclear" || normalized === "n/a";
  }
  return false;
}
