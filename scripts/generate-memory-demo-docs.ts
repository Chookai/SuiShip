import fs from "node:fs";
import path from "node:path";

type DemoDoc = {
  fileName: string;
  lines: string[];
};

const root = process.cwd();
const outputRoot = path.join(root, "test");

const baselineDir = path.join(outputRoot, "Scenario_C_memwal_baseline");
const fraudDir = path.join(outputRoot, "Scenario_D_memwal_fraud");

const baseline = {
  invoice: "INV-MEM-001",
  bol: "BL-MEM-001",
  payment: "BANK REF ABC-8842",
  hs: "8471.30",
  value: "50000",
  description: "Industrial tablet computers",
};

const fraud = {
  invoice: "INV-MEM-002",
  bol: "BL-MEM-001",
  payment: "BANK REF XYZ-9901",
  hs: "8542.31",
  value: "125000",
  description: "Integrated circuit modules",
};

function commonParties() {
  return [
    "Exporter / Shipper: Acme Robotics LLC",
    "Exporter Tax ID: US-123456789",
    "Exporter Address: 123 Harbor Way, Los Angeles, CA 90012, United States",
    "Importer / Consignee: Shanghai Smart Imports Co Ltd",
    "Importer Tax ID: CN-987654321",
    "Importer Address: 88 Pudong Avenue, Shanghai, China",
  ];
}

function docsFor(input: typeof baseline): DemoDoc[] {
  return [
    {
      fileName: "commercial_invoice.pdf",
      lines: [
        "Commercial Invoice",
        `Invoice Number: ${input.invoice}`,
        "Invoice Date: 2026-05-20",
        ...commonParties(),
        "Currency: USD",
        `Payment Terms: ${input.payment}`,
        "Incoterms: FOB",
        "Carrier: Pacific Star Lines",
        `Sender Reference / BOL Number: ${input.bol}`,
        `Line 1 Description: ${input.description}`,
        `HS Code: ${input.hs}`,
        "Country of Origin: United States",
        "Quantity: 100 PCS",
        "Unit Value: 500",
        `Subtotal: ${input.value}`,
        "Total Net Weight: 1000 kg",
        "Total Gross Weight: 1200 kg",
        "Total Pieces: 100",
        `Declared Value: ${input.value}`,
        `Total Invoice Amount: ${input.value}`,
      ],
    },
    {
      fileName: "bill_of_lading.pdf",
      lines: [
        "Bill of Lading",
        `B/L Number: ${input.bol}`,
        "B/L Type: House",
        `Invoice Reference: ${input.invoice}`,
        ...commonParties(),
        "Carrier: Pacific Star Lines",
        "Vessel Voyage: PACIFIC MERCURY V.128E",
        "Port of Loading: Los Angeles, CA",
        "Port of Discharge: Shanghai, China",
        "Place of Receipt: Los Angeles, CA",
        "Place of Delivery: Shanghai, China",
        "Shipment Date: 2026-05-21",
        "Freight Payment: Prepaid",
        `Cargo Description: ${input.description}`,
        `Cargo HS Code: ${input.hs}`,
        "Number of Packages: 100 Cartons",
        "Gross Weight: 1200 kg",
        "Measurement: 12 CBM",
      ],
    },
    {
      fileName: "packing_list.pdf",
      lines: [
        "Packing List",
        `Packing List Number: PL-${input.invoice}`,
        `Invoice Number: ${input.invoice}`,
        "Ship Date: 2026-05-21",
        ...commonParties(),
        `Goods Description: ${input.description}`,
        `HS Code: ${input.hs}`,
        "Total Packages: 100 Cartons",
        "Total Net Weight: 1000 kg",
        "Total Gross Weight: 1200 kg",
      ],
    },
    {
      fileName: "certificate_of_origin.pdf",
      lines: [
        "Certificate of Origin",
        `Certificate Number: COO-${input.invoice}`,
        "Issue Date: 2026-05-22",
        ...commonParties(),
        "Country of Origin: United States",
        `Goods Description: ${input.description}`,
        `HS Code: ${input.hs}`,
        `Invoice Reference: ${input.invoice}`,
        "Issuing Authority: Los Angeles Chamber of Commerce",
        "Stamp Present: Yes",
        "Signature Present: Yes",
      ],
    },
  ];
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makePdf(lines: string[]): Buffer {
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

function writeSet(dir: string, docs: DemoDoc[]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const doc of docs) {
    fs.writeFileSync(path.join(dir, doc.fileName), makePdf(doc.lines));
  }
}

writeSet(baselineDir, docsFor(baseline));
writeSet(fraudDir, docsFor(fraud));

console.log(`Generated baseline docs: ${baselineDir}`);
console.log(`Generated fraud docs: ${fraudDir}`);
