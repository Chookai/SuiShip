import { describe, expect, it } from "vitest";
import {
  buildFieldComparisons,
  parseStructuredMemoryFacts,
  serializeStructuredMemoryFacts,
  type ShipmentMemoryFact,
} from "../../lib/agents/field-comparisons";
import type { RecalledMemory } from "../../lib/agents/memory-agent";
import type { ShipmentRecord } from "../../lib/shipments-store";

function shipment(overrides: Partial<ShipmentRecord> = {}): ShipmentRecord {
  const base: ShipmentRecord = {
    id: "SS-EXP-TEST",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    createdBy: "exporter",
    workflow: "exporter",
    status: "Documents Uploaded",
    importer: { company: "Beta Imports", contact: "Ivy", email: "ivy@example.com", phone: "100", taxId: "DE-987" },
    exporter: { company: "Northstar Components Inc.", contact: "Noah", email: "noah@example.com", phone: "200", taxId: "US-123456789" },
    shipment: {
      origin: "Los Angeles",
      originPort: "LAX",
      destination: "Hamburg",
      destinationPort: "HAM",
      carrier: "Maersk",
      transportMode: "Ocean",
      incoterm: "FOB",
      etd: "2026-06-01",
      eta: "2026-06-20",
      declaredValue: "50000",
      currency: "USD",
      bookingRef: "BL-MEM-002",
      paymentTerms: "WIRE-XYZ-9876",
    },
    cargo: {
      description: "Industrial servers",
      sku: "SRV-100",
      hsCode: "950300",
      quantity: "10",
      grossWeight: "1000",
      netWeight: "900",
      handlingUnits: "10",
      container: "CONT-1",
      seal: "SEAL-1",
      countryOfOrigin: "US",
      dangerousGoods: "No",
      temperatureControlled: "No",
    },
    documents: [],
  };
  return { ...base, ...overrides };
}

function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    commercial_invoice: {
      invoice_number: "INV-MEM-002",
      shipper_name: "Northstar Components Inc.",
      shipper_tax_id: "US-123456789",
      recipient_name: "Beta Imports",
      line_items: [{ hs_code: "847150", description: "Industrial servers" }],
      total_invoice_amount: 50000,
      currency: "USD",
      payment_terms: "WIRE-ABC-1234",
      bank_beneficiary_name: "Northstar Components Inc.",
      bank_account_number: "0011223344",
      shipper_address: {
        street: "100 Harbor Road",
        city: "Los Angeles",
        state: "CA",
        postal_code: "90001",
        country: "United States",
      },
    },
    bill_of_lading: {
      bl_number: "BL-MEM-002",
      shipper_name: "Northstar Components Inc.",
      consignee_name: "Beta Imports",
      port_of_loading: "Los Angeles",
      port_of_discharge: "Hamburg",
    },
    certificate_of_origin: {
      exporter_name: "Northstar Components Inc.",
      importer_name: "Beta Imports",
      country_of_origin: "US",
      goods: [{ hs_code: "847150", description: "Industrial servers" }],
    },
    ...overrides,
  });
}

function fact(field: string, value: string | number): ShipmentMemoryFact {
  return {
    exporterNamespace: "us-123456789",
    shipmentId: "SS-EXP-BASE",
    field,
    enteredValue: value,
    extractedValue: value,
    finalAcceptedValue: value,
    source: "extracted",
    confidence: 0.95,
    evidence: {
      documentName: "commercial_invoice",
      walrusBlobId: "walrus-base",
      suiTxDigest: "tx-base",
      suiPassport: "passport-base",
    },
    createdAt: "2026-05-22T00:00:00.000Z",
  };
}

