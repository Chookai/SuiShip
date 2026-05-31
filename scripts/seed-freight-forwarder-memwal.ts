/**
 * Seed Freight Forwarder company profile v1 to MemWal (uses MEMWAL_* from .env.local).
 *
 * Usage: npx tsx scripts/seed-freight-forwarder-memwal.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCENARIO_C_FREIGHT_FORWARDER } from "../lib/scenario-c-demo-defaults";
import { writeCompanyProfileToMemWal } from "../lib/profile-memwal";

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
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

async function main() {
  loadEnvLocal();
  const profile = { ...SCENARIO_C_FREIGHT_FORWARDER };
  console.log("Seeding Freight Forwarder profile to MemWal…");
  console.log("Company:", profile.company);
  const result = await writeCompanyProfileToMemWal(profile, "Freight Forwarder", 1);
  console.log("Done.");
  console.log("  namespace:", result.namespace);
  console.log("  blobId:", result.blobId);
  console.log("  profileVersion:", result.profileVersion);
  console.log("\nSwitch account to Freight Forwarder in the app header to use this profile.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
