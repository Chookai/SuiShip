import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

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
  endorsementLogId?: string;
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

export type EndorseInput = {
  logObjectId: string;
  role: string;
  action: string;
  noteHash?: string;
};

export type EndorseWithCapInput = {
  logObjectId: string;
  capObjectId: string;
  action: string;
  noteHash?: string;
  signerKeypair?: Ed25519Keypair;
};

export type CreateShipmentInput = {
  shipmentId: string;
  initiator: string;
  importer: string;
  exporter: string;
  template: string;
  manifestDigest: string;
};

export type DocCommitInput = {
  docId: string;
  slotKey: string;
  contentHash: string;
  extractionHash: string;
};

export type GrantRoleInput = {
  passportObjectId: string;
  role: "freight_forwarder" | "customs";
  granteeAddress: string;
};

export interface SuiPassportClient {
  createShipment?(input: CreateShipmentInput): Promise<{ recordId: string; accumulatorId: string; txDigest: string }>;
  primeRecoveredShipmentRecordRef?(shipmentId: string, recordId: string): Promise<void>;
  commitDocument?(
    shipmentId: string,
    docId: string,
    slotKey: string,
    contentHash: string,
    extractionHash: string,
    accumulatorId?: string
  ): Promise<{ txDigest: string }>;
  commitDocumentBatch?(
    shipmentId: string,
    accumulatorId: string,
    docs: DocCommitInput[]
  ): Promise<{ txDigest: string }>;
  mintPassport(input: MintPassportInput): Promise<MintPassportResult>;
  getPassport(passportId: string): Promise<PassportRecord>;
  grantAccess(input: GrantAccessInput): Promise<GrantAccessResult>;
  revokeAccess(input: RevokeAccessInput): Promise<{ txDigest: string }>;
  listGrants(passportId: string): Promise<Grant[]>;
  transferPassport(input: TransferPassportInput): Promise<{ txDigest: string }>;
  checkScope(requestorAddress: string, passportId: string, scope: MemWalAccessScope): Promise<boolean>;
  endorseShipment(input: EndorseInput): Promise<{ txDigest: string }>;
  endorseAsFreightForwarder(input: EndorseWithCapInput): Promise<{ txDigest: string }>;
  endorseAsCustoms(input: EndorseWithCapInput): Promise<{ txDigest: string }>;
  grantRole(input: GrantRoleInput): Promise<{ txDigest: string; capObjectId: string }>;
  getEndorsementLog(logObjectId: string): Promise<{
    passportId: string;
    shipmentId: string;
    importer: string;
    exporter: string;
    endorsements: Array<{ role: string; signer: string; action: string; noteHash: string; signedAtMs: number }>;
  }>;
}
