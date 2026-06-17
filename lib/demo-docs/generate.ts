/**
 * Shared shipping-document PDF generator.
 *
 * Parameterized port of the original hardcoded templates in
 * scripts/generate-memory-demo-docs.ts. Both the CLI script and the
 * /api/documents/generate route build PDFs through buildShipmentDocs so there is
 * a single source of truth for the document format Haiku knows how to extract.
 *
 * When the optional bank fields are omitted the invoice output matches the
 * original template byte-for-byte (the CLI relies on this). When they are
 * provided, the invoice gains explicit "Bank Name / Bank Beneficiary Name /
 * Beneficiary Bank Account Number" lines so Haiku maps them to
 * `bank_account_number` (the field the deterministic payment-diversion check
 * reads), not just `payment_terms`.
 */

export type DocParty = {
  company: string;
  taxId: string;
  address: string;
};

export type ShipmentDocParams = {
  exporter: DocParty;
  importer: DocParty;
  invoice: string;
  bol: string;
  payment: string;
  hs: string;
  value: string;
  description: string;
  /** Optional explicit invoice bank lines (enables reliable bank_account_number extraction). */
  bankName?: string;
  bankBeneficiary?: string;
  bankAccount?: string;
};

export type GeneratedDoc = {
  fileName: string;
  buffer: Buffer;
};

function commonParties(p: ShipmentDocParams): string[] {
  return [
    `Exporter / Shipper: ${p.exporter.company}`,
    `Exporter Tax ID: ${p.exporter.taxId}`,
    `Exporter Address: ${p.exporter.address}`,
    `Importer / Consignee: ${p.importer.company}`,
    `Importer Tax ID: ${p.importer.taxId}`,
    `Importer Address: ${p.importer.address}`,
  ];
}

function invoiceBankLines(p: ShipmentDocParams): string[] {
  const lines: string[] = [];
  if (p.bankName) lines.push(`Bank Name: ${p.bankName}`);
  if (p.bankBeneficiary) lines.push(`Bank Beneficiary Name: ${p.bankBeneficiary}`);
  if (p.bankAccount) lines.push(`Beneficiary Bank Account Number: ${p.bankAccount}`);
  return lines;
}

function docLines(p: ShipmentDocParams): Record<string, string[]> {
  return {
    "commercial_invoice.pdf": [
      "Commercial Invoice",
      `Invoice Number: ${p.invoice}`,
      "Invoice Date: 2026-05-20",
      ...commonParties(p),
      "Currency: USD",
      `Payment Terms: ${p.payment}`,
      ...invoiceBankLines(p),
      "Incoterms: FOB",
      "Carrier: Pacific Star Lines",
      `Sender Reference / BOL Number: ${p.bol}`,
      `Line 1 Description: ${p.description}`,
      `HS Code: ${p.hs}`,
      "Country of Origin: United States",
      "Quantity: 100 PCS",
      "Unit Value: 500",
      `Subtotal: ${p.value}`,
      "Total Net Weight: 1000 kg",
      "Total Gross Weight: 1200 kg",
      "Total Pieces: 100",
      `Declared Value: ${p.value}`,
      `Total Invoice Amount: ${p.value}`,
    ],
    "bill_of_lading.pdf": [
      "Bill of Lading",
      `B/L Number: ${p.bol}`,
      "B/L Type: House",
      `Invoice Reference: ${p.invoice}`,
      ...commonParties(p),
      "Carrier: Pacific Star Lines",
      "Vessel Voyage: PACIFIC MERCURY V.128E",
      "Port of Loading: Los Angeles, CA",
      "Port of Discharge: Shanghai, China",
      "Place of Receipt: Los Angeles, CA",
      "Place of Delivery: Shanghai, China",
      "Shipment Date: 2026-05-21",
      "Freight Payment: Prepaid",
      `Cargo Description: ${p.description}`,
      `Cargo HS Code: ${p.hs}`,
      "Number of Packages: 100 Cartons",
      "Gross Weight: 1200 kg",
      "Measurement: 12 CBM",
    ],
    "packing_list.pdf": [
      "Packing List",
      `Packing List Number: PL-${p.invoice}`,
      `Invoice Number: ${p.invoice}`,
      "Ship Date: 2026-05-21",
      ...commonParties(p),
      `Goods Description: ${p.description}`,
      `HS Code: ${p.hs}`,
      "Total Packages: 100 Cartons",
      "Total Net Weight: 1000 kg",
      "Total Gross Weight: 1200 kg",
    ],
    "certificate_of_origin.pdf": [
      "Certificate of Origin",
      `Certificate Number: COO-${p.invoice}`,
      "Issue Date: 2026-05-22",
      ...commonParties(p),
      "Country of Origin: United States",
      `Goods Description: ${p.description}`,
      `HS Code: ${p.hs}`,
      `Invoice Reference: ${p.invoice}`,
      "Issuing Authority: Los Angeles Chamber of Commerce",
      "Stamp Present: Yes",
      "Signature Present: Yes",
    ],
  };
}

export function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function makePdf(lines: string[]): Buffer {
  const content = [
    "BT",
    "/F1 10 Tf",
    "13 TL",
    "50 780 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "/F1 16 Tf" : index === 1 ? "/F1 10 Tf" : null,
      `(${escapePdfText(line)}) Tj`,
      "T*",
    ].filter(Boolean) as string[]),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

/** Build the 4 canonical shipping PDFs for a shipment. */
export function buildShipmentDocs(p: ShipmentDocParams): GeneratedDoc[] {
  return Object.entries(docLines(p)).map(([fileName, lines]) => ({
    fileName,
    buffer: makePdf(lines),
  }));
}
