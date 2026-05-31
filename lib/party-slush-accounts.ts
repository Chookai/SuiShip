import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { DemoEndorsementRole } from "./endorsement-flow";
import { parseEd25519Keypair } from "./sui-keypair";
import {
  SCENARIO_C_EXPORTER,
  SCENARIO_C_FREIGHT_FORWARDER,
  SCENARIO_C_IMPORTER,
} from "./scenario-c-demo-defaults";

export type PartySlushRole = "Exporter" | "Importer" | "Freight Forwarder";

export type PartySlushAccountPublic = {
  role: PartySlushRole;
  company: string;
  address: string;
};

const ENV_KEY_BY_ROLE: Record<PartySlushRole, string> = {
  Exporter: "SUI_SLUSH_EXPORTER_KEY",
  Importer: "SUI_SLUSH_IMPORTER_KEY",
  "Freight Forwarder": "SUI_SLUSH_FREIGHT_FORWARDER_KEY",
};

export const DEFAULT_COMPANY_BY_ROLE: Record<PartySlushRole, string> = {
  Exporter: SCENARIO_C_EXPORTER.company,
  Importer: SCENARIO_C_IMPORTER.company,
  "Freight Forwarder": SCENARIO_C_FREIGHT_FORWARDER.company,
};

const PARTY_ROLES: PartySlushRole[] = ["Exporter", "Importer", "Freight Forwarder"];

export function isPartySlushSigningEnabled(): boolean {
  return process.env.ENABLE_PARTY_SLUSH_SIGNING === "true";
}

export function partySlushKeysConfigured(): boolean {
  return PARTY_ROLES.every((role) => Boolean(getKeyHexForRole(role)));
}

export function getKeyHexForRole(role: PartySlushRole): string | undefined {
  const value = process.env[ENV_KEY_BY_ROLE[role]]?.trim();
  return value || undefined;
}

export function getPartySlushKeypair(role: PartySlushRole): Ed25519Keypair | null {
  const hex = getKeyHexForRole(role);
  if (!hex) return null;
  return parseEd25519Keypair(hex);
}

export function getPartySlushAddress(role: PartySlushRole): string | null {
  return getPartySlushKeypair(role)?.toSuiAddress() ?? null;
}

export function endorsementRoleFromPartySlushRole(
  role: PartySlushRole,
): DemoEndorsementRole | null {
  if (role === "Importer") return "importer";
  if (role === "Freight Forwarder") return "freight_forwarder";
  return null;
}

export function partySlushRoleForEndorsementRole(
  role: string,
): PartySlushRole | null {
  if (role === "exporter") return "Exporter";
  if (role === "importer") return "Importer";
  if (role === "freight_forwarder") return "Freight Forwarder";
  return null;
}

export function partySlushRoleFromMockRole(mockRole: string): PartySlushRole | null {
  if (mockRole === "Exporter" || mockRole === "Importer" || mockRole === "Freight Forwarder") {
    return mockRole;
  }
  return null;
}

export function getPartySlushKeypairForEndorsementRole(
  endorsementRole: string,
): Ed25519Keypair | null {
  const partyRole = partySlushRoleForEndorsementRole(endorsementRole);
  if (!partyRole) return null;
  return getPartySlushKeypair(partyRole);
}

export function listPartySlushAccountsPublic(): PartySlushAccountPublic[] {
  return PARTY_ROLES.map((role) => ({
    role,
    company: DEFAULT_COMPANY_BY_ROLE[role],
    address: getPartySlushAddress(role) ?? "",
  })).filter((account) => account.address.length > 0);
}

export type OnChainPartyAddresses = {
  importerAddress: string;
  exporterAddress: string;
  initiator: string;
};

/** Prefer configured slush wallets for Scenario C parties; caller supplies server initiator. */
export function resolveOnChainPartyAddresses(initiator: string): OnChainPartyAddresses | null {
  const exporterAddress = getPartySlushAddress("Exporter");
  const importerAddress = getPartySlushAddress("Importer");
  if (!exporterAddress || !importerAddress) return null;
  return { importerAddress, exporterAddress, initiator };
}

export function generatePartySlushKeypair(): { address: string; secretKey: string } {
  const keypair = Ed25519Keypair.generate();
  const secretKey = keypair.getSecretKey();
  return { address: keypair.toSuiAddress(), secretKey };
}
