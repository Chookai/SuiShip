import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

function normalizeSecretKey(secretKey: string): string {
  return secretKey.trim();
}

export function parseEd25519Keypair(secretKey: string): Ed25519Keypair {
  const normalized = normalizeSecretKey(secretKey);
  if (!normalized) {
    throw new Error("Secret key is required");
  }
  if (normalized.startsWith("suiprivkey")) {
    return Ed25519Keypair.fromSecretKey(normalized);
  }

  const bytes = Buffer.from(normalized.replace(/^0x/, ""), "hex");
  if (bytes.length !== 32) {
    throw new Error("Secret key must be 32 bytes hex or a bech32 suiprivkey");
  }
  return Ed25519Keypair.fromSecretKey(bytes);
}
