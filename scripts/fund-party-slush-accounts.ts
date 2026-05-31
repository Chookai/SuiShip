/**
 * Top up the three party slush wallets (Exporter, Importer, Freight Forwarder) on testnet.
 * Reuses keys from .env.local — does not generate new keys.
 *
 * Usage: npm run slush:fund
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import {
  DEFAULT_COMPANY_BY_ROLE,
  type PartySlushRole,
} from "../lib/party-slush-accounts";
import { parseEd25519Keypair } from "../lib/sui-keypair";

const ROLES: PartySlushRole[] = ["Exporter", "Importer", "Freight Forwarder"];
const ENV_VARS: Record<PartySlushRole, string> = {
  Exporter: "SUI_SLUSH_EXPORTER_KEY",
  Importer: "SUI_SLUSH_IMPORTER_KEY",
  "Freight Forwarder": "SUI_SLUSH_FREIGHT_FORWARDER_KEY",
};

/** 0.5 SUI per party — enough for several endorsements / grants */
const TOP_UP_MIST = 500_000_000;
const MIN_BALANCE_MIST = 200_000_000;

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function createTestnetSuiClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  } as ConstructorParameters<typeof SuiJsonRpcClient>[0]);
}

async function getBalanceMist(client: SuiJsonRpcClient, address: string): Promise<bigint> {
  const res = await client.getBalance({ owner: address });
  return BigInt(res.totalBalance);
}

async function fundFromDonor(recipient: string, amountMist: number): Promise<string> {
  const donorKey = process.env.SUI_PRIVATE_KEY;
  if (!donorKey) {
    throw new Error("SUI_PRIVATE_KEY is not set");
  }
  const donor = parseEd25519Keypair(donorKey);
  const client = createTestnetSuiClient();
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountMist]);
  tx.transferObjects([coin], recipient);
  const result = await client.signAndExecuteTransaction({ signer: donor, transaction: tx });
  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

async function fundTestnetFaucet(address: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch("https://faucet.testnet.sui.io/v2/gas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
    });
    if (res.ok) return;
    const text = await res.text();
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    throw new Error(`Faucet failed (${res.status}): ${text}`);
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const client = createTestnetSuiClient();
  const useDonor = Boolean(process.env.SUI_PRIVATE_KEY);

  console.log(useDonor ? "Funding via SUI_PRIVATE_KEY transfer…" : "Funding via testnet faucet…\n");

  for (const role of ROLES) {
    const secretKey = process.env[ENV_VARS[role]]?.trim();
    if (!secretKey) {
      console.warn(`Skip ${role}: ${ENV_VARS[role]} not set (run npm run slush:setup first)`);
      continue;
    }

    const address = parseEd25519Keypair(secretKey).toSuiAddress();
    const company = DEFAULT_COMPANY_BY_ROLE[role];
    let balance = await getBalanceMist(client, address);
    const balanceSui = Number(balance) / 1e9;
    console.log(`${role} (${company})`);
    console.log(`  ${address}`);
    console.log(`  balance: ${balanceSui.toFixed(4)} SUI`);

    if (balance >= BigInt(MIN_BALANCE_MIST)) {
      console.log(`  OK — already has enough gas\n`);
      continue;
    }

    try {
      if (useDonor) {
        const digest = await fundFromDonor(address, TOP_UP_MIST);
        console.log(`  +${TOP_UP_MIST / 1e9} SUI from donor (tx ${digest})`);
      } else {
        await fundTestnetFaucet(address);
        console.log("  Faucet request sent");
      }
      await new Promise((r) => setTimeout(r, 2000));
      balance = await getBalanceMist(client, address);
      console.log(`  new balance: ${(Number(balance) / 1e9).toFixed(4)} SUI\n`);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
