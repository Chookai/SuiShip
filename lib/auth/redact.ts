import type { ChatActorRole } from "./chat-policy";
import type { AccessState } from "./chat-policy";
import { getFieldDecision, type FieldClassification } from "./field-classification";

export type RedactedMarker = {
  redacted: true;
  reason: string;
  visibleTo: string[];
};

function marker(classification: FieldClassification): RedactedMarker {
  return { redacted: true, reason: classification.reason, visibleTo: classification.visibleTo };
}

/**
 * Redact sensitive fields on a party object (exporter or importer).
 * Returns a new object — does not mutate the input.
 */
export function redactParty(
  party: Record<string, unknown>,
  prefix: "exporter" | "importer",
  role: ChatActorRole
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...party };
  const sensitiveKeys = [
    "bankAccountNumber",
    "bankIban",
    "bankSwift",
    "bankBeneficiaryName",
  ];
  for (const key of sensitiveKeys) {
    const decision = getFieldDecision(`${prefix}.${key}`, role);
    if (!decision.visible) {
      out[key] = marker(decision.classification);
    }
  }
  return out;
}

/**
 * Redact sensitive fields on the shipment details object (declaredValue, paymentTerms).
 * Returns a new object — does not mutate the input.
 */
export function redactShipmentInfo(
  shipmentInfo: Record<string, unknown>,
  role: ChatActorRole
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...shipmentInfo };
  const sensitiveKeys = ["declaredValue", "paymentTerms"];
  for (const key of sensitiveKeys) {
    const decision = getFieldDecision(`shipment.${key}`, role);
    if (!decision.visible) {
      out[key] = marker(decision.classification);
    }
  }
  return out;
}

/**
 * Redact FieldComparison rows that contain sensitive field paths.
 * Redacted rows are replaced with a marker object so the model knows the comparison
 * exists but cannot see the value.
 */
export function redactFieldComparisons(comparisons: unknown[], role: ChatActorRole): unknown[] {
  return comparisons.map((c) => {
    const comparison = c as Record<string, unknown>;
    // FieldComparison uses `field` (snake_case) as the canonical path
    const fieldPath = typeof comparison.field === "string" ? comparison.field : "";
    const decision = getFieldDecision(fieldPath, role);
    if (!decision.visible) {
      return {
        field: fieldPath,
        label: comparison.label ?? fieldPath,
        redacted: true,
        reason: decision.classification.reason,
        visibleTo: decision.classification.visibleTo,
      };
    }
    return c;
  });
}

/**
 * Staged document unlock: remove document entries from the list that the role cannot yet access.
 * - owner: "Exporter" docs → FF needs canSeeExporterDocs; Importer needs canSeeExporterDocs; Exporter always
 * - owner: "Importer" docs → FF needs canSeeImporterDocs; Importer always; Exporter always
 */
export function redactDocumentList(
  docs: unknown[],
  role: ChatActorRole,
  accessState: AccessState
): unknown[] {
  return docs.filter((d) => {
    const doc = d as Record<string, unknown>;
    const owner = typeof doc.owner === "string" ? doc.owner : "";
    if (owner === "Exporter") {
      return role === "exporter" || accessState.canSeeExporterDocs;
    }
    if (owner === "Importer") {
      return role === "importer" || role === "exporter" || accessState.canSeeImporterDocs;
    }
    // Unknown owner — allow through
    return true;
  });
}

/**
 * Sensitive line key patterns in the COMPANY_PROFILE MemWal text format
 * (from lib/profile-memwal.ts buildCompanyProfileMemoryText).
 */
const SENSITIVE_PROFILE_LINE_PATTERNS: RegExp[] = [
  /^bank_account_number\s*:/i,
  /^bank_iban\s*:/i,
  /^bank_swift\s*:/i,
  /^bank_beneficiary_name\s*:/i,
  /^tax_id\s*:/i,
];

/**
 * Strip banking/identity lines from MemWal recalled text when a role is querying
 * a counterparty's party namespace.
 *
 * Only scrubs when:
 *  1. The namespace starts with 'party:' (is a party profile namespace).
 *  2. The namespace does NOT match the actor's own namespace key.
 *  3. The role is not 'exporter' (exporter has full visibility as original data owner).
 */
export function redactMemwalText(
  text: string,
  role: ChatActorRole,
  namespace: string,
  actorNamespaceKey?: string
): string {
  if (role === "exporter") return text;
  if (!namespace.startsWith("party:")) return text;

  // Own namespace — don't scrub
  const ownNamespace = actorNamespaceKey ? `party:${actorNamespaceKey}` : null;
  if (ownNamespace && namespace === ownNamespace) return text;

  return text
    .split("\n")
    .filter((line) => !SENSITIVE_PROFILE_LINE_PATTERNS.some((pat) => pat.test(line.trim())))
    .join("\n");
}
