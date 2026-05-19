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
