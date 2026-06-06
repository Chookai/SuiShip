import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { checkAis } from "./helpers/ais-health";
import { resetDb } from "./helpers/db-reset";
import { checkEnv } from "./helpers/env-check";
import { fundSlush } from "./helpers/faucet";
import { DEMO_SHIPMENT, PDF_FIXTURES, SHIPMENT_ID } from "./fixtures/shipment-data";

// Captured during the run for the summary artifact
const txDigests: Record<string, string> = {};
let passportId = "";
let mintTxDigest = "";
let walrusBlobIds: string[] = [];
let shipmentId = SHIPMENT_ID;

// ── Pre-flight ────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  checkEnv();
  // Note: resetDb() is intentionally skipped when reuseExistingServer=true because
  // deleting the SQLite file while the server holds an open connection breaks the DB.
  // The test uses a unique SHIPMENT_ID = E2E-${Date.now()} so existing data doesn't interfere.
  await checkAis();
  await fundSlush();
});

// ── Artifact capture ──────────────────────────────────────────────────────────

test.afterAll(async () => {
  const summary = {
    runAt: new Date().toISOString(),
    shipmentId,
    suiNetwork: "testnet",
    passportId,
    txDigests: {
      mint: mintTxDigest,
      ...txDigests,
    },
    walrusBlobIds,
    anthropicCostEstimate: "~$0.10-0.30 (estimate based on step count)",
  };
  const outPath = path.join(process.cwd(), "tests", "e2e", "artifacts", "run-summary.json");
  await writeFile(outPath, JSON.stringify(summary, null, 2));
  console.log("[e2e] Run summary written to", outPath);
  console.log("[e2e] Passport ID:", passportId);
  console.log("[e2e] Mint tx:", mintTxDigest);
  console.log("[e2e] Endorsement txs:", txDigests);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function switchRole(page: import("@playwright/test").Page, targetCompany: string) {
  await page.click('button[aria-label="Switch company"]');
  // The role menu shows buttons with the company names
  await page.click(`button:has-text("${targetCompany}")`);
  await page.waitForTimeout(300);
}

async function chatWithBot(
  page: import("@playwright/test").Page,
  question: string
): Promise<string> {
  // Open chat — floating button at bottom-right (fixed position)
  const floatBtn = page.locator('button.fixed').filter({ has: page.locator('svg') }).last();
  await floatBtn.click();
  await page.waitForSelector('input[placeholder="Ask about this shipment…"]', { timeout: 10_000 });

  // Count existing messages before sending
  const before = await page.locator('[class*="message"]').count();

  await page.fill('input[placeholder="Ask about this shipment…"]', question);
  await page.keyboard.press("Enter");

  // Wait for at least one new message to appear (agent can take 20-60s)
  await page.waitForFunction(
    (prevCount) => document.querySelectorAll('[class*="message"]').length > prevCount,
    before,
    { timeout: 90_000 }
  );

  // Wait for loading indicator to disappear
  await page.waitForFunction(
    () => !document.querySelector('[class*="animate-spin"]'),
    { timeout: 90_000 }
  );

  const messages = page.locator('[class*="message"]');
  const lastText = (await messages.last().textContent()) ?? "";

  // Close chat
  const closeBtn = page.locator('button[aria-label="Close chat"]');
  if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await closeBtn.click();
  }

  return lastText;
}

// ── Main test ─────────────────────────────────────────────────────────────────

test("SuiShip full demo — create → upload → validate → mint → endorse → chat", async ({ page }) => {
  // ── Phase 1: Create shipment + upload docs + fill details ────────────────────
  await test.step("Phase 1: Create shipment with documents", async () => {
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    // Step 0: Exporter is pre-selected by default; advance to step 1
    await page.click('button:has-text("Next step")');
    await page.waitForTimeout(300);

    // Step 1: Trade parties
    // In "exporter" workflow: exporter shown as read-only PartySummaryCard (pre-filled from profile)
    // Importer shown as editable PartyCard. Both default to SCENARIO_C values (non-empty).
    // isStep1Complete = true with defaults, so we can advance directly.
    await page.click('button:has-text("Next step")');
    await page.waitForTimeout(300);

    // Step 2: Document upload
    // The file input is hidden (className="hidden"), setInputFiles bypasses visibility
    const fileInput = page.locator('input[accept="application/pdf,.pdf"]');
    await fileInput.setInputFiles([
      PDF_FIXTURES.commercialInvoice,
      PDF_FIXTURES.packingList,
      PDF_FIXTURES.billOfLading,
      PDF_FIXTURES.certificateOfOrigin,
    ]);

    // Extract button appears once files are staged
    await page.waitForSelector('button:has-text("Extract")', { timeout: 15_000 });
    await page.click('button:has-text("Extract")');

    // Extraction runs via real Haiku API (~20-60s). When done:
    // 1. "Extraction complete" banner appears
    // 2. Form auto-advances to step 3 (Details)
    await page.waitForSelector('text=Extraction complete', { timeout: 120_000 });
    console.log("[e2e] Extraction complete — form should be on step 3 (Details)");

    // Wait for the Details step to be active (auto-advanced by extraction handler)
    await page.waitForSelector('h2:has-text("Details")', { timeout: 15_000 });

    // Override shipment ID with our test ID (extraction might have filled a different value)
    const shipmentIdInput = page.getByLabel("Shipment ID / Reference No.", { exact: true });
    await shipmentIdInput.clear();
    await shipmentIdInput.fill(SHIPMENT_ID);

    // Fill required details fields. Extraction may have pre-filled some of these;
    // we fill explicitly to ensure all required fields pass isDetailsComplete.
    await page.getByLabel("Transport mode", { exact: true }).fill(DEMO_SHIPMENT.shipment.mode);
    await page.getByLabel("Incoterm", { exact: true }).fill(DEMO_SHIPMENT.shipment.incoterm);
    await page.getByLabel("Origin country", { exact: true }).fill(DEMO_SHIPMENT.shipment.originCountry);
    await page.getByLabel("Origin port / airport", { exact: true }).fill(DEMO_SHIPMENT.shipment.originPort);
    await page.getByLabel("Destination country", { exact: true }).fill(DEMO_SHIPMENT.shipment.destinationCountry);
    await page.getByLabel("Destination port / airport", { exact: true }).fill(DEMO_SHIPMENT.shipment.destinationPort);
    await page.getByLabel("Carrier", { exact: true }).fill(DEMO_SHIPMENT.shipment.carrier);
    await page.getByLabel("Declared value", { exact: true }).fill(DEMO_SHIPMENT.shipment.declaredValue);
    await page.getByLabel("Currency", { exact: true }).fill(DEMO_SHIPMENT.shipment.currency);
    await page.getByLabel("Payment terms", { exact: true }).fill(DEMO_SHIPMENT.shipment.paymentTerms);
    // ETD/ETA are required date fields
    await page.getByLabel("ETD", { exact: true }).fill("2026-08-01");
    await page.getByLabel("ETA", { exact: true }).fill("2026-09-01");

    // Fill cargo fields
    await page.getByLabel("Product description", { exact: true }).fill(DEMO_SHIPMENT.cargo.description);
    await page.getByLabel("SKU / part number", { exact: true }).fill(DEMO_SHIPMENT.cargo.skuPart);
    await page.getByLabel("HS code", { exact: true }).fill(DEMO_SHIPMENT.cargo.hsCode);
    await page.getByLabel("Quantity", { exact: true }).fill(DEMO_SHIPMENT.cargo.quantity);
    await page.getByLabel("Gross weight", { exact: true }).fill(DEMO_SHIPMENT.cargo.grossWeight);
    await page.getByLabel("Net weight", { exact: true }).fill(DEMO_SHIPMENT.cargo.netWeight);
    await page.getByLabel("Cartons / pallets / containers", { exact: true }).fill(DEMO_SHIPMENT.cargo.cartons);
    await page.getByLabel("Country of origin", { exact: true }).fill(DEMO_SHIPMENT.cargo.countryOfOrigin);

    // Submit — waits for isDetailsComplete && isCargoComplete to be true
    await page.waitForSelector('button:has-text("Create shipment")', { timeout: 10_000 });
    await page.click('button:has-text("Create shipment")');

    // Wait for navigation to /shipments/:id
    await page.waitForURL(/\/shipments\//, { timeout: 30_000 });
    const url = page.url();
    const match = url.match(/\/shipments\/([^/?#]+)/);
    if (match) {
      shipmentId = decodeURIComponent(match[1]);
      console.log("[e2e] Created shipment:", shipmentId);
    }
    expect(shipmentId).toBeTruthy();
  });

  // ── Phase 2: Verify extraction on shipment page ───────────────────────────────
  await test.step("Phase 2: Verify document extraction", async () => {
    // Docs were extracted during Phase 1 and stored to DB via the create flow.
    // Verify via API that at least 2 docs are in verified state.
    const docsRes = await page.request.get(`/api/shipments/${encodeURIComponent(shipmentId)}/documents`);
    if (docsRes.ok()) {
      const docsData = await docsRes.json() as { documents?: Array<{ state?: string; uploaded?: boolean }> };
      const verifiedCount = (docsData.documents ?? []).filter((d) => d.state === "verified" || d.uploaded).length;
      expect(verifiedCount).toBeGreaterThanOrEqual(2);
      console.log("[e2e] Docs in verified/uploaded state:", verifiedCount);
    } else {
      // Endpoint may not exist; just check docs on the UI
      await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
      await page.waitForLoadState("networkidle");
      // At least one doc card should show a success indicator
      const docCount = await page.locator('[class*="CheckCircle"], [class*="emerald"]').count();
      expect(docCount).toBeGreaterThan(0);
    }
  });

  // ── Phase 3: Validate ────────────────────────────────────────────────────────
  await test.step("Phase 3: Validate shipment", async () => {
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await page.waitForLoadState("networkidle");

    // Trigger validation if a button is present
    const validateBtn = page.locator('button:has-text("Validate"), button:has-text("Run validation")');
    if (await validateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await validateBtn.click();
    }

    // Wait for verdict text (agent loop 60-90s)
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return /aligned|misaligned|unable_to_determine|ready_for_customs|escalate_for_review|hold_pending_info/i.test(text);
      },
      { timeout: 120_000 }
    );
    console.log("[e2e] Validation complete");

    // Capture Walrus blob IDs from case-file API
    const caseFileRes = await page.request.get(`/api/shipments/${encodeURIComponent(shipmentId)}/case-file`);
    if (caseFileRes.ok()) {
      const cf = await caseFileRes.json() as { caseFile?: { finalDecision?: string; walrusBlobId?: string } };
      console.log("[e2e] Final decision:", cf.caseFile?.finalDecision);
      if (cf.caseFile?.walrusBlobId) {
        walrusBlobIds.push(cf.caseFile.walrusBlobId);
      }
    }
  });

  // ── Phase 4: Mint passport ────────────────────────────────────────────────────
  await test.step("Phase 4: Mint passport on Sui testnet", async () => {
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await page.waitForLoadState("networkidle");

    // Wait for "Create Passport" button to be enabled
    await page.waitForSelector('button:has-text("Create Passport"):not([disabled])', { timeout: 30_000 });
    await page.click('button:has-text("Create Passport")');

    // Poll demo-readiness until passportId is non-null
    await page.waitForFunction(
      async (id: string) => {
        try {
          const res = await fetch(`/api/shipments/${encodeURIComponent(id)}/demo-readiness`);
          const data = await res.json() as { sui?: { passportId?: string } };
          return Boolean(data.sui?.passportId);
        } catch {
          return false;
        }
      },
      shipmentId,
      { timeout: 60_000 }
    );

    const readinessRes = await page.request.get(`/api/shipments/${encodeURIComponent(shipmentId)}/demo-readiness`);
    const readiness = await readinessRes.json() as {
      sui?: { mode?: string; passportId?: string; txDigest?: string };
      walrus?: { mode?: string; blobIds?: string[] };
    };

    expect(readiness.sui?.mode).toBe("real");
    expect(readiness.sui?.passportId).toBeTruthy();
    passportId = readiness.sui?.passportId ?? "";
    mintTxDigest = readiness.sui?.txDigest ?? "";
    if (readiness.walrus?.blobIds) {
      walrusBlobIds.push(...readiness.walrus.blobIds);
    }
    console.log("[e2e] Passport minted:", passportId);
    console.log("[e2e] Mint tx:", mintTxDigest);
  });

  // ── Phase 5: Endorsement chain ───────────────────────────────────────────────
  await test.step("Phase 5: Endorsement chain", async () => {
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await page.waitForLoadState("networkidle");

    // Wait for endorsement panel to appear (only after mint)
    await page.waitForSelector('h2:has-text("Endorsement Panel")', { timeout: 30_000 });

    async function endorse(roleBtnLabel: string, actionBtnLabel: string, digestKey: string) {
      // Select role in the panel
      const roleBtn = page.locator('h2:has-text("Endorsement Panel")').locator('..').locator(`button:has-text("${roleBtnLabel}")`);
      await roleBtn.click();
      await page.waitForTimeout(300);

      // Click the action button
      const actionBtn = page.locator('h2:has-text("Endorsement Panel")').locator('..').locator(`button:has-text("${actionBtnLabel}")`);
      await actionBtn.click();

      // Wait for success message (emerald box with tx digest)
      await page.waitForSelector('.border-emerald-100', { timeout: 30_000 });
      const successEl = page.locator('.bg-emerald-50').last();
      const successText = await successEl.textContent() ?? "";
      const digestMatch = successText.match(/[A-Za-z0-9]{40,}/);
      if (digestMatch) {
        txDigests[digestKey] = digestMatch[0];
        console.log(`[e2e] ${digestKey} tx:`, digestMatch[0]);
      }
      await page.waitForTimeout(500);
    }

    // freight_forwarder → picked_up
    await endorse("Freight Forwarder", "Picked Up", "picked_up");

    // Trigger persistent agent check
    try {
      const agentCheck = await page.request.post(
        `/api/persistent-agent/check`,
        { data: { simulationId: shipmentId } }
      );
      console.log("[e2e] Persistent agent check status:", agentCheck.status());
    } catch (err) {
      console.warn("[e2e] Persistent agent check failed (non-blocking):", err);
    }

    // freight_forwarder → handed_off
    await endorse("Freight Forwarder", "Handed Off", "handed_off");

    // freight_forwarder → reviewed
    await endorse("Freight Forwarder", "Customs Reviewed", "reviewed");

    // freight_forwarder → cleared_customs
    await endorse("Freight Forwarder", "Customs Cleared", "cleared_customs");

    // Switch to Importer role via the shell role switcher
    await switchRole(page, "Shanghai Smart Imports Co Ltd");

    // Reload to reflect new role (chatbot gating depends on actorRole)
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('h2:has-text("Endorsement Panel")', { timeout: 30_000 });

    // importer → received
    await endorse("Importer", "Received", "received");

    console.log("[e2e] All 5 endorsements complete");
  });

  // ── Phase 6: Chat agent ──────────────────────────────────────────────────────
  await test.step("Phase 6: Chat agent — 3 role queries", async () => {
    // Query 1: Exporter — validation verdict
    await switchRole(page, "Acme Robotics LLC");
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await page.waitForLoadState("networkidle");

    const response1 = await chatWithBot(page, "What is the validation verdict for this shipment?");
    expect(response1.length).toBeGreaterThan(50);
    expect(response1).not.toMatch(/error|failed|sorry, something went wrong/i);
    console.log("[e2e] Chat (Exporter) response length:", response1.length);

    // Query 2: Freight Forwarder — endorsement steps
    await switchRole(page, "Freight Forwarder");
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await page.waitForLoadState("networkidle");

    const response2 = await chatWithBot(page, "What endorsement steps have been completed so far?");
    expect(response2.length).toBeGreaterThan(50);
    expect(response2).not.toMatch(/error|failed|sorry, something went wrong/i);
    console.log("[e2e] Chat (FF) response length:", response2.length);

    // Query 3: Importer — customs readiness
    await switchRole(page, "Shanghai Smart Imports Co Ltd");
    await page.goto(`/shipments/${encodeURIComponent(shipmentId)}`);
    await page.waitForLoadState("networkidle");

    const response3 = await chatWithBot(page, "What is the customs readiness score?");
    expect(response3.length).toBeGreaterThan(50);
    expect(response3).not.toMatch(/error|failed|sorry, something went wrong/i);
    console.log("[e2e] Chat (Importer) response length:", response3.length);
  });

  // ── Final assertions ──────────────────────────────────────────────────────────
  await test.step("Final: verify run summary data", async () => {
    expect(passportId).toMatch(/^0x[0-9a-f]+/i);
    expect(mintTxDigest).toBeTruthy();
    expect(Object.keys(txDigests)).toHaveLength(5);
    console.log("[e2e] All phases complete. Passport:", passportId);
  });
});
