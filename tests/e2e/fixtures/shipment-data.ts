import path from "node:path";

/** Unique shipment ID per run so repeated runs don't collide in the DB. */
export const SHIPMENT_ID = `E2E-${Date.now()}`;

/** Static party + cargo data matching Scenario C (Acme Robotics → Shanghai Smart Imports). */
export const DEMO_SHIPMENT = {
  id: SHIPMENT_ID,
  workflow: "exporter" as const,
  exporter: {
    company: "Acme Robotics LLC",
    contact: "Jane Smith",
    email: "j.smith@acmerobotics.com",
    phone: "+1-415-555-0101",
  },
  importer: {
    company: "Shanghai Smart Imports Co Ltd",
    contact: "Wei Zhang",
    email: "wei.zhang@shanghaismartimports.cn",
    phone: "+86-21-555-0100",
  },
  shipment: {
    referenceNo: SHIPMENT_ID,
    mode: "sea",
    incoterm: "FOB",
    originCountry: "US",
    originPort: "Los Angeles",
    destinationCountry: "CN",
    destinationPort: "Shanghai",
    carrier: "COSCO",
    declaredValue: "125000",
    currency: "USD",
    paymentTerms: "Letter of Credit",
  },
  cargo: {
    description: "Industrial tablet computers",
    skuPart: "ACM-TAB-500",
    hsCode: "8471.30",
    quantity: "500",
    grossWeight: "750 kg",
    netWeight: "700 kg",
    cartons: "50",
    countryOfOrigin: "US",
  },
};

const BASE = path.join(process.cwd(), "test", "Scenario_C_memwal_baseline");

/** Absolute paths to the 4 test PDF documents. */
export const PDF_FIXTURES = {
  commercialInvoice: path.join(BASE, "commercial_invoice.pdf"),
  packingList: path.join(BASE, "packing_list.pdf"),
  billOfLading: path.join(BASE, "bill_of_lading.pdf"),
  certificateOfOrigin: path.join(BASE, "certificate_of_origin.pdf"),
};
