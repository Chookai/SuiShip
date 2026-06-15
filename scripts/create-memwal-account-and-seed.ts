/**
 * Create a fresh MemWal account on Sui testnet (new wallet → no prior document memory),
 * register a delegate key, and update .env.local.
 *
 * Usage:
 *   npx tsx scripts/create-memwal-account-and-seed.ts           # also seeds company profiles
 *   npx tsx scripts/create-memwal-account-and-seed.ts --seed-parties # seeds importer/exporter profiles only
 *   npx tsx scripts/create-memwal-account-and-seed.ts --no-seed      # empty account only
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { parseEd25519Keypair } from "../lib/sui-keypair";
import { pathToFileURL } from "node:url";
import {
  SCENARIO_C_EXPORTER,
  SCENARIO_C_FREIGHT_FORWARDER,
  SCENARIO_C_IMPORTER,
} from "../lib/scenario-c-demo-defaults";
import { recallLatestCompanyProfile, writeCompanyProfileToMemWal } from "../lib/profile-memwal";

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  const fallbackEnvPath = resolve(process.cwd(), ".env");
  const sourcePath = existsSync(envPath) ? envPath : fallbackEnvPath;
  if (!existsSync(sourcePath)) return;
  const lines = readFileSync(sourcePath, "utf8").split("\n");
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

loadEnvLocal();

const MEMWAL_PACKAGE_ID =
  process.env.MEMWAL_PACKAGE_ID ?? "0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6";
const MEMWAL_REGISTRY_ID =
  process.env.MEMWAL_REGISTRY_ID ?? "0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437";
const MEMWAL_SERVER_URL = process.env.MEMWAL_SERVER_URL ?? "https://relayer.staging.memwal.ai";

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function createTestnetSuiClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  } as ConstructorParameters<typeof SuiJsonRpcClient>[0]);
}

async function fundFromExistingWallet(recipient: string): Promise<void> {
  const donorKey = process.env.SUI_PRIVATE_KEY;
  if (!donorKey) {
    throw new Error("SUI_PRIVATE_KEY is not set; cannot fund new MemWal owner wallet.");
  }
  const donor = parseEd25519Keypair(donorKey);
  const client = createTestnetSuiClient();
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [50_000_000]);
  tx.transferObjects([coin], recipient);
  const result = await client.signAndExecuteTransaction({ signer: donor, transaction: tx });
  await client.waitForTransaction({ digest: result.digest });
  console.log(`Funded ${recipient} from existing SUI_PRIVATE_KEY (digest ${result.digest})`);
}

async function fundTestnet(address: string): Promise<void> {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch("https://faucet.testnet.sui.io/v2/gas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
    });
    if (res.ok) {
      console.log(`Funded testnet wallet ${address}`);
      return;
    }
    const text = await res.text();
    if (res.status === 429 && attempt < maxAttempts - 1) {
      const retryAfterSeconds = Number(text.match(/Wait for (\d+)s/i)?.[1]);
      const waitMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(3000, retryAfterSeconds * 1000)
        : 3000 * (attempt + 1);
      console.log(`Faucet rate-limited, retrying in ${waitMs / 1000}s…`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Faucet failed (${res.status}): ${text}`);
  }
}

function updateEnvLocal(delegateKey: string, accountId: string): void {
  const envPath = resolve(process.cwd(), ".env.local");
  let content = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : existsSync(resolve(process.cwd(), ".env"))
      ? readFileSync(resolve(process.cwd(), ".env"), "utf8")
      : "";
  const backup = [
    `# Previous MemWal (archived ${new Date().toISOString().slice(0, 10)})`,
    `# MEMWAL_ED25519_KEY=${process.env.MEMWAL_ED25519_KEY}`,
    `# MEMWAL_ACCOUNT_ID=${process.env.MEMWAL_ACCOUNT_ID}`,
  ].join("\n");

  if (!content.includes("MEMWAL_PACKAGE_ID=")) {
    content += `\nMEMWAL_PACKAGE_ID=${MEMWAL_PACKAGE_ID}\nMEMWAL_REGISTRY_ID=${MEMWAL_REGISTRY_ID}\n`;
  }

  content = content.replace(/^MEMWAL_ED25519_KEY=.*$/m, `MEMWAL_ED25519_KEY=${delegateKey}`);
  content = content.replace(/^MEMWAL_ACCOUNT_ID=.*$/m, `MEMWAL_ACCOUNT_ID=${accountId}`);
  if (!content.includes("# Previous MemWal")) {
    content = content.replace(
      /# ── MemWal ─+/,
      (match) => `${match}\n${backup}\n`
    );
  }
  writeFileSync(envPath, content, "utf8");
  process.env.MEMWAL_ED25519_KEY = delegateKey;
  process.env.MEMWAL_ACCOUNT_ID = accountId;
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

function recordAccount(prefix: string, delegateKey: string, accountId: string, ownerSecret: string): void {
  const normalized = prefix.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!normalized) return;

  const envPath = resolve(process.cwd(), ".env.local");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  content = upsertEnvLine(content, `${normalized}_MEMWAL_ACCOUNT_ID`, accountId);
  content = upsertEnvLine(content, `${normalized}_MEMWAL_ED25519_KEY`, delegateKey);
  content = upsertEnvLine(content, `${normalized}_MEMWAL_OWNER_SECRET`, ownerSecret);
  writeFileSync(envPath, content, "utf8");
  console.log(`Recorded account as ${normalized}_MEMWAL_* in .env.local`);
}

async function seedProfiles(): Promise<void> {
  const importer = { ...SCENARIO_C_IMPORTER };
  const exporter = { ...SCENARIO_C_EXPORTER };
  const freightForwarder = { ...SCENARIO_C_FREIGHT_FORWARDER };
  const importerResult = await writeCompanyProfileToMemWal(importer, "Importer", 1);
  const exporterResult = await writeCompanyProfileToMemWal(exporter, "Exporter", 1);
  const ffResult = await writeCompanyProfileToMemWal(freightForwarder, "Freight Forwarder", 1);
  console.log("Seeded Importer profile v1:", importerResult.namespace, importerResult.blobId);
  console.log("Seeded Exporter profile v1:", exporterResult.namespace, exporterResult.blobId);
  console.log("Seeded Freight Forwarder profile v1:", ffResult.namespace, ffResult.blobId);
}

async function seedImporterExporterProfiles(): Promise<void> {
  const importer = { ...SCENARIO_C_IMPORTER };
  const exporter = { ...SCENARIO_C_EXPORTER };
  const importerResult = await writeCompanyProfileToMemWal(importer, "Importer", 1);
  const exporterResult = await writeCompanyProfileToMemWal(exporter, "Exporter", 1);
  const [recalledImporter, recalledExporter] = await Promise.all([
    recallLatestCompanyProfile(importer),
    recallLatestCompanyProfile(exporter),
  ]);
  console.log(
    "Seeded Importer profile v1:",
    importerResult.namespace,
    importerResult.blobId,
    recalledImporter ? "(verified)" : "(not recalled)"
  );
  console.log(
    "Seeded Exporter profile v1:",
    exporterResult.namespace,
    exporterResult.blobId,
    recalledExporter ? "(verified)" : "(not recalled)"
  );
}

async function loadMemwalAccountApi() {
  const memwalAccountPath = pathToFileURL(
    resolve(process.cwd(), "node_modules/@mysten-incubation/memwal/dist/account.js")
  ).href;
  return import(memwalAccountPath) as Promise<{
    createAccount: (opts: Record<string, unknown>) => Promise<{ accountId: string; owner: string; digest: string }>;
    addDelegateKey: (opts: Record<string, unknown>) => Promise<{ digest: string }>;
    generateDelegateKey: () => Promise<{ privateKey: string; publicKey: Uint8Array; suiAddress: string }>;
  }>;
}

async function main() {
  const noSeed = process.argv.includes("--no-seed");
  const seedParties = process.argv.includes("--seed-parties");
  const useFaucet = process.argv.includes("--use-faucet");
  const recordPrefix = getArgValue("--record-prefix");
  const printOwnerSecret = process.argv.includes("--print-owner-secret");
  const { createAccount, addDelegateKey, generateDelegateKey } = await loadMemwalAccountApi();
  const suiClient = createTestnetSuiClient();
  const ownerKeypair = Ed25519Keypair.generate();
  const ownerAddress = ownerKeypair.getPublicKey().toSuiAddress();
  const ownerSecret = ownerKeypair.getSecretKey();
  console.log("New Sui owner for MemWal account:", ownerAddress);

  if (process.env.SUI_PRIVATE_KEY && !useFaucet) {
    await fundFromExistingWallet(ownerAddress);
  } else {
    await fundTestnet(ownerAddress);
  }
  await new Promise((r) => setTimeout(r, 8000));

  console.log("Creating MemWal account on testnet…");
  const account = await createAccount({
    packageId: MEMWAL_PACKAGE_ID,
    registryId: MEMWAL_REGISTRY_ID,
    suiPrivateKey: ownerSecret,
    suiNetwork: "testnet",
    suiClient,
  });
  if (!account.accountId) {
    throw new Error("createAccount did not return accountId");
  }
  console.log("MemWal account ID:", account.accountId);

  const delegate = await generateDelegateKey();
  await addDelegateKey({
    packageId: MEMWAL_PACKAGE_ID,
    accountId: account.accountId,
    publicKey: delegate.publicKey,
    label: "suiship-delegate",
    suiPrivateKey: ownerSecret,
    suiNetwork: "testnet",
    suiClient,
  });

  updateEnvLocal(delegate.privateKey, account.accountId);
  console.log("Updated .env.local with new MEMWAL_ED25519_KEY and MEMWAL_ACCOUNT_ID");
  if (recordPrefix) {
    recordAccount(recordPrefix, delegate.privateKey, account.accountId, ownerSecret);
  }
  console.log("MEMWAL_SERVER_URL:", MEMWAL_SERVER_URL);

  if (noSeed) {
    console.log("Skipping profile seed (--no-seed). MemWal account has no stored memory yet.");
  } else if (seedParties) {
    console.log("Seeding Importer and Exporter profiles to MemWal…");
    await seedImporterExporterProfiles();
  } else {
    console.log("Seeding company profiles to MemWal…");
    await seedProfiles();
  }

  console.log("\nDone. Restart `npm run dev` so the server picks up the new MemWal credentials.");
  if (printOwnerSecret) {
    console.log("Save owner Sui secret offline if you need to add more delegate keys later:");
    console.log(ownerSecret);
  } else {
    console.log("Owner Sui secret was not printed. Use --print-owner-secret if you need it in stdout.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
