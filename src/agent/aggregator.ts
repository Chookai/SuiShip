import type { ExtractedDoc } from "./schemas/extraction-result";
import type { AggregateResult, ValidationIssue } from "./schemas/aggregate-result";
import type { DocumentType } from "./schemas/base";

const REQUIRED_TYPES: DocumentType[] = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "certificate_of_origin",
];

const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function aggregate(
  docs: ExtractedDoc[],
  crossValidation: ValidationIssue[] = []
): AggregateResult {
  const detected: AggregateResult["detected"] = {
    commercial_invoice: [],
    packing_list: [],
    bill_of_lading: [],
    certificate_of_origin: [],
  };
  const garbage: AggregateResult["garbage"] = [];
  const errors: ExtractedDoc[] = [];
  const low_confidence: ExtractedDoc[] = [];

  for (const doc of docs) {
    if (doc.error) {
      errors.push(doc);
      continue;
    }

    const { document_type, confidence } = doc.extraction_result;

    if (document_type === "unknown") {
      garbage.push({
        file: doc,
        reason: doc.extraction_result.extraction_notes[0] ?? "Not a recognised shipping document",
      });
      continue;
    }

    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      low_confidence.push(doc);
    }

    // document_type is now narrowed to the 4 known types (unknown handled above)
    const knownType = document_type as keyof typeof detected;
    detected[knownType].push(doc);
  }

  // Missing = required types with no detected docs
  const missing: DocumentType[] = REQUIRED_TYPES.filter(
    (type) => detected[type as keyof typeof detected].length === 0
  );

  // Duplicates = required types detected more than once
  const duplicates: AggregateResult["duplicates"] = REQUIRED_TYPES.filter(
    (type) => detected[type as keyof typeof detected].length > 1
  ).map((type) => ({ type, files: detected[type as keyof typeof detected] }));

  const successfullyExtracted = docs.filter((d) => !d.error).length;
  const is_complete = missing.length === 0 && duplicates.length === 0;

  // Derive extractedRef: invoice_number from first invoice, fallback to bl_number from first BOL
  const firstInvoice = detected.commercial_invoice[0];
  const firstBol = detected.bill_of_lading[0];
  let extractedRef: string | undefined;
  if (firstInvoice?.extraction_result.document_type === "commercial_invoice") {
    const ref = firstInvoice.extraction_result.data.invoice_number;
    if (ref) extractedRef = ref;
  }
  if (!extractedRef && firstBol?.extraction_result.document_type === "bill_of_lading") {
    const ref = firstBol.extraction_result.data.bl_number;
    if (ref) extractedRef = ref;
  }

  return {
    detected,
    missing,
    duplicates,
    garbage,
    low_confidence,
    cross_validation: crossValidation,
    errors,
    summary: {
      total_files: docs.length,
      successfully_extracted: successfullyExtracted,
      is_complete,
      total_haiku_cost_usd: null,
    },
    extractedRef,
  };
}
