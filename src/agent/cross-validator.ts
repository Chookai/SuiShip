import type { ExtractedDoc } from "./schemas/extraction-result";
import type { ValidationIssue } from "./schemas/aggregate-result";

type DetectedDocs = {
  commercial_invoice: ExtractedDoc[];
  packing_list: ExtractedDoc[];
  bill_of_lading: ExtractedDoc[];
  certificate_of_origin: ExtractedDoc[];
};

function getField(doc: ExtractedDoc, ...path: string[]): unknown {
  let node: unknown = doc.extraction_result.data;
  for (const key of path) {
    if (node == null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[key];
  }
  return node ?? null;
}

function normalise(v: unknown): string | null {
  if (v == null) return null;
  return String(v).trim().toLowerCase();
}

function buildIssue(
  field: string,
  values: Array<{ fileId: string; value: unknown }>,
  severity: ValidationIssue["severity"]
): ValidationIssue {
  const nonNull = values.filter((v) => v.value != null);
  const unique = new Set(nonNull.map((v) => normalise(v.value)));
  const consistent = unique.size <= 1;
  return {
    severity: consistent ? "info" : severity,
    field,
    message: consistent
      ? `${field} is consistent across all documents`
      : `${field} mismatch across documents`,
    affected_files: nonNull.map((v) => v.fileId),
    values: Object.fromEntries(nonNull.map((v) => [v.fileId, v.value])),
  };
}

export function crossValidate(detected: DetectedDocs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const invoice = detected.commercial_invoice[0];
  const pl = detected.packing_list[0];
  const bol = detected.bill_of_lading[0];
  const coo = detected.certificate_of_origin[0];

  // 1. invoice_number across docs that carry it — only include non-null values
  const invoiceNumberValues: Array<{ fileId: string; value: unknown }> = [];
  const pushIfNonNull = (fileId: string, value: unknown) => {
    if (value != null) invoiceNumberValues.push({ fileId, value });
  };
  if (invoice) pushIfNonNull(invoice.file_id, getField(invoice, "invoice_number"));
  if (pl) pushIfNonNull(pl.file_id, getField(pl, "invoice_number"));
  if (coo) {
    const cooGoods = getField(coo, "goods") as Array<{ invoice_reference: unknown }> | null;
    pushIfNonNull(coo.file_id, cooGoods?.[0]?.invoice_reference ?? null);
  }
  if (bol) pushIfNonNull(bol.file_id, getField(bol, "invoice_reference"));
  if (invoiceNumberValues.length >= 2) {
    issues.push(buildIssue("invoice_number", invoiceNumberValues, "warning"));
  }

  // 2. bl_number (BOL) vs sender_reference (invoice)
  if (bol && invoice) {
    const blNum = getField(bol, "bl_number");
    const senderRef = getField(invoice, "sender_reference");
    if (blNum && senderRef) {
      issues.push(buildIssue("bl_number / sender_reference", [
        { fileId: bol.file_id, value: blNum },
        { fileId: invoice.file_id, value: senderRef },
      ], "warning"));
    }
  }

  // 3. shipper.name (BOL) vs sender.name (invoice)
  if (bol && invoice) {
    const bolShipper = getField(bol, "shipper", "name");
    const invSender = getField(invoice, "sender", "name");
    if (bolShipper || invSender) {
      issues.push(buildIssue("shipper_name", [
        { fileId: bol.file_id, value: bolShipper },
        { fileId: invoice.file_id, value: invSender },
      ], "warning"));
    }
  }

  // 4. consignee.name (BOL) vs recipient.name (invoice)
  if (bol && invoice) {
    const bolConsignee = getField(bol, "consignee", "name");
    const invRecipient = getField(invoice, "recipient", "name");
    if (bolConsignee || invRecipient) {
      issues.push(buildIssue("consignee_name", [
        { fileId: bol.file_id, value: bolConsignee },
        { fileId: invoice.file_id, value: invRecipient },
      ], "warning"));
    }
  }

  return issues;
}
