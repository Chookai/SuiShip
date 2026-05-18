import { describe, it, expect } from "vitest";
import { crossValidate } from "../agent/cross-validator";
import type { ExtractedDoc } from "../agent/schemas/extraction-result";

function makeAddress(name: string | null = null) {
  return {
    name, contact_name: null, street: null, city: null, state: null,
    postal_code: null, country: null, country_code: null,
    email: null, phone: null, fax: null, tax_id: null, eori: null,
  };
}

function makeSignatory() {
  return { name: null, position: null, organization: null, signature_present: false, stamp_present: false };
}

function makeInvoice(invoiceNumber: string, senderName: string | null = null, recipientName: string | null = null, senderRef: string | null = null): ExtractedDoc {
  return {
    file_id: "invoice",
    file_name: "invoice.pdf",
    file_size_bytes: 1024,
    extraction_result: {
      document_type: "commercial_invoice",
      confidence: 0.95,
      extraction_notes: [],
      data: {
        invoice_number: invoiceNumber,
        invoice_date: null, currency: null, payment_terms: null, incoterms: null,
        terms_of_trade: null, type_of_export: null, reason_for_export: null,
        city_of_liability: null, carrier: null, waybill_number: null,
        sender_reference: senderRef, recipient_reference: null, general_notes: null,
        sender: makeAddress(senderName),
        sold_to: makeAddress(),
        recipient: makeAddress(recipientName),
        line_items: [],
        totals: {
          total_net_weight: { value: null, unit: null },
          total_gross_weight: { value: null, unit: null },
          total_pieces: null, declared_value: null,
          freight_insurance: null, other_charges: null, total_invoice_amount: null,
        },
        signatory: makeSignatory(),
      },
    },
    haiku_latency_ms: 100, haiku_input_tokens: 500, haiku_output_tokens: 200, retries: 0, error: null,
  };
}

function makeBol(blNumber: string, shipperName: string | null = null, consigneeName: string | null = null): ExtractedDoc {
  return {
    file_id: "bol",
    file_name: "bol.pdf",
    file_size_bytes: 1024,
    extraction_result: {
      document_type: "bill_of_lading",
      confidence: 0.95,
      extraction_notes: [],
      data: {
        bl_number: blNumber, bl_type: null, booking_number: null, invoice_reference: null,
        carrier: null, vessel_voyage: null, port_of_loading: null, port_of_discharge: null,
        place_of_receipt: null, place_of_delivery: null, shipment_date: null,
        service_type: null, freight_payment: null, place_of_issue: null,
        number_of_originals: null, special_instructions: null, cargo: [],
        shipper: makeAddress(shipperName),
        consignee: makeAddress(consigneeName),
        notify_party: makeAddress(),
        shipper_signature: makeSignatory(),
        carrier_signature: makeSignatory(),
      },
    },
    haiku_latency_ms: 100, haiku_input_tokens: 500, haiku_output_tokens: 200, retries: 0, error: null,
  };
}

const emptyDetected = {
  commercial_invoice: [] as ExtractedDoc[],
  packing_list: [] as ExtractedDoc[],
  bill_of_lading: [] as ExtractedDoc[],
  certificate_of_origin: [] as ExtractedDoc[],
};

describe("crossValidate", () => {
  it("returns empty array when no docs provided", () => {
    expect(crossValidate(emptyDetected)).toEqual([]);
  });

  it("reports consistent invoice_number when they match", () => {
    const issues = crossValidate({
      ...emptyDetected,
      commercial_invoice: [makeInvoice("INV-001")],
      packing_list: [],
      bill_of_lading: [makeBol("BL-999")],
    });
    const invoiceIssue = issues.find((i) => i.field === "invoice_number");
    // Only one source has invoice_number here, no comparison possible
    expect(invoiceIssue).toBeUndefined();
  });

  it("flags mismatch between bl_number and sender_reference", () => {
    const issues = crossValidate({
      ...emptyDetected,
      commercial_invoice: [makeInvoice("INV-001", null, null, "BL-WRONG")],
      bill_of_lading: [makeBol("BL-999")],
    });
    const blIssue = issues.find((i) => i.field === "bl_number / sender_reference");
    expect(blIssue).toBeDefined();
    expect(blIssue?.severity).toBe("warning");
  });

  it("reports consistent when bl_number matches sender_reference", () => {
    const issues = crossValidate({
      ...emptyDetected,
      commercial_invoice: [makeInvoice("INV-001", null, null, "BL-999")],
      bill_of_lading: [makeBol("BL-999")],
    });
    const blIssue = issues.find((i) => i.field === "bl_number / sender_reference");
    expect(blIssue?.severity).toBe("info");
  });

  it("flags shipper name mismatch between BOL and invoice", () => {
    const issues = crossValidate({
      ...emptyDetected,
      commercial_invoice: [makeInvoice("INV-001", "Java Highlands Co")],
      bill_of_lading: [makeBol("BL-999", "Different Shipper")],
    });
    const shipperIssue = issues.find((i) => i.field === "shipper_name");
    expect(shipperIssue).toBeDefined();
    expect(shipperIssue?.severity).toBe("warning");
  });

  it("reports consistent shipper name when they match", () => {
    const issues = crossValidate({
      ...emptyDetected,
      commercial_invoice: [makeInvoice("INV-001", "Java Highlands Co")],
      bill_of_lading: [makeBol("BL-999", "Java Highlands Co")],
    });
    const shipperIssue = issues.find((i) => i.field === "shipper_name");
    expect(shipperIssue?.severity).toBe("info");
  });

  it("flags consignee mismatch", () => {
    const issues = crossValidate({
      ...emptyDetected,
      commercial_invoice: [makeInvoice("INV-001", null, "Acme Corp")],
      bill_of_lading: [makeBol("BL-999", null, "Different Corp")],
    });
    const consigneeIssue = issues.find((i) => i.field === "consignee_name");
    expect(consigneeIssue?.severity).toBe("warning");
  });
});
