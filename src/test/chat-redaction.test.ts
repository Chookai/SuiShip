import { describe, expect, it } from "vitest";
import { getFieldDecision, FIELD_CLASSIFICATIONS } from "../../lib/auth/field-classification";
import {
  redactParty,
  redactShipmentInfo,
  redactFieldComparisons,
  redactDocumentList,
  redactMemwalText,
} from "../../lib/auth/redact";
import { getChatAccessLevel, type AccessState } from "../../lib/auth/chat-policy";
import type { DemoEndorsementRecord } from "../../lib/endorsement-flow";
import { actionKey } from "../../lib/endorsement-flow";

// ── Helpers ────────────────────────────────────────────────────────────────

function endorsement(role: string, action: string): DemoEndorsementRecord {
  return { role, action } as DemoEndorsementRecord;
}

const exporterParty = {
  company: "Acme Robotics LLC",
  contact: "Alice",
  email: "alice@acme.com",
  taxId: "US-123",
  bankAccountNumber: "1234567890",
  bankIban: "DE89370400440532013000",
  bankSwift: "COBADEFFXXX",
  bankBeneficiaryName: "Acme Robotics LLC",
};

const importerParty = {
  company: "Beta Imports GmbH",
  contact: "Bob",
  email: "bob@beta.de",
  taxId: "DE-456",
  bankAccountNumber: "9876543210",
  bankIban: "GB29NWBK60161331926819",
  bankSwift: "NWBKGB2L",
  bankBeneficiaryName: "Beta Imports GmbH",
};

const shipmentInfo = {
  origin: "Los Angeles",
  destination: "Hamburg",
  declaredValue: "USD 50000",
  paymentTerms: "NET 30",
  carrier: "Maersk",
};

// ── getFieldDecision ───────────────────────────────────────────────────────

describe("getFieldDecision", () => {
  it("returns visible for unmapped field", () => {
    expect(getFieldDecision("exporter.company", "freight_forwarder")).toEqual({ visible: true });
  });

  it("exporter bank fields: exporter sees them", () => {
    for (const key of ["exporter.bankAccountNumber", "exporter.bankIban", "exporter.bankSwift", "exporter.bankBeneficiaryName"]) {
      expect(getFieldDecision(key, "exporter")).toEqual({ visible: true });
    }
  });

  it("exporter bank fields: FF cannot see them", () => {
    for (const key of ["exporter.bankAccountNumber", "exporter.bankIban", "exporter.bankSwift", "exporter.bankBeneficiaryName"]) {
      const result = getFieldDecision(key, "freight_forwarder");
      expect(result.visible).toBe(false);
      if (!result.visible) expect(result.classification.reason).toBe("banking");
    }
  });

  it("exporter bank fields: importer cannot see them", () => {
    for (const key of ["exporter.bankAccountNumber", "exporter.bankIban"]) {
      expect(getFieldDecision(key, "importer").visible).toBe(false);
    }
  });

  it("importer bank fields: importer sees them, exporter does not", () => {
    expect(getFieldDecision("importer.bankAccountNumber", "importer")).toEqual({ visible: true });
    expect(getFieldDecision("importer.bankAccountNumber", "exporter").visible).toBe(false);
    expect(getFieldDecision("importer.bankAccountNumber", "freight_forwarder").visible).toBe(false);
  });

  it("commercial fields: exporter and importer see them, FF does not", () => {
    for (const key of ["shipment.declaredValue", "shipment.paymentTerms"]) {
      expect(getFieldDecision(key, "exporter")).toEqual({ visible: true });
      expect(getFieldDecision(key, "importer")).toEqual({ visible: true });
      expect(getFieldDecision(key, "freight_forwarder").visible).toBe(false);
    }
  });

  it("snake_case field comparison paths are covered", () => {
    expect(getFieldDecision("exporter.bank_account", "freight_forwarder").visible).toBe(false);
    expect(getFieldDecision("importer.bank_account", "exporter").visible).toBe(false);
    expect(getFieldDecision("cargo.declared_value", "freight_forwarder").visible).toBe(false);
    expect(getFieldDecision("shipment.payment_terms", "freight_forwarder").visible).toBe(false);
  });
});

