import type { AggregateResult } from "./schemas/aggregate-result";
import type { ExtractedDoc } from "./schemas/extraction-result";
import type { PdfFile } from "../types";

const DOC_TYPES = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "certificate_of_origin",
] as const;
type DocType = (typeof DOC_TYPES)[number];

const ADDR = {
  name: null, contact_name: null, street: null, city: null, state: null,
  postal_code: null, country: null, country_code: null,
  email: null, phone: null, fax: null, tax_id: null, eori: null,
};
const EXPORTER = { ...ADDR, name: "Mock Exporter Co.", city: "Shanghai", country: "China", country_code: "CN" };
const IMPORTER = { ...ADDR, name: "Mock Importer Inc.", city: "Los Angeles", state: "CA", country: "United States", country_code: "US" };
const WEIGHT = { value: 50, unit: "kg" };

function makeDoc(file: PdfFile, docType: DocType): ExtractedDoc {
  const base = {
    file_id: file.id,
    file_name: file.name,
    file_size_bytes: file.sizeBytes,
    haiku_latency_ms: 0,
    haiku_input_tokens: 0,
    haiku_output_tokens: 0,
    retries: 0,
    error: null,
  };

  if (docType === "commercial_invoice") {
    return {
      ...base,
      extraction_result: {
        document_type: "commercial_invoice",
        confidence: 0.95,
        extraction_notes: ["[mock]"],
        data: {
          invoice_number: "MOCK-INV-001",
          invoice_date: "2026-05-18",
          currency: "USD",
          payment_terms: null,
          incoterms: null,
          terms_of_trade: null,
          type_of_export: null,
          reason_for_export: null,
          city_of_liability: null,
          sender: EXPORTER,
          sold_to: null,
          recipient: IMPORTER,
          carrier: null,
          waybill_number: null,
          sender_reference: null,
          recipient_reference: null,
          line_items: [{
            line_number: 1,
            quantity: 10,
            quantity_unit: "PCS",
            country_of_origin: "CN",
            description: "Mock Goods",
            hs_code: "8471.30",
            unit_weight: WEIGHT,
            unit_value: 100,
            subtotal: 1000,
          }],
          totals: {
            total_net_weight: WEIGHT,
            total_gross_weight: WEIGHT,
            total_pieces: 10,
            declared_value: 1000,
            freight_insurance: null,
            other_charges: null,
            total_invoice_amount: 1000,
          },
          signatory: null,
          general_notes: null,
        },
      },
    };
  }

  if (docType === "packing_list") {
    return {
      ...base,
      extraction_result: {
        document_type: "packing_list",
        confidence: 0.95,
        extraction_notes: ["[mock]"],
        data: {
          packing_list_number: "MOCK-PL-001",
          invoice_number: "MOCK-INV-001",
          invoice_date: "2026-05-18",
          ship_date: null,
          reference_number: null,
          customer_po_number: null,
          po_date: null,
          letter_of_credit_number: null,
          awb_bl_number: null,
          mode_of_transportation: "Sea",
          currency: "USD",
          transportation_terms: null,
          payment_terms: null,
          incoterms: null,
          shipper: EXPORTER,
          consignee: IMPORTER,
          line_items: [{
            line_range: "1",
            packages: 1,
            unit: "CARTON",
            description: "Mock Goods",
            sku: null,
            marks_and_numbers: null,
            gross_weight_lbs: null,
            gross_weight_kg: 50,
            net_weight_lbs: null,
            net_weight_kg: 45,
            quantity: 10,
            cbm: null,
          }],
          totals: {
            total_packages: 1,
            total_gross_weight: WEIGHT,
            total_net_weight: { value: 45, unit: "kg" },
            total_quantity: 10,
            total_cbm: null,
          },
        },
      },
    };
  }

  if (docType === "bill_of_lading") {
    return {
      ...base,
      extraction_result: {
        document_type: "bill_of_lading",
        confidence: 0.95,
        extraction_notes: ["[mock]"],
        data: {
          bl_number: "MOCK-BOL-001",
          bl_type: null,
          booking_number: null,
          invoice_reference: "MOCK-INV-001",
          shipper: EXPORTER,
          consignee: IMPORTER,
          notify_party: null,
          carrier: "Mock Shipping Line",
          vessel_voyage: "MV MOCK VESSEL V001",
          port_of_loading: "Shanghai",
          port_of_discharge: "Los Angeles",
          place_of_receipt: null,
          place_of_delivery: null,
          shipment_date: "2026-05-18",
          service_type: null,
          freight_payment: "Prepaid",
          place_of_issue: null,
          number_of_originals: 3,
          cargo: [{
            marks_and_numbers: null,
            number_of_packages: 1,
            package_type: "CARTON",
            description: "Mock Goods",
            hs_code: "8471.30",
            gross_weight: WEIGHT,
            measurement_cbm: null,
            freight: "Prepaid",
          }],
          special_instructions: null,
          shipper_signature: null,
          carrier_signature: null,
        },
      },
    };
  }

  // certificate_of_origin
  return {
    ...base,
    extraction_result: {
      document_type: "certificate_of_origin",
      confidence: 0.95,
      extraction_notes: ["[mock]"],
      data: {
        certificate_number: "MOCK-COO-001",
        issue_date: "2026-05-18",
        issuing_authority: "Mock Chamber of Commerce",
        certificate_type: null,
        exporter: EXPORTER,
        importer: IMPORTER,
        country_of_origin: "China",
        country_of_origin_code: "CN",
        transport: null,
        goods: [{
          item_number: 1,
          hs_code: "8471.30",
          description: "Mock Goods",
          quantity: 10,
          quantity_unit: "PCS",
          invoice_reference: "MOCK-INV-001",
        }],
        declaration_text: null,
        exporter_signatory: null,
        chamber_signatory: null,
      },
    },
  };
}

export function mockExtractPass(files: PdfFile[]): AggregateResult {
  const detected: AggregateResult["detected"] = {
    commercial_invoice: [],
    packing_list: [],
    bill_of_lading: [],
    certificate_of_origin: [],
  };

  // Always produce all 4 types regardless of file count — cycle through files
  DOC_TYPES.forEach((type, i) => {
    detected[type].push(makeDoc(files[i % files.length], type));
  });

  return {
    detected,
    missing: [],
    duplicates: [],
    garbage: [],
    low_confidence: [],
    cross_validation: [],
    errors: [],
    summary: {
      total_files: files.length,
      successfully_extracted: files.length,
      is_complete: true,
      total_haiku_cost_usd: 0,
    },
    extractedRef: "MOCK-INV-001",
  };
}

export function mockExtractFail(files: PdfFile[]): AggregateResult {
  const invoiceDocs: ExtractedDoc[] = files.map((file) => makeDoc(file, "commercial_invoice"));

  return {
    detected: {
      commercial_invoice: invoiceDocs,
      packing_list: [],
      bill_of_lading: [],
      certificate_of_origin: [],
    },
    missing: ["packing_list", "bill_of_lading", "certificate_of_origin"],
    duplicates: [],
    garbage: [],
    low_confidence: [],
    cross_validation: [
      {
        severity: "error",
        field: "document_set",
        message: "[Mock failure] Required shipping documents are missing. Upload packing list, bill of lading, and certificate of origin.",
        affected_files: invoiceDocs.map((d) => d.file_id),
        values: {},
      },
    ],
    errors: [],
    summary: {
      total_files: files.length,
      successfully_extracted: files.length,
      is_complete: false,
      total_haiku_cost_usd: 0,
    },
  };
}
