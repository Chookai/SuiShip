/**
 * Asserts all required env vars are present before the E2E suite starts.
 * Fails fast with a clear human-readable list of what's missing.
 */
export function checkEnv(): void {
  const required: Record<string, string> = {
    ANTHROPIC_API_KEY: "Anthropic API key — get from console.anthropic.com",
    SUI_PRIVATE_KEY: "Server-side Sui private key for endorsement signing",
    SUI_SLUSH_EXPORTER_KEY: "Exporter party-slush Sui private key",
    SUI_SLUSH_IMPORTER_KEY: "Importer party-slush Sui private key",
    SUI_SLUSH_FREIGHT_FORWARDER_KEY: "Freight Forwarder party-slush Sui private key",
    MEMWAL_ED25519_KEY: "MemWal Ed25519 delegate private key (hex)",
    MEMWAL_ACCOUNT_ID: "MemWal account object ID on Sui",
    MEMWAL_SERVER_URL: "MemWal relayer URL",
    MEMWAL_REGISTRY_ID: "MemWal registry object ID",
    NEXT_PUBLIC_SUISHIP_PACKAGE_ID: "Deployed Sui Move package ID",
  };

  const missing = Object.entries(required)
    .filter(([key]) => !process.env[key])
    .map(([key, desc]) => `  ${key}: ${desc}`);

  if (missing.length > 0) {
    throw new Error(
      `E2E pre-flight: missing required env vars in .env.local:\n${missing.join("\n")}\n`
    );
  }

  // Warn about optional vars
  const optional = ["SERPAPI_API_KEY", "AIS_BASE_URL", "SEAL_ENABLED"];
  const missing_optional = optional.filter((k) => !process.env[k]);
  if (missing_optional.length > 0) {
    console.warn(`[env-check] Optional vars not set (degraded mode acceptable): ${missing_optional.join(", ")}`);
  }
}
