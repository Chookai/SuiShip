#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = portArg?.slice("--port=".length) || process.env.PORT || "3000";
const startDev = process.argv.includes("--dev");
const marketHtmlPath = resolve(process.cwd(), "market.html");

if (!existsSync(marketHtmlPath)) {
  console.error("market.html was not found at the project root.");
  process.exit(1);
}

const origin = `http://localhost:${port}`;
console.log("Market page URLs:");
console.log(`  Raw HTML: ${origin}/market.html`);
console.log(`  React page: ${origin}/market`);

if (!startDev) {
  console.log("\nStart the app with `npm run dev`, or run `npm run market:page -- --dev`.");
  process.exit(0);
}

console.log("\nStarting Next dev server...");
const child = spawn("npm", ["run", "dev", "--", "-p", port], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
