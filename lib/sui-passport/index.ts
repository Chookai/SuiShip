import { getDb } from "@/lib/db";
import { MockSuiPassportClient } from "./mock-client";
import { RealSuiPassportClient } from "./real-client";
import type { SuiPassportClient } from "./types";

export type { SuiPassportClient } from "./types";
export type {
  Grant,
  GrantAccessInput,
  GrantAccessResult,
  MemWalAccessScope,
  MintPassportInput,
  MintPassportResult,
  PassportRecord,
  RevokeAccessInput,
  TransferPassportInput,
} from "./types";
export { RealSuiPassportClient } from "./real-client";

let _client: SuiPassportClient | null = null;

export function getSuiPassportClient(): SuiPassportClient {
  if (_client) return _client;
  if (process.env.SUI_CLIENT === "real") {
    _client = new RealSuiPassportClient();
  } else {
    _client = new MockSuiPassportClient(getDb());
  }
  return _client;
}

export function isRealSuiConfigured(): boolean {
  return !!(
    process.env.SUI_CLIENT === "real" &&
    process.env.SUI_PRIVATE_KEY &&
    process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID &&
    process.env.NEXT_PUBLIC_REGISTRY_ID
  );
}
