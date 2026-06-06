import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "tests/e2e/artifacts/report" }],
  ],
  use: {
    headless: false,
    launchOptions: { slowMo: 500 },
    video: "on",
    screenshot: "on",
    trace: "on",
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
  },
  outputDir: "tests/e2e/artifacts",
  webServer: {
    command: "npm run start",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