// ── redactParty ────────────────────────────────────────────────────────────

describe("redactParty", () => {
  it("exporter sees own bank fields unchanged", () => {
    const result = redactParty({ ...exporterParty }, "exporter", "exporter");
    expect(result.bankAccountNumber).toBe("1234567890");
    expect(result.bankIban).toBe("DE89370400440532013000");
  });

  it("FF gets markers for exporter bank fields", () => {
    const result = redactParty({ ...exporterParty }, "exporter", "freight_forwarder");
    expect(result.bankAccountNumber).toMatchObject({ redacted: true, reason: "banking" });
    expect(result.bankIban).toMatchObject({ redacted: true });
    expect(result.bankSwift).toMatchObject({ redacted: true });
    expect(result.bankBeneficiaryName).toMatchObject({ redacted: true });
    // Non-sensitive fields pass through
    expect(result.company).toBe("Acme Robotics LLC");
  });

  it("importer gets markers for exporter bank fields", () => {
    const result = redactParty({ ...exporterParty }, "exporter", "importer");
    expect(result.bankAccountNumber).toMatchObject({ redacted: true });
  });

  it("importer sees own bank fields", () => {
    const result = redactParty({ ...importerParty }, "importer", "importer");
    expect(result.bankAccountNumber).toBe("9876543210");
  });

  it("exporter gets markers for importer bank fields", () => {
    const result = redactParty({ ...importerParty }, "importer", "exporter");
    expect(result.bankAccountNumber).toMatchObject({ redacted: true, reason: "banking" });
  });

  it("does not mutate the input object", () => {
    const original = { ...exporterParty };
    redactParty(original, "exporter", "freight_forwarder");
    expect(original.bankAccountNumber).toBe("1234567890");
  });
});

// ── redactShipmentInfo ─────────────────────────────────────────────────────

describe("redactShipmentInfo", () => {
  it("exporter sees declaredValue and paymentTerms", () => {
    const result = redactShipmentInfo({ ...shipmentInfo }, "exporter");
    expect(result.declaredValue).toBe("USD 50000");
    expect(result.paymentTerms).toBe("NET 30");
  });

  it("importer sees declaredValue and paymentTerms", () => {
    const result = redactShipmentInfo({ ...shipmentInfo }, "importer");
    expect(result.declaredValue).toBe("USD 50000");
    expect(result.paymentTerms).toBe("NET 30");
  });

  it("FF gets markers for declaredValue and paymentTerms", () => {
    const result = redactShipmentInfo({ ...shipmentInfo }, "freight_forwarder");
    expect(result.declaredValue).toMatchObject({ redacted: true, reason: "commercial" });
    expect(result.paymentTerms).toMatchObject({ redacted: true, reason: "commercial" });
    expect(result.carrier).toBe("Maersk");
  });
});

// ── redactFieldComparisons ─────────────────────────────────────────────────

