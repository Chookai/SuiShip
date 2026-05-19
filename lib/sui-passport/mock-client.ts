import { createHash, randomUUID } from "node:crypto";
import pino from "pino";
import type Database from "better-sqlite3";
import type {
  SuiPassportClient,
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

const logger = pino({ name: "mock-sui-passport" });

type PassportRow = {
  passport_id: string;
  owner_address: string;
  shipment_id: string;
  memwal_space_id: string;
  walrus_blob_ids: string;
  manifest_hash: string;
  metadata_json: string;
  minted_at: string;
  tx_digest: string;
};

type GrantRow = {
  grant_id: string;
  passport_id: string;
  grantor_address: string;
  grantee_address: string;
  scope: string;
  expires_at: string | null;
  revoked_at: string | null;
  tx_digest: string;
  created_at: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function simulatedLatency(): Promise<void> {
  return sleep(200 + Math.random() * 300);
}

function fakeTxDigest(): string {
  return "0xmocktx_" + randomUUID().replace(/-/g, "");
}

function deterministicPassportId(owner: string, shipmentId: string): string {
  const hash = createHash("sha256").update(`${owner}|${shipmentId}`).digest("hex");
  return "0xmock_" + hash.slice(0, 32);
}

function rowToGrant(row: GrantRow): Grant {
  return {
    grantId: row.grant_id,
    granteeAddress: row.grantee_address,
    scope: row.scope as MemWalAccessScope,
    expiresAt: row.expires_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    txDigest: row.tx_digest,
    createdAt: row.created_at,
  };
}

export class MockSuiPassportClient implements SuiPassportClient {
  constructor(private readonly db: Database.Database) {}

  async mintPassport(input: MintPassportInput): Promise<MintPassportResult> {
    const start = Date.now();
    await simulatedLatency();

    const errorRate = parseFloat(process.env.MOCK_SUI_ERROR_RATE ?? "0");
    if (Math.random() < errorRate) {
      throw new Error("Mock Sui error: random failure (MOCK_SUI_ERROR_RATE)");
    }

    const passportId = deterministicPassportId(input.owner, input.shipmentId);
    const txDigest = fakeTxDigest();
    const mintedAt = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO mock_sui_passports
        (passport_id, owner_address, shipment_id, memwal_space_id,
         walrus_blob_ids, manifest_hash, metadata_json, minted_at, tx_digest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      passportId,
      input.owner,
      input.shipmentId,
      input.memWalSpaceId,
      JSON.stringify(input.walrusBlobIds),
      input.manifestHash,
      JSON.stringify(input.metadata ?? {}),
      mintedAt,
      txDigest
    );

    logger.info({ method: "mintPassport", passportId, durationMs: Date.now() - start });
    return { passportId, txDigest, mintedAt };
  }

  async getPassport(passportId: string): Promise<PassportRecord> {
    const start = Date.now();
    await simulatedLatency();

    const row = this.db
      .prepare("SELECT * FROM mock_sui_passports WHERE passport_id = ?")
      .get(passportId) as PassportRow | undefined;

    if (!row) throw new Error(`Passport not found: ${passportId}`);

    const grantRows = this.db
      .prepare("SELECT * FROM mock_sui_grants WHERE passport_id = ? AND revoked_at IS NULL")
      .all(passportId) as GrantRow[];

    logger.info({ method: "getPassport", passportId, durationMs: Date.now() - start });

    return {
      passportId: row.passport_id,
      owner: row.owner_address,
      shipmentId: row.shipment_id,
      memWalSpaceId: row.memwal_space_id,
      walrusBlobIds: JSON.parse(row.walrus_blob_ids),
      manifestHash: row.manifest_hash,
      grants: grantRows.map(rowToGrant),
      mintedAt: row.minted_at,
      txDigest: row.tx_digest,
    };
  }

  async grantAccess(input: GrantAccessInput): Promise<GrantAccessResult> {
    const start = Date.now();
    await simulatedLatency();

    const passport = this.db
      .prepare("SELECT owner_address FROM mock_sui_passports WHERE passport_id = ?")
      .get(input.passportId) as { owner_address: string } | undefined;

    if (!passport) throw new Error(`Passport not found: ${input.passportId}`);

    const grantId = "0xgrant_" + randomUUID().replace(/-/g, "");
    const txDigest = fakeTxDigest();

    this.db.prepare(`
      INSERT INTO mock_sui_grants
        (grant_id, passport_id, grantor_address, grantee_address, scope, expires_at, tx_digest)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      grantId,
      input.passportId,
      passport.owner_address,
      input.granteeAddress,
      input.scope,
      input.expiresAt ?? null,
      txDigest
    );

    logger.info({ method: "grantAccess", passportId: input.passportId, grantId, scope: input.scope, durationMs: Date.now() - start });
    return { grantId, txDigest };
  }

  async revokeAccess(input: RevokeAccessInput): Promise<{ txDigest: string }> {
    const start = Date.now();
    await simulatedLatency();

    const txDigest = fakeTxDigest();
    const revokedAt = new Date().toISOString();

    this.db.prepare(`
      UPDATE mock_sui_grants SET revoked_at = ?, tx_digest = ?
      WHERE grant_id = ? AND passport_id = ?
    `).run(revokedAt, txDigest, input.grantId, input.passportId);

    logger.info({ method: "revokeAccess", passportId: input.passportId, grantId: input.grantId, durationMs: Date.now() - start });
    return { txDigest };
  }

  async listGrants(passportId: string): Promise<Grant[]> {
    const start = Date.now();
    await simulatedLatency();

    const rows = this.db
      .prepare("SELECT * FROM mock_sui_grants WHERE passport_id = ? ORDER BY created_at DESC")
      .all(passportId) as GrantRow[];

    logger.info({ method: "listGrants", passportId, count: rows.length, durationMs: Date.now() - start });
    return rows.map(rowToGrant);
  }

  async transferPassport(input: TransferPassportInput): Promise<{ txDigest: string }> {
    const start = Date.now();
    await simulatedLatency();

    const txDigest = fakeTxDigest();
    this.db.prepare(
      "UPDATE mock_sui_passports SET owner_address = ? WHERE passport_id = ?"
    ).run(input.toAddress, input.passportId);

    logger.info({ method: "transferPassport", passportId: input.passportId, toAddress: input.toAddress, durationMs: Date.now() - start });
    return { txDigest };
  }

  async checkScope(
    requestorAddress: string,
    passportId: string,
    scope: MemWalAccessScope
  ): Promise<boolean> {
    const passport = this.db
      .prepare("SELECT owner_address FROM mock_sui_passports WHERE passport_id = ?")
      .get(passportId) as { owner_address: string } | undefined;

    if (!passport) return false;
    if (passport.owner_address === requestorAddress) return true;
    if (scope === "full") return false;

    const now = new Date().toISOString();
    const grant = this.db.prepare(`
      SELECT grant_id FROM mock_sui_grants
      WHERE passport_id = ? AND grantee_address = ?
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > ?)
        AND (scope = ? OR scope = 'full')
    `).get(passportId, requestorAddress, now, scope) as { grant_id: string } | undefined;

    return grant !== undefined;
  }
}
