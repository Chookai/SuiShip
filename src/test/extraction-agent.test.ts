import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtractedDoc } from "../agent/schemas/extraction-result";

// Mock pino before imports that use it
vi.mock("pino", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: () => logger };
});

// Mock p-limit to pass through (no actual concurrency limiting in tests)
vi.mock("p-limit", () => ({
  default: () => (fn: () => unknown) => fn(),
}));

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    static APIError = class extends Error {
      status: number;
      constructor(status: number, msg: string) { super(msg); this.status = status; }
    };
  },
}));

function makeValidInvoiceResponse(invoiceNumber = "INV-TEST-001") {
  const data = {
    invoice_number: invoiceNumber,
    invoice_date: null, currency: null, payment_terms: null, incoterms: null,
    terms_of_trade: null, type_of_export: null, reason_for_export: null,
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
  };
  return JSON.stringify({
    document_type: "commercial_invoice",
    confidence: 0.95,
    extraction_notes: [],
    data,
  });
}

function makeBolResponse(blNumber = "BL-TEST-999") {
  const data = {
    bl_number: blNumber, bl_type: null, booking_number: null, invoice_reference: null,
    carrier: null, vessel_voyage: null, port_of_loading: null, port_of_discharge: null,
    place_of_receipt: null, place_of_delivery: null, shipment_date: null,
    service_type: null, freight_payment: null, place_of_issue: null,
    number_of_originals: null, special_instructions: null, cargo: [],
    shipper: makeAddress(), consignee: makeAddress(), notify_party: makeAddress(),
    shipper_signature: makeSignatory(), carrier_signature: makeSignatory(),
  };
  return JSON.stringify({
    document_type: "bill_of_lading",
    confidence: 0.95,
    extraction_notes: [],
    data,
  });
}

function makeAddress() {
  return { name: null, contact_name: null, street: null, city: null, state: null, postal_code: null, country: null, country_code: null, email: null, phone: null, fax: null, tax_id: null, eori: null };
}
function makeSignatory() {
  return { name: null, position: null, organization: null, signature_present: false, stamp_present: false };
}

function makeSuccessResponse(text: string) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 500, output_tokens: 300 },
  };
}

import type { PdfFile } from "../types";

function makePdfFile(id: string): PdfFile {
  return { id, name: `${id}.pdf`, buffer: Buffer.from("fake-pdf"), sizeBytes: 8 };
}

describe("extract", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("calls haiku once per file", async () => {
    mockCreate.mockResolvedValue(makeSuccessResponse(makeValidInvoiceResponse()));
    const { extract } = await import("../agent/extraction-agent");
    await extract([makePdfFile("a"), makePdfFile("b")]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("returns empty aggregate when given no files", async () => {
    const { extract } = await import("../agent/extraction-agent");
    const result = await extract([]);
    expect(result.summary.total_files).toBe(0);
    expect(result.missing).toHaveLength(4);
  });

  it("sets extractedRef from invoice_number", async () => {
    mockCreate.mockResolvedValue(makeSuccessResponse(makeValidInvoiceResponse("INV-FROMTEST")));
    const { extract } = await import("../agent/extraction-agent");
    const result = await extract([makePdfFile("inv")]);
    expect(result.extractedRef).toBe("INV-FROMTEST");
  });

  it("falls back to bl_number when no invoice", async () => {
    mockCreate.mockResolvedValue(makeSuccessResponse(makeBolResponse("BL-FROMTEST")));
    const { extract } = await import("../agent/extraction-agent");
    const result = await extract([makePdfFile("bol")]);
    expect(result.extractedRef).toBe("BL-FROMTEST");
  });

  it("retries once on JSON parse error and succeeds", async () => {
    mockCreate
      .mockResolvedValueOnce(makeSuccessResponse("not valid json"))
      .mockResolvedValueOnce(makeSuccessResponse(makeValidInvoiceResponse()));
    const { extract } = await import("../agent/extraction-agent");
    const result = await extract([makePdfFile("inv")]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.detected.commercial_invoice).toHaveLength(1);
  });
});
