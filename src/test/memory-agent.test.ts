import { describe, expect, it } from "vitest";
import { buildShipmentMemoryFacts } from "../../lib/agents/memory-agent";
import type { ShipmentRecord } from "../../lib/shipments-store";

function shipment(overrides: Partial<ShipmentRecord> = {}): ShipmentRecord {
  const base: ShipmentRecord = {
    id: "SS-EXP-MEM",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    createdBy: "exporter",
    workflow: "exporter",
    status: "Documents Uploaded",
    importer: {
      company: "Shanghai Smart Imports Co Ltd",
      contact: "Wei Zhang",
      email: "wei@example.com",
      phone: "100",
      taxId: "CN-987654321",
    },
    exporter: {
      company: "Freight Forwarder",
      contact: "Logistics Desk",
      email: "ops@example.com",
      phone: "200",
      taxId: "US-FF-900001",
      registeredAddress: "500 Harbor Logistics Park",
      bankBeneficiaryName: "Freight Forwarder",
      bankAccountNumber: "FF-SETTLE-4401",
    },
    shipment: {
      origin: "Los Angeles",
      originPort: "Los Angeles",
      destination: "Shanghai",
      destinationPort: "Shanghai",
      carrier: "Pacific Star Lines",
      transportMode: "Sea",
      incoterm: "FOB",
      etd: "2026-06-01",
      eta: "2026-06-20",
      declaredValue: "50000",
      currency: "USD",
      bookingRef: "BL-MEM-001",
      paymentTerms: "BANK REF ABC-8842",
    },
    cargo: {
      description: "Industrial tablet computers",
      sku: "TAB-8471",
      hsCode: "8471.30",
      quantity: "100",
      grossWeight: "1200 kg",
      netWeight: "1000 kg",
      handlingUnits: "100 Cartons",
      container: "",
      seal: "",
      countryOfOrigin: "United States",
      dangerousGoods: "No",
      temperatureControlled: "No",
    },
    documents: [],
  };
  return { ...base, ...overrides };
}

function manifest() {
  return JSON.stringify({
    commercial_invoice: {
      shipper_name: "Acme Robotics LLC",
      shipper_tax_id: "US-123456789",
      recipient_name: "Shanghai Smart Imports Co Ltd",
      recipient_tax_id: "CN-987654321",
      bank_beneficiary_name: "Acme Robotics LLC",
      bank_account_number: "BANK REF ABC-8842",
    },
    bill_of_lading: {
      shipper_name: "Acme Robotics LLC",
      shipper_tax_id: "US-123456789",
      consignee_name: "Shanghai Smart Imports Co Ltd",
      consignee_tax_id: "CN-987654321",
    },
    certificate_of_origin: {
      exporter_name: "Acme Robotics LLC",
      exporter_tax_id: "US-123456789",
      importer_name: "Shanghai Smart Imports Co Ltd",
      importer_tax_id: "CN-987654321",
    },
  });
}

describe("shipment memory facts", () => {
  it("uses extracted exporter identity for MemWal profile recall when entered role is freight forwarder", () => {
    const facts = buildShipmentMemoryFacts(shipment(), manifest());

    expect(facts.exporter.company).toBe("Acme Robotics LLC");
    expect(facts.exporter.taxId).toBe("US-123456789");
    expect(facts.exporter.namespaceKey).toBe("us-123456789");
    expect(facts.importer.namespaceKey).toBe("cn-987654321");
  });
});
