import type { ChatActorRole } from "./chat-policy";

export type FieldClassification = {
  visibleTo: ChatActorRole[];
  reason: "banking" | "commercial" | "identity";
};

/**
 * Sensitive fields that are NOT visible to all roles.
 * Any field path NOT in this map is visible to all roles (safe default: over-share, not under-share).
 * When adding new fields to ShipmentRecord, add a classification entry here if the field is sensitive.
 *
 * Two path conventions are covered:
 *   - camelCase  — used in shipment JSON objects (exporter.bankAccountNumber)
 *   - snake_case — used in FIELD_POLICIES / FieldComparison.field (exporter.bank_account)
 */
export const FIELD_CLASSIFICATIONS: Record<string, FieldClassification> = {
  // Exporter bank details — only the exporter sees these
  "exporter.bankAccountNumber": { visibleTo: ["exporter"], reason: "banking" },
  "exporter.bankIban": { visibleTo: ["exporter"], reason: "banking" },
  "exporter.bankSwift": { visibleTo: ["exporter"], reason: "banking" },
  "exporter.bankBeneficiaryName": { visibleTo: ["exporter"], reason: "banking" },

  // Importer bank details — only the importer sees these
  "importer.bankAccountNumber": { visibleTo: ["importer"], reason: "banking" },
  "importer.bankIban": { visibleTo: ["importer"], reason: "banking" },
  "importer.bankSwift": { visibleTo: ["importer"], reason: "banking" },
  "importer.bankBeneficiaryName": { visibleTo: ["importer"], reason: "banking" },

  // Commercial terms — not visible to FF
  "shipment.declaredValue": { visibleTo: ["exporter", "importer"], reason: "commercial" },
  "shipment.paymentTerms": { visibleTo: ["exporter", "importer"], reason: "commercial" },

  // FieldComparison snake_case paths (from FIELD_POLICIES in field-comparisons.ts)
  "exporter.bank_account": { visibleTo: ["exporter"], reason: "banking" },
  "importer.bank_account": { visibleTo: ["importer"], reason: "banking" },
  "cargo.declared_value": { visibleTo: ["exporter", "importer"], reason: "commercial" },
  "shipment.payment_terms": { visibleTo: ["exporter", "importer"], reason: "commercial" },
};

export type FieldDecisionVisible = { visible: true };
export type FieldDecisionHidden = { visible: false; classification: FieldClassification };
export type FieldDecision = FieldDecisionVisible | FieldDecisionHidden;

export function getFieldDecision(fieldPath: string, role: ChatActorRole): FieldDecision {
  const classification = FIELD_CLASSIFICATIONS[fieldPath];
  if (!classification) return { visible: true };
  if (classification.visibleTo.includes(role)) return { visible: true };
  return { visible: false, classification };
}
