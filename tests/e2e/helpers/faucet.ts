/**
 * Checks testnet SUI balances on the 3 party-slush addresses.
 * If any address has < MIN_MIST, requests testnet faucet top-up.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const RPC_URL = "https://fullnode.testnet.sui.io:443";
const FAUCET_URL = "https://faucet.testnet.sui.io/v1/gas";
const MIN_MIST = BigInt(100_000_000); // 0.1 SUI

type SlushAccount = { role: string; company: string; address: string };

function loadSlushAddresses(): SlushAccount[] {
  const filePath = path.join(process.cwd(), "data", "party-slush-accounts.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as { accounts: SlushAccount[] };
  return raw.accounts;
}

async function getBalance(address: string): Promise<bigint> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "suix_getBalance",
    params: [address, "0x2::sui::SUI"],
  };
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as { result?: { totalBalance?: string } };
  return BigInt(data.result?.totalBalance ?? "0");
}

async function requestFaucet(address: string): Promise<void> {
  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[faucet] ${address} — faucet returned HTTP ${res.status}: ${text.slice(0, 120)}`);
  } else {
    console.log(`[faucet] Funded ${address}`);
  }
}

export async function fundSlush(): Promise<void> {
  const accounts = loadSlushAddresses();
  for (const acct of accounts) {
    const balance = await getBalance(acct.address);
    const suiDisplay = (Number(balance) / 1e9).toFixed(4);
    if (balance < MIN_MIST) {
      console.log(`[faucet] ${acct.role} (${acct.address}) balance ${suiDisplay} SUI < 0.1 — requesting faucet...`);
      await requestFaucet(acct.address);
      // Wait for inclusion
      await new Promise((r) => setTimeout(r, 5000));
      const newBal = await getBalance(acct.address);
      if (newBal < MIN_MIST) {
        throw new Error(
          `[faucet] ${acct.role} address ${acct.address} still below threshold after faucet attempt: ` +
          `${(Number(newBal) / 1e9).toFixed(4)} SUI. Fund manually via https://faucet.sui.io`
        );
      }
      console.log(`[faucet] ${acct.role} now has ${(Number(newBal) / 1e9).toFixed(4)} SUI`);
    } else {
      console.log(`[faucet] ${acct.role} has ${suiDisplay} SUI ✓`);
    }
  }
}