describe("redactFieldComparisons", () => {
  const comparisons = [
    { field: "exporter.company", label: "Exporter Company", entered: "Acme", extracted: "Acme" },
    { field: "exporter.bank_account", label: "Exporter Bank Account", entered: "1234", extracted: "1234" },
    { field: "importer.bank_account", label: "Importer Bank Account", entered: "9876", extracted: "9876" },
    { field: "cargo.declared_value", label: "Declared Value", entered: "50000", extracted: "50000" },
    { field: "shipment.payment_terms", label: "Payment Terms", entered: "NET 30", extracted: "NET 30" },
  ];

  it("exporter sees own bank account but not importer's, sees commercial fields", () => {
    const result = redactFieldComparisons(comparisons, "exporter");
    expect(result[0]).toEqual(comparisons[0]); // company: pass
    expect(result[1]).toEqual(comparisons[1]); // exporter.bank_account: visible to exporter
    expect((result[2] as Record<string, unknown>).redacted).toBe(true); // importer bank: hidden
    expect(result[3]).toEqual(comparisons[3]); // declared value: visible
    expect(result[4]).toEqual(comparisons[4]); // payment terms: visible
  });

  it("FF gets markers for both bank fields and commercial fields", () => {
    const result = redactFieldComparisons(comparisons, "freight_forwarder");
    expect(result[0]).toEqual(comparisons[0]); // company: pass
    expect((result[1] as Record<string, unknown>).redacted).toBe(true); // exporter bank
    expect((result[2] as Record<string, unknown>).redacted).toBe(true); // importer bank
    expect((result[3] as Record<string, unknown>).redacted).toBe(true); // declared value
    expect((result[4] as Record<string, unknown>).redacted).toBe(true); // payment terms
  });

  it("importer sees own bank account but not exporter's", () => {
    const result = redactFieldComparisons(comparisons, "importer");
    expect((result[1] as Record<string, unknown>).redacted).toBe(true); // exporter bank: hidden
    expect(result[2]).toEqual(comparisons[2]); // importer.bank_account: visible to importer
  });

  it("redacted row preserves field and label", () => {
    const result = redactFieldComparisons(comparisons, "freight_forwarder");
    const row = result[1] as Record<string, unknown>;
    expect(row.field).toBe("exporter.bank_account");
    expect(row.label).toBe("Exporter Bank Account");
    expect(row.visibleTo).toContain("exporter");
  });
});

// ── redactDocumentList ─────────────────────────────────────────────────────

describe("redactDocumentList", () => {
  function makeAccessState(overrides: Partial<AccessState> = {}): AccessState {
    return {
      role: "freight_forwarder",
      completedSteps: new Set<string>(),
      canSeeExporterDocs: false,
      canSeeFFDocs: true,
      canSeeImporterDocs: false,
      ...overrides,
    };
  }

  const exporterDoc = { id: "d1", owner: "Exporter", name: "Invoice" };
  const importerDoc = { id: "d2", owner: "Importer", name: "Customs Form" };
  const ffDoc = { id: "d3", owner: "FreightForwarder", name: "Bill of Lading" };

  it("exporter always sees exporter docs", () => {
    const state = makeAccessState({ role: "exporter", canSeeExporterDocs: true });
    const result = redactDocumentList([exporterDoc, importerDoc], "exporter", state);
    expect(result).toContain(exporterDoc);
    expect(result).toContain(importerDoc);
  });

  it("FF before picked_up cannot see exporter docs", () => {
    const state = makeAccessState({ canSeeExporterDocs: false });
    const result = redactDocumentList([exporterDoc, ffDoc], "freight_forwarder", state);
    expect(result).not.toContain(exporterDoc);
    expect(result).toContain(ffDoc);
  });

  it("FF after picked_up can see exporter docs", () => {
    const state = makeAccessState({ canSeeExporterDocs: true });
    const result = redactDocumentList([exporterDoc, ffDoc], "freight_forwarder", state);
    expect(result).toContain(exporterDoc);
  });

  it("FF before reviewed cannot see importer docs", () => {
    const state = makeAccessState({ canSeeImporterDocs: false });
    const result = redactDocumentList([importerDoc], "freight_forwarder", state);
    expect(result).not.toContain(importerDoc);
  });

  it("importer always sees importer docs", () => {
    const state = makeAccessState({ role: "importer", canSeeImporterDocs: true, canSeeExporterDocs: false });
    const result = redactDocumentList([importerDoc, exporterDoc], "importer", state);
    expect(result).toContain(importerDoc);
    expect(result).not.toContain(exporterDoc);
  });

  it("importer after cleared_customs can see exporter docs", () => {
    const state = makeAccessState({ role: "importer", canSeeExporterDocs: true, canSeeImporterDocs: true });
    const result = redactDocumentList([exporterDoc], "importer", state);
    expect(result).toContain(exporterDoc);
  });
});

// ── redactMemwalText ───────────────────────────────────────────────────────

