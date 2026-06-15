import type { ExtractedDoc } from "@/src/agent/schemas/extraction-result";

export type VerifyResult = {
  passed: boolean;
  failures: string[];
};

function getField(data: unknown, ...path: string[]): unknown {
  let node = data;
  for (const key of path) {
    if (node == null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[key];
  }
  return node ?? null;
}

function isNonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

const CONFIDENCE_FLOOR = 0.4;

export function verifyDoc(doc: ExtractedDoc): VerifyResult {
  const failures: string[] = [];
  const { document_type, confidence, data } = doc.extraction_result;

  if (confidence < CONFIDENCE_FLOOR) {
    failures.push(`confidence below threshold: ${confidence.toFixed(2)} (min ${CONFIDENCE_FLOOR})`);
  }

  if (document_type === "unknown") {
    failures.push("document type unrecognised — not a standard shipping document");
    return { passed: false, failures };
  }

  if (document_type === "commercial_invoice") {
    if (!isNonEmpty(getField(data, "invoice_number")))
      failures.push("missing: invoice_number");
    if (!isNonEmpty(getField(data, "invoice_date")))
      failures.push("missing: invoice_date");
    if (!isNonEmpty(getField(data, "sender", "name")))
      failures.push("missing: sender.name");
    if (!isNonEmpty(getField(data, "recipient", "name")))
      failures.push("missing: recipient.name");
    const lineItems = getField(data, "line_items");
    if (!Array.isArray(lineItems) || lineItems.length === 0)
      failures.push("missing: line_items (at least one required)");
  }

  if (document_type === "packing_list") {
    if (!isNonEmpty(getField(data, "shipper", "name")))
      failures.push("missing: shipper.name");
    if (!isNonEmpty(getField(data, "consignee", "name")))
      failures.push("missing: consignee.name");
    if (!isNonEmpty(getField(data, "totals", "total_packages")))
      failures.push("missing: totals.total_packages");
  }

  if (document_type === "bill_of_lading") {
    if (!isNonEmpty(getField(data, "bl_number")))
      failures.push("missing: bl_number");
    if (!isNonEmpty(getField(data, "shipper", "name")))
      failures.push("missing: shipper.name");
    if (!isNonEmpty(getField(data, "consignee", "name")))
      failures.push("missing: consignee.name");
    if (!isNonEmpty(getField(data, "port_of_loading")))
      failures.push("missing: port_of_loading");
    if (!isNonEmpty(getField(data, "port_of_discharge")))
      failures.push("missing: port_of_discharge");
  }

  if (document_type === "certificate_of_origin") {
    if (!isNonEmpty(getField(data, "certificate_number")))
      failures.push("missing: certificate_number");
    if (!isNonEmpty(getField(data, "country_of_origin")))
      failures.push("missing: country_of_origin");
    if (!isNonEmpty(getField(data, "exporter", "name")))
      failures.push("missing: exporter.name");
    const goods = getField(data, "goods");
    if (!Array.isArray(goods) || goods.length === 0)
      failures.push("missing: goods (at least one entry required)");
  }

  return { passed: failures.length === 0, failures };
}
