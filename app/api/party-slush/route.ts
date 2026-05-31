import { NextResponse } from "next/server";
import {
  isPartySlushSigningEnabled,
  listPartySlushAccountsPublic,
  partySlushKeysConfigured,
} from "@/lib/party-slush-accounts";

export const runtime = "nodejs";

export async function GET() {
  const accounts = listPartySlushAccountsPublic();
  return NextResponse.json({
    configured: partySlushKeysConfigured(),
    signingEnabled: isPartySlushSigningEnabled() && accounts.length === 3,
    accounts,
  });
}