describe("redactMemwalText", () => {
  const profileText = [
    "company: Beta Imports GmbH",
    "tax_id: DE-456",
    "bank_account_number: 9876543210",
    "bank_iban: GB29NWBK60161331926819",
    "bank_swift: NWBKGB2L",
    "bank_beneficiary_name: Beta Imports GmbH",
    "risk_score: low",
  ].join("\n");

  it("exporter always sees full text", () => {
    const result = redactMemwalText(profileText, "exporter", "party:beta-imports-gmbh");
    expect(result).toContain("bank_account_number");
    expect(result).toContain("tax_id");
  });

  it("FF querying counterparty namespace has sensitive lines stripped", () => {
    const result = redactMemwalText(profileText, "freight_forwarder", "party:beta-imports-gmbh");
    expect(result).not.toContain("bank_account_number");
    expect(result).not.toContain("bank_iban");
    expect(result).not.toContain("bank_swift");
    expect(result).not.toContain("bank_beneficiary_name");
    expect(result).not.toContain("tax_id");
    expect(result).toContain("company: Beta Imports GmbH");
    expect(result).toContain("risk_score: low");
  });

  it("FF querying own namespace does not strip lines", () => {
    const ownKey = "my-forwarder-co";
    const result = redactMemwalText(profileText, "freight_forwarder", `party:${ownKey}`, ownKey);
    expect(result).toContain("bank_account_number");
  });

  it("non-party namespace is not scrubbed", () => {
    const result = redactMemwalText(profileText, "freight_forwarder", "global:documents");
    expect(result).toContain("bank_account_number");
  });
});

// ── getChatAccessLevel with accessState ────────────────────────────────────

describe("getChatAccessLevel + accessState", () => {
  it("exporter always gets full access with canSeeExporterDocs=true", () => {
    const result = getChatAccessLevel("exporter", []);
    expect(result.level).toBe("full");
    expect(result.accessState?.canSeeExporterDocs).toBe(true);
    expect(result.accessState?.canSeeFFDocs).toBe(true);
    expect(result.accessState?.canSeeImporterDocs).toBe(true);
  });

  it("FF before picked_up is locked", () => {
    const result = getChatAccessLevel("freight_forwarder", []);
    expect(result.level).toBe("locked");
    expect(result.accessState).toBeUndefined();
  });

  it("FF after picked_up is full; canSeeExporterDocs=true, canSeeImporterDocs=false", () => {
    const endorsements = [endorsement("freight_forwarder", "picked_up")];
    const result = getChatAccessLevel("freight_forwarder", endorsements, { company: "FastShip Co" });
    expect(result.level).toBe("full");
    expect(result.accessState?.canSeeExporterDocs).toBe(true);
    expect(result.accessState?.canSeeImporterDocs).toBe(false);
    expect(result.accessState?.actorCompany).toBe("FastShip Co");
  });

  it("FF after reviewed has canSeeImporterDocs=true", () => {
    const endorsements = [
      endorsement("freight_forwarder", "picked_up"),
      endorsement("freight_forwarder", "handed_off"),
      endorsement("freight_forwarder", "reviewed"),
    ];
    const result = getChatAccessLevel("freight_forwarder", endorsements);
    expect(result.accessState?.canSeeImporterDocs).toBe(true);
  });

  it("importer before cleared_customs is locked", () => {
    const endorsements = [endorsement("freight_forwarder", "picked_up")];
    const result = getChatAccessLevel("importer", endorsements);
    expect(result.level).toBe("locked");
  });

  it("importer after cleared_customs is full; canSeeExporterDocs=true", () => {
    const endorsements = [
      endorsement("freight_forwarder", "picked_up"),
      endorsement("freight_forwarder", "handed_off"),
      endorsement("freight_forwarder", "reviewed"),
      endorsement("freight_forwarder", "cleared_customs"),
    ];
    const result = getChatAccessLevel("importer", endorsements);
    expect(result.level).toBe("full");
    expect(result.accessState?.canSeeExporterDocs).toBe(true);
    expect(result.accessState?.canSeeImporterDocs).toBe(true);
  });

  it("unknown role is locked", () => {
    const result = getChatAccessLevel(null, []);
    expect(result.level).toBe("locked");
  });
});
