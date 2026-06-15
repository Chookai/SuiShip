/**
 * Seed Scenario C company profiles into existing MemWal accounts.
 *
 * Usage:
 *   npx tsx scripts/seed-memwal-demo-profiles.ts
 *   npx tsx scripts/seed-memwal-demo-profiles.ts --prefix=ACCOUNT_1 --prefix=ACCOUNT_2
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SCENARIO_C_EXPORTER,
  SCENARIO_C_IMPORTER,
} from "../lib/scenario-c-demo-defaults";
import { recallLatestCompanyProfile, writeCompanyProfileToMemWal } from "../lib/profile-memwal";

type AccountTarget = {
  label: string;
  accountId: string;
  delegateKey: string;
};

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function getArgValues(name: string): string[] {
  const prefix = `${name}=`;
  return process.argv
    .filter((item) => item.startsWith(prefix))
    .map((item) => item.slice(prefix.length).trim())
    .filter(Boolean);
}

function targetFromPrefix(prefix: string): AccountTarget {
  const normalized = prefix.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const accountId = process.env[`${normalized}_MEMWAL_ACCOUNT_ID`];
  const delegateKey = process.env[`${normalized}_MEMWAL_ED25519_KEY`];
  if (!accountId || !delegateKey) {
    throw new Error(`Missing ${normalized}_MEMWAL_ACCOUNT_ID or ${normalized}_MEMWAL_ED25519_KEY`);
  }
  return { label: normalized, accountId, delegateKey };
}

function activeTarget(): AccountTarget {
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  const delegateKey = process.env.MEMWAL_ED25519_KEY;
  if (!accountId || !delegateKey) {
    throw new Error("Missing MEMWAL_ACCOUNT_ID or MEMWAL_ED25519_KEY");
  }
  return { label: "ACTIVE", accountId, delegateKey };
}

async function seedTarget(target: AccountTarget): Promise<void> {
  process.env.ENABLE_MEMWAL = "true";
  process.env.MEMWAL_ACCOUNT_ID = target.accountId;
  process.env.MEMWAL_ED25519_KEY = target.delegateKey;

  console.log(`\nSeeding ${target.label}: ${target.accountId}`);
  const exporter = await writeCompanyProfileToMemWal({ ...SCENARIO_C_EXPORTER }, "Exporter", 1);
  const importer = await writeCompanyProfileToMemWal({ ...SCENARIO_C_IMPORTER }, "Importer", 1);

  const [recalledExporter, recalledImporter] = await Promise.all([
    recallLatestCompanyProfile(SCENARIO_C_EXPORTER),
    recallLatestCompanyProfile(SCENARIO_C_IMPORTER),
  ]);

  console.log(`  Exporter namespace: ${exporter.namespace} (${recalledExporter ? "verified" : "not recalled"})`);
  console.log(`  Importer namespace: ${importer.namespace} (${recalledImporter ? "verified" : "not recalled"})`);
}

async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const prefixes = getArgValues("--prefix");
  const targets = prefixes.length > 0
    ? prefixes.map(targetFromPrefix)
    : [activeTarget()];

  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.accountId)) continue;
    seen.add(target.accountId);
    await seedTarget(target);
  }

  console.log("\nDone. Restart npm run dev before uploading documents again.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
