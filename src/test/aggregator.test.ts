import { describe, it, expect } from "vitest";
import { aggregate } from "../agent/aggregator";
import type { ExtractedDoc } from "../agent/schemas/extraction-result";

function makeDoc(
  fileId: string,
  docType: ExtractedDoc["extraction_result"]["document_type"],
  confidence = 0.95,
  error: string | null = null
): ExtractedDoc {
  const baseResult = {
    confidence,
    extraction_notes: [] as string[],
  };

  let extraction_result: ExtractedDoc["extraction_result"];
  if (docType === "unknown") {
    extraction_result = { ...baseResult, document_type: "unknown", data: null };
  } else if (docType === "commercial_invoice") {
    extraction_result = {
      ...baseResult,
      document_type: "commercial_invoice",
      data: {
        invoice_number: "INV-001",
        invoice_date: null, currency: null, payment_terms: null, incoterms: null,
        terms_of_trade: null, type_of_export: null, reason_for_export: null,
        bank_name: null, bank_beneficiary_name: null, bank_account_number: null,
        bank_iban: null, bank_swift: null,
        city_of_liability: null, carrier: null, waybill_number: null,
        sender_reference: null, recipient_reference: null, general_notes: null,
        sender: makeAddress(), sold_to: makeAddress(), recipient: makeAddress(),
        line_items: [],
        totals: {
          total_net_weight: { value: null, unit: null },
          total_gross_weight: { value: null, unit: null },
          total_pieces: null, declared_value: null,
          freight_insurance: null, other_charges: null, total_invoice_amount: null,
        },
        signatory: { name: null, position: null, organization: null, signature_present: false, stamp_present: false },
      },
    };
  } else if (docType === "packing_list") {
    extraction_result = {
      ...baseResult,
      document_type: "packing_list",
      data: {
        packing_list_number: null, invoice_number: "INV-001", invoice_date: null,
        ship_date: null, reference_number: null, customer_po_number: null,
        po_date: null, letter_of_credit_number: null, awb_bl_number: null,
        mode_of_transportation: null, currency: null, transportation_terms: null,
        payment_terms: null, incoterms: null,
        shipper: makeAddress(), consignee: makeAddress(),
        line_items: [],
        totals: {
          total_packages: null,
          total_gross_weight: { value: null, unit: null },
          total_net_weight: { value: null, unit: null },
          total_quantity: null, total_cbm: null,
        },
      },
    };
  } else if (docType === "bill_of_lading") {
    extraction_result = {
      ...baseResult,
      document_type: "bill_of_lading",
      data: {
        bl_number: "BL-999", bl_type: null, booking_number: null, invoice_reference: null,
        carrier: null, vessel_voyage: null, port_of_loading: null, port_of_discharge: null,
        place_of_receipt: null, place_of_delivery: null, shipment_date: null,
        service_type: null, freight_payment: null, place_of_issue: null,
        number_of_originals: null, special_instructions: null, cargo: [],
        shipper: makeAddress(), consignee: makeAddress(), notify_party: makeAddress(),
        shipper_signature: { name: null, position: null, organization: null, signature_present: false, stamp_present: false },
        carrier_signature: { name: null, position: null, organization: null, signature_present: false, stamp_present: false },
      },
    };
  } else {
    extraction_result = {
      ...baseResult,
      document_type: "certificate_of_origin",
      data: {
        certificate_number: null, issue_date: null, issuing_authority: null,
        certificate_type: null, country_of_origin: null, country_of_origin_code: null,
        declaration_text: null, goods: [],
        exporter: makeAddress(), importer: makeAddress(),
        transport: { mode: null, vessel_flight: null, port_of_loading: null, port_of_discharge: null },
        exporter_signatory: { name: null, position: null, organization: null, signature_present: false, stamp_present: false },
        chamber_signatory: { name: null, position: null, organization: null, signature_present: false, stamp_present: false },
      },
    };
  }

  return {
    file_id: fileId,
    file_name: `${fileId}.pdf`,
    file_size_bytes: 1024,
    extraction_result,
    haiku_latency_ms: 100,
    haiku_input_tokens: 500,
    haiku_output_tokens: 200,
    retries: 0,
    error,
  };
}

function makeAddress() {
  return {
    name: null, contact_name: null, street: null, city: null, state: null,
    postal_code: null, country: null, country_code: null,
    email: null, phone: null, fax: null, tax_id: null, eori: null,
  };
}

describe("aggregate", () => {
  it("returns all 4 required types as missing when given empty input", () => {
    const result = aggregate([]);
    expect(result.missing).toEqual(expect.arrayContaining([
      "commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin"
    ]));
    expect(result.summary.is_complete).toBe(false);
  });

  it("detects a commercial invoice and marks others as missing", () => {
    const result = aggregate([makeDoc("inv", "commercial_invoice")]);
    expect(result.detected.commercial_invoice).toHaveLength(1);
    expect(result.missing).toContain("packing_list");
    expect(result.missing).toContain("bill_of_lading");
    expect(result.missing).not.toContain("commercial_invoice");
  });

  it("flags duplicates when same type appears twice", () => {
    const result = aggregate([
      makeDoc("inv1", "commercial_invoice"),
      makeDoc("inv2", "commercial_invoice"),
    ]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].type).toBe("commercial_invoice");
    expect(result.duplicates[0].files).toHaveLength(2);
  });

  it("marks unknown docs as garbage", () => {
    const result = aggregate([makeDoc("garbage", "unknown")]);
    expect(result.garbage).toHaveLength(1);
    expect(result.garbage[0].file.file_id).toBe("garbage");
  });

  it("puts low confidence docs in low_confidence list", () => {
    const result = aggregate([makeDoc("shaky", "commercial_invoice", 0.4)]);
    expect(result.low_confidence).toHaveLength(1);
    expect(result.low_confidence[0].file_id).toBe("shaky");
    // still detected
    expect(result.detected.commercial_invoice).toHaveLength(1);
  });

  it("is_complete true only when all 4 types present with no duplicates", () => {
    const result = aggregate([
      makeDoc("inv", "commercial_invoice"),
      makeDoc("pl", "packing_list"),
      makeDoc("bol", "bill_of_lading"),
      makeDoc("coo", "certificate_of_origin"),
    ]);
    expect(result.summary.is_complete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("extractedRef comes from invoice_number when available", () => {
    const result = aggregate([makeDoc("inv", "commercial_invoice")]);
    expect(result.extractedRef).toBe("INV-001");
  });

  it("extractedRef falls back to bl_number when no invoice", () => {
    const result = aggregate([makeDoc("bol", "bill_of_lading")]);
    expect(result.extractedRef).toBe("BL-999");
  });

  it("tracks errored docs separately", () => {
    const result = aggregate([makeDoc("bad", "unknown", 0, "Network error")]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file_id).toBe("bad");
  });
});
