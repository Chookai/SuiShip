import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { isMemWalConfigured, isMemWalEnabled } from "@/lib/memwal/client";

export const runtime = "nodejs";

// Guard against double-clicks: each run funds a wallet and rewrites .env.local,
// so two concurrent runs would race. Module scope persists across requests
// within a single dev-server process.
let refreshInFlight = false;

const SCRIPT_TIMEOUT_MS = 180_000;

function tail(text: string, max: number): string {
  return text.length > max ? text.slice(-max) : text;
}

function mask(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function runScript(
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    const child = spawn(bin, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveP({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolveP({ code: -1, stdout, stderr: `${stderr}\n${err.message}` });
    });
  });
}

/**
 * The spawned script rewrites .env.local and updates process.env in its OWN
 * child process only — the parent Next server keeps the old credentials. Re-read
 * the new MemWal creds from disk and overwrite them on the parent's process.env so
 * the next lib/memwal/client.ts call (which reads env fresh every time) targets the
 * new account without a dev-server restart.
 */
function reloadMemwalEnvFromDisk(cwd: string): { key: string; accountId: string } | null {
  const envPath = resolve(cwd, ".env.local");
  if (!existsSync(envPath)) return null;
  let key: string | undefined;
  let accountId: string | undefined;
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    // Skip the commented `# MEMWAL_*` backup lines the script writes.
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq);
    const v = line.slice(eq + 1);
    if (k === "MEMWAL_ED25519_KEY") key = v;
    else if (k === "MEMWAL_ACCOUNT_ID") accountId = v;
  }
  if (!key || !accountId) return null;
  process.env.MEMWAL_ED25519_KEY = key;
  process.env.MEMWAL_ACCOUNT_ID = accountId;
  return { key, accountId };
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Refresh is disabled in production." }, { status: 403 });
  }
  if (!isMemWalEnabled()) {
    return NextResponse.json(
      { error: "MemWal is not enabled (set ENABLE_MEMWAL=true)." },
      { status: 400 }
    );
  }
  if (refreshInFlight) {
    return NextResponse.json(
      { error: "A refresh is already running. Please wait." },
      { status: 409 }
    );
  }
  refreshInFlight = true;

  try {
    const cwd = process.cwd();
    const tsxBin = resolve(cwd, "node_modules/.bin/tsx");
    const scriptPath = resolve(cwd, "scripts/create-memwal-account-and-seed.ts");

    // No flags = create a fresh account and seed all 3 company profiles
    // (Importer, Exporter, Freight Forwarder) with no document memory.
    const { code, stdout, stderr } = await runScript(tsxBin, [scriptPath], cwd, SCRIPT_TIMEOUT_MS);

    if (code !== 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Script exited with code ${code}`,
          stderrTail: tail(stderr, 2000),
          stdoutTail: tail(stdout, 2000),
        },
        { status: 500 }
      );
    }

    const creds = reloadMemwalEnvFromDisk(cwd);
    if (!creds) {
      return NextResponse.json(
        {
          success: false,
          error: "Script succeeded but new MemWal credentials were not found in .env.local.",
          stdoutTail: tail(stdout, 2000),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      accountId: mask(creds.accountId),
      configured: isMemWalConfigured(),
      stdoutTail: tail(stdout, 1500),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  } finally {
    refreshInFlight = false;
  }
}
