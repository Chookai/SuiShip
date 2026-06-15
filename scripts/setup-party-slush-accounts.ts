/**
 * Creates three testnet Sui wallets for Scenario C trade parties and writes keys to .env.local.
 *
 *   Exporter  — Acme Robotics LLC
 *   Importer  — Shanghai Smart Imports Co Ltd
 *   Freight Forwarder
 *
 * Run: npm run slush:setup
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import {
  DEFAULT_COMPANY_BY_ROLE,
  generatePartySlushKeypair,
  type PartySlushRole,
} from "../lib/party-slush-accounts";
import { parseEd25519Keypair } from "../lib/sui-keypair";

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
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

loadEnvLocal();

function createTestnetSuiClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  } as ConstructorParameters<typeof SuiJsonRpcClient>[0]);
}

const ROLES: PartySlushRole[] = ["Exporter", "Importer", "Freight Forwarder"];

const ENV_VARS: Record<PartySlushRole, string> = {
  Exporter: "SUI_SLUSH_EXPORTER_KEY",
  Importer: "SUI_SLUSH_IMPORTER_KEY",
  "Freight Forwarder": "SUI_SLUSH_FREIGHT_FORWARDER_KEY",
};

async function fundFromDonor(recipient: string): Promise<void> {
  const donorKey = process.env.SUI_PRIVATE_KEY;
  if (!donorKey) {
    throw new Error("SUI_PRIVATE_KEY is not set; cannot fund party slush wallets.");
  }
  const donor = parseEd25519Keypair(donorKey);
  const client = createTestnetSuiClient();
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [100_000_000]);
  tx.transferObjects([coin], recipient);
  const result = await client.signAndExecuteTransaction({ signer: donor, transaction: tx });
  await client.waitForTransaction({ digest: result.digest });
  console.log(`Funded ${recipient} from SUI_PRIVATE_KEY (digest ${result.digest})`);
}

async function fundTestnetFaucet(address: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch("https://faucet.testnet.sui.io/v2/gas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
    });
    if (res.ok) {
      console.log(`Faucet funded ${address}`);
      return;
    }
    const text = await res.text();
    if (res.status === 429 && attempt < 5) {
      const waitMs = 3000 * (attempt + 1);
      console.log(`Faucet rate-limited, retrying in ${waitMs / 1000}s…`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Faucet failed (${res.status}): ${text}`);
  }
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

function loadExistingKey(envContent: string, envVar: string): string | undefined {
  const match = envContent.match(new RegExp(`^${envVar}=(.+)$`, "m"));
  return match?.[1]?.trim();
}

async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env.local");
  let envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

  const publicAccounts: Array<{
    role: PartySlushRole;
    company: string;
    address: string;
  }> = [];

  for (const role of ROLES) {
    const envVar = ENV_VARS[role];
    let secretKey = loadExistingKey(envContent, envVar);
    if (!secretKey) {
      const generated = generatePartySlushKeypair();
      secretKey = generated.secretKey;
      envContent = upsertEnvLine(envContent, envVar, secretKey);
      console.log(`Generated new key for ${role} (${DEFAULT_COMPANY_BY_ROLE[role]})`);
    } else {
      console.log(`Reusing existing ${envVar}`);
    }

    const address = parseEd25519Keypair(secretKey).toSuiAddress();
    publicAccounts.push({
      role,
      company: DEFAULT_COMPANY_BY_ROLE[role],
      address,
    });

    try {
      if (process.env.SUI_PRIVATE_KEY) {
        await fundFromDonor(address);
      } else {
        await fundTestnetFaucet(address);
      }
    } catch (err) {
      console.warn(`Funding ${role} (${address}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  envContent = upsertEnvLine(envContent, "ENABLE_PARTY_SLUSH_SIGNING", "true");
  writeFileSync(envPath, envContent, "utf8");
  console.log(`Updated ${envPath}`);

  const jsonPath = resolve(process.cwd(), "data/party-slush-accounts.json");
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        network: "testnet",
        updatedAt: new Date().toISOString(),
        accounts: publicAccounts,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Wrote ${jsonPath}`);
  console.log("\nParty slush addresses:");
  for (const account of publicAccounts) {
    console.log(`  ${account.role} (${account.company}): ${account.address}`);
  }
  console.log("\nRestart npm run dev so the server picks up .env.local.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
