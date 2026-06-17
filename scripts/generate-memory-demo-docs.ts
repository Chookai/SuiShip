import fs from "node:fs";
import path from "node:path";
import { buildShipmentDocs, type ShipmentDocParams } from "../lib/demo-docs/generate";

const root = process.cwd();
const outputRoot = path.join(root, "test");

const baselineDir = path.join(outputRoot, "Scenario_C_memwal_baseline");
const fraudDir = path.join(outputRoot, "Scenario_D_memwal_fraud");

const parties = {
  exporter: {
    company: "Acme Robotics LLC",
    taxId: "US-123456789",
    address: "123 Harbor Way, Los Angeles, CA 90012, United States",
  },
  importer: {
    company: "Shanghai Smart Imports Co Ltd",
    taxId: "CN-987654321",
    address: "88 Pudong Avenue, Shanghai, China",
  },
};

const baseline: ShipmentDocParams = {
  ...parties,
  invoice: "INV-MEM-001",
  bol: "BL-MEM-001",
  payment: "BANK REF ABC-8842",
  hs: "8471.30",
  value: "50000",
  description: "Industrial tablet computers",
};

const fraud: ShipmentDocParams = {
  ...parties,
  invoice: "INV-MEM-002",
  bol: "BL-MEM-001",
  payment: "BANK REF XYZ-9901",
  hs: "8542.31",
  value: "125000",
  description: "Integrated circuit modules",
};

function writeSet(dir: string, params: ShipmentDocParams) {
  fs.mkdirSync(dir, { recursive: true });
  for (const doc of buildShipmentDocs(params)) {
    fs.writeFileSync(path.join(dir, doc.fileName), doc.buffer);
  }
}

writeSet(baselineDir, baseline);
writeSet(fraudDir, fraud);

console.log(`Generated baseline docs: ${baselineDir}`);
console.log(`Generated fraud docs: ${fraudDir}`);
