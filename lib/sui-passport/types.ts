export type MemWalAccessScope =
  | "full"
  | "commercial_fields"
  | "origin_fields"
  | "transport_fields"
  | "document_hashes_only";

export type Grant = {
  grantId: string;
  granteeAddress: string;
  scope: MemWalAccessScope;
  expiresAt?: string;
  revokedAt?: string;
  txDigest: string;
  createdAt: string;
};

export type PassportRecord = {
  passportId: string;
  owner: string;
  shipmentId: string;
  memWalSpaceId: string;
  walrusBlobIds: string[];
  manifestHash: string;
  grants: Grant[];
  mintedAt: string;
  txDigest: string;
};

export type MintPassportInput = {
  owner: string;
  shipmentId: string;
  memWalSpaceId: string;
  walrusBlobIds: string[];
  manifestHash: string;
  metadata?: Record<string, string>;
};

export type MintPassportResult = {
  passportId: string;
  txDigest: string;
  mintedAt: string;
};

export type GrantAccessInput = {
  passportId: string;
  granteeAddress: string;
  scope: MemWalAccessScope;
  expiresAt?: string;
};

export type GrantAccessResult = {
  grantId: string;
  txDigest: string;
};

export type RevokeAccessInput = {
  passportId: string;
  grantId: string;
};

export type TransferPassportInput = {
  passportId: string;
  toAddress: string;
};

export interface SuiPassportClient {
  mintPassport(input: MintPassportInput): Promise<MintPassportResult>;
  getPassport(passportId: string): Promise<PassportRecord>;
  grantAccess(input: GrantAccessInput): Promise<GrantAccessResult>;
  revokeAccess(input: RevokeAccessInput): Promise<{ txDigest: string }>;
  listGrants(passportId: string): Promise<Grant[]>;
  transferPassport(input: TransferPassportInput): Promise<{ txDigest: string }>;
  checkScope(requestorAddress: string, passportId: string, scope: MemWalAccessScope): Promise<boolean>;
}
