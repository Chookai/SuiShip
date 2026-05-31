import type { MockRole } from "@/components/role-context";
import type { CompanyProfile } from "@/components/role-context";
import type { ShipmentMemoryFacts, PartyFacts } from "@/lib/agents/memory-agent";
import type { MemoryAnomalyFinding } from "@/lib/agents/memory-agent";
import type { ShipmentMemoryFact } from "@/lib/agents/field-comparisons";
import { isMemWalConfigured, memwalRecall, memwalRememberAndWait } from "@/lib/memwal/client";
import { partyNamespace } from "@/lib/agents/memory-agent";

export const COMPANY_PROFILE_MARKER = "COMPANY_PROFILE";

export type ParsedCompanyProfile = {
  profileVersion: number;
  role?: MockRole;
  company: string;
  contact: string;
  email: string;
  phone: string;
  country: string;
  taxId: string;
  registeredAddress: string;
  bankBeneficiaryName: string;
  bankAccountNumber: string;
  blobId?: string;
  namespace?: string;
};

export function profileNamespaceKey(profile: Pick<CompanyProfile, "taxId" | "company">): string {
  const raw = profile.taxId?.trim() || profile.company.trim() || "unknown-party";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function partyNamespaceForProfile(profile: Pick<CompanyProfile, "taxId" | "company">): string {
  return partyNamespace(profileNamespaceKey(profile));
}

export function buildCompanyProfileMemoryText(
  profile: CompanyProfile,
  role: MockRole,
  profileVersion: number
): string {
  return [
    COMPANY_PROFILE_MARKER,
    `profile_version: ${profileVersion}`,
    `updated_at: ${new Date().toISOString()}`,
    `role: ${role}`,
    `status: active`,
    `company: ${profile.company}`,
    `contact: ${profile.contact}`,
    `email: ${profile.email}`,
    `phone: ${profile.phone}`,
    `country: ${profile.country}`,
    `tax_id: ${profile.taxId ?? ""}`,
    `registered_address: ${profile.registeredAddress ?? ""}`,
    `bank_beneficiary_name: ${profile.bankBeneficiaryName ?? ""}`,
    `bank_account_number: ${profile.bankAccountNumber ?? ""}`,
  ].join("\n");
}

const PROFILE_FIELD_KEYS = [
  "profile_version", "updated_at", "role", "status",
  "company", "contact", "email", "phone", "country",
  "tax_id", "registered_address", "bank_beneficiary_name", "bank_account_number",
];

function extractProfileField(text: string, field: string): string {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const otherKeys = PROFILE_FIELD_KEYS.filter((k) => k !== field).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const stopPattern = otherKeys.length > 0 ? `(?=${otherKeys.join("|")}|$)` : "";
  const regex = new RegExp(`${escaped}\\s*[:=]\\s*([\\s\\S]*?)\\s*${stopPattern}`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() ?? "";
}

export function parseCompanyProfileFromMemoryText(
  text: string,
  meta?: { blobId?: string; namespace?: string }
): ParsedCompanyProfile | null {
  if (!text.includes(COMPANY_PROFILE_MARKER)) return null;
  const profileVersion = Number(extractProfileField(text, "profile_version"));
  if (!Number.isFinite(profileVersion) || profileVersion < 1) return null;
  const roleRaw = extractProfileField(text, "role");
  const role =
    roleRaw === "Importer" || roleRaw === "Exporter" || roleRaw === "Freight Forwarder"
      ? roleRaw
      : undefined;
  return {
    profileVersion,
    role,
    company: extractProfileField(text, "company"),
    contact: extractProfileField(text, "contact"),
    email: extractProfileField(text, "email"),
    phone: extractProfileField(text, "phone"),
    country: extractProfileField(text, "country"),
    taxId: extractProfileField(text, "tax_id"),
    registeredAddress: extractProfileField(text, "registered_address"),
    bankBeneficiaryName: extractProfileField(text, "bank_beneficiary_name"),
    bankAccountNumber: extractProfileField(text, "bank_account_number"),
    blobId: meta?.blobId,
    namespace: meta?.namespace,
  };
}

export function pickLatestCompanyProfile(
  memories: Array<{ text: string; blobId?: string; namespace?: string }>
): ParsedCompanyProfile | null {
  const parsed = memories
    .map((m) => parseCompanyProfileFromMemoryText(m.text, { blobId: m.blobId, namespace: m.namespace }))
    .filter((p): p is ParsedCompanyProfile => Boolean(p?.company));
  if (!parsed.length) return null;
  return parsed.sort((a, b) => b.profileVersion - a.profileVersion)[0] ?? null;
}

export async function recallLatestCompanyProfile(
  profile: Pick<CompanyProfile, "taxId" | "company">
): Promise<ParsedCompanyProfile | null> {
  if (!isMemWalConfigured() || !profile.company.trim()) return null;
  const namespace = partyNamespaceForProfile(profile);
  const memories = await memwalRecall(
    `company profile ${profile.company} tax id registered address bank beneficiary`,
    namespace,
    16
  );
  return pickLatestCompanyProfile(memories);
}

export async function writeCompanyProfileToMemWal(
  profile: CompanyProfile,
  role: MockRole,
  profileVersion: number
): Promise<{ blobId: string; namespace: string; profileVersion: number }> {
  const namespace = partyNamespaceForProfile(profile);
  const text = buildCompanyProfileMemoryText(profile, role, profileVersion);
  const result = await memwalRememberAndWait(text, namespace);
  return { blobId: result.blobId, namespace, profileVersion };
}

export async function recallCanonicalProfilesForShipment(facts: ShipmentMemoryFacts): Promise<{
  exporter: ParsedCompanyProfile | null;
  importer: ParsedCompanyProfile | null;
}> {
  const [exporter, importer] = await Promise.all([
    recallLatestCompanyProfile({
      company: facts.exporter.company,
      taxId: facts.exporter.taxId,
    }),
    recallLatestCompanyProfile({
      company: facts.importer.company,
      taxId: facts.importer.taxId,
    }),
  ]);
  return { exporter, importer };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
}

function sameValue(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

export function buildRememberedFactsFromCanonicalProfiles(
  canonical: { exporter: ParsedCompanyProfile | null; importer: ParsedCompanyProfile | null },
  shipmentId: string
): ShipmentMemoryFact[] {
  const createdAt = new Date().toISOString();
  const facts: ShipmentMemoryFact[] = [];

  const pushParty = (
    party: ParsedCompanyProfile,
    prefix: "exporter" | "importer",
    namespaceKey: string
  ) => {
    const rows: Array<{ field: string; value: string }> = [
      { field: `${prefix}.name`, value: party.company },
      { field: `${prefix}.tax_id`, value: party.taxId },
      { field: `${prefix}.registered_address`, value: party.registeredAddress },
      { field: `${prefix}.bank_beneficiary_name`, value: party.bankBeneficiaryName },
      { field: `${prefix}.bank_account`, value: party.bankAccountNumber },
    ];
    for (const row of rows) {
      if (!row.value?.trim()) continue;
      facts.push({
        exporterNamespace: namespaceKey,
        shipmentId,
        field: row.field,
        enteredValue: null,
        extractedValue: null,
        finalAcceptedValue: row.value,
        source: "agent_resolved",
        confidence: 0.95,
        evidence: { documentType: "company_profile", documentName: `profile_v${party.profileVersion}` },
        createdAt,
      });
    }
  };

  if (canonical.exporter) {
    pushParty(canonical.exporter, "exporter", profileNamespaceKey({ taxId: canonical.exporter.taxId, company: canonical.exporter.company }));
  }
  if (canonical.importer) {
    pushParty(canonical.importer, "importer", profileNamespaceKey({ taxId: canonical.importer.taxId, company: canonical.importer.company }));
  }
  return facts;
}

export function detectProfileDrift(
  facts: ShipmentMemoryFacts,
  canonical: { exporter: ParsedCompanyProfile | null; importer: ParsedCompanyProfile | null }
): MemoryAnomalyFinding[] {
  const findings: MemoryAnomalyFinding[] = [];

  const check = (party: PartyFacts, profile: ParsedCompanyProfile | null) => {
    if (!profile) return;
    if (party.taxId && profile.taxId && !sameValue(party.taxId, profile.taxId)) {
      findings.push({
        anomalyType: "party_mismatch",
        severity: "error",
        fieldPath: `${party.role}.tax_id`,
        message: `${party.role} tax ID differs from the canonical company profile (v${profile.profileVersion}).`,
        recalledValue: profile.taxId,
        currentValue: party.taxId,
        memoryBlobId: profile.blobId,
      });
    }
    if (party.company && profile.company && !sameValue(party.company, profile.company)) {
      findings.push({
        anomalyType: "party_mismatch",
        severity: "error",
        fieldPath: `${party.role}.company`,
        message: `${party.role} company name differs from the canonical company profile (v${profile.profileVersion}).`,
        recalledValue: profile.company,
        currentValue: party.company,
        memoryBlobId: profile.blobId,
      });
    }
    const currentBank = party.bankAccountNumber ?? party.bankIban ?? party.bankSwift;
    const profileBank = profile.bankAccountNumber;
    if (currentBank && profileBank && !sameValue(currentBank, profileBank)) {
      findings.push({
        anomalyType: "bank_account_changed",
        severity: "error",
        fieldPath: `${party.role}.bank_account`,
        message: `Payment diversion: ${party.role} bank account differs from canonical company profile (v${profile.profileVersion}).`,
        recalledValue: profileBank,
        currentValue: currentBank,
        memoryBlobId: profile.blobId,
      });
    }
    if (party.address && profile.registeredAddress && !sameValue(party.address, profile.registeredAddress)) {
      findings.push({
        anomalyType: "address_changed",
        severity: "error",
        fieldPath: `${party.role}.address`,
        message: `${party.role} address differs from canonical company profile (v${profile.profileVersion}).`,
        recalledValue: profile.registeredAddress,
        currentValue: party.address,
        memoryBlobId: profile.blobId,
      });
    }
  };

  check(facts.exporter, canonical.exporter);
  check(facts.importer, canonical.importer);
  return findings;
}
