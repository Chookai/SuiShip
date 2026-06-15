import type Database from "better-sqlite3";
import type { AggregateResult } from "@/src/agent/schemas/aggregate-result";

type ExtractionRunRow = {
  id: string;
  aggregate_json: string;
  created_at: string;
};

/**
 * Builds the compact manifest (~1K tokens) for a shipment from its latest
 * non-superseded extraction run stored in SQLite.
 *
 * Returns null if no extraction run exists yet.
 */
export function buildCompactManifest(shipmentId: string, db: Database.Database): string | null {
  const row = db
    .prepare(
      `SELECT id, aggregate_json, created_at FROM extraction_runs
       WHERE shipment_id = ? AND is_superseded = 0
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(shipmentId) as ExtractionRunRow | undefined;

  if (!row) return null;

  try {
    const agg = JSON.parse(row.aggregate_json) as AggregateResult;
    return buildDocSummaryFromAggregate(agg);
  } catch {
    return null;
  }
}

function summarizeInvoice(inv: AggregateResult["detected"]["commercial_invoice"][number]) {
  if (inv.extraction_result.document_type !== "commercial_invoice") return null;
  const d = inv.extraction_result.data;
  return {
    file: inv.file_name,
    invoice_number: d.invoice_number,
    invoice_date: d.invoice_date,
    sender_reference: d.sender_reference,
    payment_terms: d.payment_terms,
    bank_name: d.bank_name,
    bank_beneficiary_name: d.bank_beneficiary_name,
    bank_account_number: d.bank_account_number,
    bank_iban: d.bank_iban,
    bank_swift: d.bank_swift,
    shipper_name: d.sender?.name,
    shipper_tax_id: d.sender?.tax_id,
    shipper_address: d.sender,
    recipient_name: d.recipient?.name,
    recipient_tax_id: d.recipient?.tax_id,
    recipient_address: d.recipient,
    recipient_city: d.recipient?.city,
    city_of_liability: d.city_of_liability,
    incoterms: d.incoterms,
    currency: d.currency,
    total_invoice_amount: d.totals?.total_invoice_amount,
    total_net_weight: d.totals?.total_net_weight,
    line_items: d.line_items?.map((li) => ({
      description: li.description,
      hs_code: li.hs_code,
      country_of_origin: li.country_of_origin,
      quantity: li.quantity,
      subtotal: li.subtotal,
    })),
  };
}

function summarizeBol(bol: AggregateResult["detected"]["bill_of_lading"][number]) {
  if (bol.extraction_result.document_type !== "bill_of_lading") return null;
  const d = bol.extraction_result.data;
  const bolTotalPackages = d.cargo?.reduce((s, c) => s + (c.number_of_packages ?? 0), 0) ?? null;
  const bolTotalGrossWeightKg =
    d.cargo?.reduce(
      (s, c) => (c.gross_weight?.unit === "kg" ? s + (c.gross_weight.value ?? 0) : s),
      0
    ) ?? null;
  return {
    file: bol.file_name,
    bl_number: d.bl_number,
    invoice_reference: d.invoice_reference,
    shipper_name: d.shipper?.name,
    shipper_tax_id: d.shipper?.tax_id,
    shipper_address: d.shipper,
    consignee_name: d.consignee?.name,
    consignee_tax_id: d.consignee?.tax_id,
    consignee_address: d.consignee,
    carrier: d.carrier,
    port_of_loading: d.port_of_loading,
    port_of_discharge: d.port_of_discharge,
    shipment_date: d.shipment_date,
    total_cargo_packages: bolTotalPackages,
    total_cargo_gross_weight_kg: bolTotalGrossWeightKg,
  };
}

function summarizeCoo(coo: AggregateResult["detected"]["certificate_of_origin"][number]) {
  if (coo.extraction_result.document_type !== "certificate_of_origin") return null;
  const d = coo.extraction_result.data;
  return {
    file: coo.file_name,
    certificate_number: d.certificate_number,
    issue_date: d.issue_date,
    country_of_origin: d.country_of_origin,
    issuing_authority: d.issuing_authority,
    exporter_name: d.exporter?.name,
    exporter_tax_id: d.exporter?.tax_id,
    exporter_address: d.exporter,
    importer_name: d.importer?.name,
    importer_tax_id: d.importer?.tax_id,
    importer_address: d.importer,
    goods: d.goods?.map((g) => ({
      hs_code: g.hs_code,
      description: g.description,
      invoice_reference: g.invoice_reference,
      quantity: g.quantity,
    })),
  };
}

function summarizePackingList(pl: AggregateResult["detected"]["packing_list"][number]) {
  if (pl.extraction_result.document_type !== "packing_list") return null;
  const d = pl.extraction_result.data;
  return {
    file: pl.file_name,
    packing_list_number: d.packing_list_number,
    invoice_number: d.invoice_number,
    ship_date: d.ship_date,
    shipper_name: d.shipper?.name,
    consignee_name: d.consignee?.name,
    consignee_city: d.consignee?.city,
    total_packages: d.totals?.total_packages,
    total_gross_weight: d.totals?.total_gross_weight,
    total_net_weight: d.totals?.total_net_weight,
  };
}

function detectFilenameMismatches(agg: AggregateResult): string[] {
  const warnings: string[] = [];
  const typeKeywords: Record<string, string[]> = {
    commercial_invoice: ["invoice"],
    packing_list: ["packing", "pack"],
    bill_of_lading: ["bill", "lading", "bol", "bl"],
    certificate_of_origin: ["certificate", "origin", "coo"],
    insurance: ["insurance"],
    permit: ["permit", "license", "licence"],
  };
  const allDocs = [
    ...agg.detected.commercial_invoice,
    ...agg.detected.packing_list,
    ...agg.detected.bill_of_lading,
    ...agg.detected.certificate_of_origin,
    ...(agg.detected.other ?? []),
  ];
  for (const doc of allDocs) {
    const fn = doc.file_name.toLowerCase().replace(/[_\-.]/g, " ");
    const docType = doc.extraction_result.document_type;
    const selfKeywords = typeKeywords[docType] ?? [];
    const filenameMatchesSelf = selfKeywords.some(kw => fn.includes(kw));

    if (!filenameMatchesSelf) {
      for (const [suggestedType, keywords] of Object.entries(typeKeywords)) {
        if (suggestedType === docType) continue;
        if (keywords.some(kw => fn.includes(kw))) {
          const readableType = docType.replace(/_/g, " ");
          const readableSuggested = suggestedType.replace(/_/g, " ");
          warnings.push(
            `FILENAME MISMATCH: File "${doc.file_name}" filename suggests "${readableSuggested}", but AI classified its content as "${readableType}". This may indicate a mislabeled or fraudulent document.`
          );
          break;
        }
      }
    }
  }
  return warnings;
}

export function buildDocSummaryFromAggregate(agg: AggregateResult): string {
  const summary: Record<string, unknown> = {};

  const invoices = agg.detected.commercial_invoice.map(summarizeInvoice).filter(Boolean);
  if (invoices.length === 1) summary.commercial_invoice = invoices[0];
  else if (invoices.length > 1) summary.commercial_invoices = invoices;

  const packingLists = agg.detected.packing_list.map(summarizePackingList).filter(Boolean);
  if (packingLists.length === 1) summary.packing_list = packingLists[0];
  else if (packingLists.length > 1) summary.packing_lists = packingLists;

  const bols = agg.detected.bill_of_lading.map(summarizeBol).filter(Boolean);
  if (bols.length === 1) summary.bill_of_lading = bols[0];
  else if (bols.length > 1) summary.bills_of_lading = bols;

  const coos = agg.detected.certificate_of_origin.map(summarizeCoo).filter(Boolean);
  if (coos.length === 1) summary.certificate_of_origin = coos[0];
  else if (coos.length > 1) summary.certificates_of_origin = coos;

  const others = (agg.detected.other ?? []).map(doc => ({
    file: doc.file_name,
    detected_type: doc.extraction_result.document_type === "other"
      ? (doc.extraction_result as { detected_label?: string }).detected_label ?? "unknown"
      : doc.extraction_result.document_type,
    data: (doc.extraction_result as { data?: unknown }).data ?? null,
  }));
  if (others.length > 0) summary.other_documents = others;

  const filenameMismatches = detectFilenameMismatches(agg);
  if (filenameMismatches.length > 0) {
    summary._filename_warnings = filenameMismatches;
  }

  return JSON.stringify(summary, null, 2);
}

/**
 * Builds a compact grounding context string (≤1200 chars, ~300 tokens) from the
 * latest extraction run. Injected into Haiku's user message when extracting
 * subsequent documents so it can flag field mismatches against prior docs.
 *
 * Returns null if no prior extraction exists (first doc in the shipment).
 */
export function buildGroundingContext(
  shipmentId: string,
  db: Database.Database
): string | null {
  const manifest = buildCompactManifest(shipmentId, db);
  if (!manifest) return null;
  // Trim to keep prompt cost low
  return manifest.length > 1200 ? manifest.slice(0, 1200) + "\n...}" : manifest;
}
