/**
 * seed-demo.ts — Full demo pre-seed script for the cross-shipment memory recall demo.
 *
 * Pre-requisites:
 *   - Next.js dev server running at BASE_URL (default: http://localhost:3000)
 *   - MEMWAL_ED25519_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_SERVER_URL set in .env.local
 *   - SUI_CLIENT=real or SUI_CLIENT=mock in .env.local
 *   - Scenario C PDFs present in test/Scenario_C_memwal_baseline/
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts
 *
 * What it does:
 *   1. Creates Shipment 1 (baseline) via API
 *   2. Uploads + extracts Scenario C documents
 *   3. Runs validation (writes preliminary party memory to MemWal)
 *   4. Mints Sui passport (uploads Walrus evidence + writes full memory)
 *   5. Polls until memwal_sync_status === 'synced' (or falls back to validate-time memory)
 *   6. Prints a link to open Shipment 1 and start the demo
 *
 * Demo resilience:
 *   - If Walrus/Sui testnet lags, validation-time memory write (step 3) still enables recall.
 *   - If MemWal times out, the anomaly comparison still flags changes deterministically.
 */

import fs from "node:fs";
import path from "node:path";
import FormData from "form-data";
import fetch, { type Response as NodeFetchResponse } from "node-fetch";

const BASE_URL = process.env.SEED_BASE_URL ?? "http://localhost:3000";
const SCENARIO_C_DIR = path.join(process.cwd(), "test", "Scenario_C_memwal_baseline");