describe("field comparisons", () => {
  it("flags entered-vs-extracted HS code mismatch before value resolution", () => {
    const bundle = buildFieldComparisons({
      shipment: shipment(),
      compactManifest: manifest(),
      rememberedFacts: [],
      documentFingerprints: [],
    });

    const hs = bundle.comparisons.find((item) => item.field === "cargo.hs_code" && item.findingType === "entered_vs_extracted");
    expect(hs?.enteredValue).toBe("950300");
    expect(hs?.extractedValue).toBe("847150");
    expect(hs?.severity).toBe("critical");
    expect(bundle.baselineStatus).toBe("baseline_established");
  });

  it("flags cross-shipment bank account changes against remembered identity baseline", () => {
    const bundle = buildFieldComparisons({
      shipment: shipment({ exporter: { ...shipment().exporter, bankAccountNumber: "9988776655" } }),
      compactManifest: manifest(),
      rememberedFacts: [fact("exporter.bank_account", "5544332211")],
      documentFingerprints: [],
    });

    const bank = bundle.comparisons.find((item) => item.field === "exporter.bank_account" && item.findingType === "cross_shipment_memory");
    expect(bank?.rememberedValue).toBe("5544332211");
    expect(bank?.finalValue).toBe("0011223344");
    expect(bank?.severity).toBe("critical");
    expect(bank?.explanation).toContain("Payment diversion");
  });

  it("flags duplicate BOL fingerprints from global document memory", () => {
    const bundle = buildFieldComparisons({
      shipment: shipment(),
      compactManifest: manifest(),
      rememberedFacts: [],
      documentFingerprints: [{
        namespace: "global:documents",
        text: "DOCUMENT FINGERPRINT\nshipment_id: SS-EXP-BASE\ninvoice_number: INV-MEM-001\nbol_number: BL-MEM-002\nsui_passport: passport-base\nwalrus_evidence: walrus-base",
        blobId: "memwal-blob",
      } as RecalledMemory],
    });

    const duplicate = bundle.comparisons.find((item) => item.findingType === "duplicate_document" && item.field === "shipment.bl_number");
    expect(duplicate?.severity).toBe("critical");
    expect(duplicate?.rememberedValue).toBe("BL-MEM-002");
  });

  it("does not flag declared value or HS code changes as cross-shipment memory anomalies", () => {
    const bundle = buildFieldComparisons({
      shipment: shipment({ shipment: { ...shipment().shipment, declaredValue: "90000" } }),
      compactManifest: manifest({ commercial_invoice: { total_invoice_amount: 90000 } }),
      rememberedFacts: [fact("cargo.declared_value", 50000), fact("cargo.hs_code", "090111")],
      documentFingerprints: [],
    });

    const value = bundle.comparisons.find((item) => item.field === "cargo.declared_value" && item.findingType === "cross_shipment_memory");
    const hs = bundle.comparisons.find((item) => item.field === "cargo.hs_code" && item.findingType === "cross_shipment_memory");
    expect(value).toBeUndefined();
    expect(hs).toBeUndefined();
  });

  it("flags country of origin changes for the same exporter", () => {
    const bundle = buildFieldComparisons({
      shipment: shipment(),
      compactManifest: manifest({ certificate_of_origin: { country_of_origin: "Thailand" } }),
      rememberedFacts: [fact("cargo.country_of_origin", "US")],
      documentFingerprints: [],
    });

    const origin = bundle.comparisons.find((item) => item.field === "cargo.country_of_origin" && item.findingType === "cross_shipment_memory");
    expect(origin?.severity).toBe("critical");
    expect(origin?.explanation).toContain("Origin fraud");
  });

  it("round-trips structured facts for MemWal memory records", () => {
    const facts = [fact("exporter.bank_account", "0011223344")];
    const text = serializeStructuredMemoryFacts({
      exporterNamespace: "us-123456789",
      shipmentId: "SS-EXP-BASE",
      facts,
      passportId: "passport-base",
      txDigest: "tx-base",
      walrusBlobIds: ["walrus-base"],
    });

    const parsed = parseStructuredMemoryFacts([{ namespace: "party:us-123456789", text, blobId: "memwal-blob" } as RecalledMemory]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].field).toBe("exporter.bank_account");
    expect(parsed[0].finalAcceptedValue).toBe("0011223344");
  });
});