async function expectOk(response: NodeFetchResponse, label: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed: HTTP ${response.status}\n${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`\nSuiShip Demo Seed Script`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Scenario C docs: ${SCENARIO_C_DIR}\n`);

  // Verify scenario C docs exist
  const docFiles = ["commercial_invoice.pdf", "bill_of_lading.pdf", "packing_list.pdf", "certificate_of_origin.pdf"];
  for (const f of docFiles) {
    const fp = path.join(SCENARIO_C_DIR, f);
    if (!fs.existsSync(fp)) {
      console.error(`Missing: ${fp}`);
      console.error(`Run: npx tsx scripts/generate-memory-demo-docs.ts`);
      process.exit(1);
    }
  }
  console.log("✓ Scenario C documents found");

  // Step 1: Create Shipment 1
  const shipmentId = `SS-DEMO-SEED-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  const shipmentPayload = {
    id: shipmentId,
    createdAt: now,
    updatedAt: now,
    createdBy: "exporter",
    workflow: "exporter",
    status: "In Progress",
    importer: {
      company: "Shanghai Smart Imports Co Ltd",
      contact: "Wei Zhang",
      email: "wei.zhang@shanghaismartimports.cn",
      phone: "+86-21-555-0100",
      taxId: "CN-987654321",
    },
    exporter: {
      company: "Acme Robotics LLC",
      contact: "Sarah Chen",
      email: "sarah.chen@acmerobotics.com",
      phone: "+1-310-555-0200",
      taxId: "US-123456789",
      registeredAddress: "123 Harbor Way, Los Angeles, CA 90012, United States",
      bankBeneficiaryName: "Acme Robotics LLC",
      bankAccountNumber: "BANK REF ABC-8842",
      bankIban: "US12 3456 7890 1234 5678 9012",
      bankSwift: "ACMEUS33",
    },
    shipment: {
      shipmentId,
      origin: "United States",
      originPort: "LAX Airport",
      destination: "China",
      destinationPort: "Shanghai Pudong",
      carrier: "DHL Express",
      transportMode: "Air",
      incoterm: "DAP",
      etd: "2026-06-01",
      eta: "2026-06-05",
      declaredValue: "50000",
      currency: "USD",
      bookingRef: "BL-MEM-001",
    },
    cargo: {
      description: "Industrial tablet computers",
      sku: "PMIC-8842",
      hsCode: "8471.30",
      quantity: "100",
      grossWeight: "200 kg",
      netWeight: "180 kg",
      handlingUnits: "4 pallets",
      container: "",
      seal: "",
      countryOfOrigin: "United States",
      dangerousGoods: "No",
      temperatureControlled: "No",
    },
    documents: [
      { name: "Commercial Invoice", owner: "Exporter", required: true, uploaded: false },
      { name: "Packing List", owner: "Exporter", required: true, uploaded: false },
      { name: "Bill of Lading", owner: "Importer", required: true, uploaded: false },
      { name: "Certificate of Origin", owner: "Exporter", required: true, uploaded: false },
    ],
  };

  const createResp = await fetch(`${BASE_URL}/api/shipments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shipmentPayload),
  });
  await expectOk(createResp, "Create shipment");
  console.log(`✓ Shipment created: ${shipmentId}`);

  // Step 2: Extract documents
  console.log("  Uploading + extracting Scenario C documents...");
  const form = new FormData();
  form.append("shipmentId", shipmentId);
  for (const f of docFiles) {
    form.append("files", fs.createReadStream(path.join(SCENARIO_C_DIR, f)), f);
  }
  const extractResp = await fetch(`${BASE_URL}/api/documents/extract`, {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });
  const extractResult = (await expectOk(extractResp, "Extract documents")) as Record<string, unknown>;
  const summary = extractResult?.summary as Record<string, unknown> | undefined;
  console.log(`✓ Extraction complete: ${summary?.successfully_extracted ?? "?"} docs extracted`);

  // Step 3: Validate (writes preliminary MemWal memory)
  console.log("  Running validation + MemWal memory write...");
  const validateResp = await fetch(`${BASE_URL}/api/shipments/${encodeURIComponent(shipmentId)}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const validateResult = (await expectOk(validateResp, "Validate shipment")) as Record<string, unknown>;
  console.log(`✓ Validation: ${validateResult?.overallVerdict ?? "unknown"} (baseline party memory written to MemWal)`);

  // Step 4: Mint passport
  console.log("  Minting Sui passport + uploading to Walrus...");
  const mintResp = await fetch(`${BASE_URL}/api/shipments/${encodeURIComponent(shipmentId)}/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const mintResult = (await expectOk(mintResp, "Mint passport")) as Record<string, unknown>;
  if (mintResult?.passportId) {
    console.log(`✓ Passport minted: ${mintResult.passportId}`);
  } else {
    console.log(`✓ Mint complete (mock mode — no live passport ID)`);
  }

  // Step 5: Poll for MemWal sync
  console.log("  Polling for MemWal sync...");
  let synced = false;
  for (let i = 0; i < 20; i++) {
    const shipmentResp = await fetch(`${BASE_URL}/api/shipments/${encodeURIComponent(shipmentId)}`);
    const shipmentData = (await expectOk(shipmentResp, "Get shipment")) as Record<string, unknown>;
    const syncStatus = shipmentData?.memWalSyncStatus ?? shipmentData?.memwal_sync_status;
    if (syncStatus === "synced") {
      synced = true;
      break;
    }
    if (syncStatus === "failed") {
      console.log("  MemWal sync failed — validation-time memory write still enables recall.");
      break;
    }
    process.stdout.write(`  ... sync status: ${syncStatus ?? "pending"} (attempt ${i + 1}/20)\r`);
    await sleep(3000);
  }
  if (synced) {
    console.log(`\n✓ MemWal sync complete — full provenance anchored to Walrus + Sui`);
  } else {
    console.log(`\n⚠  MemWal sync pending — recall will still work via validation-time memory`);
  }

  // Done
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✓ Baseline shipment ready: ${shipmentId}`);
  console.log(`\n  Open: ${BASE_URL}/shipments/${encodeURIComponent(shipmentId)}`);
  console.log(`\n  Next steps:`);
  console.log(`  1. Open the shipment above`);
  console.log(`  2. Scroll to "Demo Mode — Trigger Cross-Shipment Memory Recall"`);
  console.log(`  3. Click "Quick Demo (bank + BOL)" to create Shipment 2`);
  console.log(`  4. Upload docs from test/Scenario_D_memwal_fraud/ to Shipment 2`);
  console.log(`  5. Run validation on Shipment 2 — agent will recall Shipment 1 and flag anomalies`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
