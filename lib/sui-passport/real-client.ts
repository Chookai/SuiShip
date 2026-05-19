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

/**
 * Stub — throws until the teammate's Move contract is deployed.
 * Implement this class once NEXT_PUBLIC_SUISHIP_PACKAGE_ID is set and
 * the contract is live on testnet. See SUI_CONTRACT_SPEC.md for the
 * exact function signatures and events the contract must expose.
 */
export class RealSuiPassportClient implements SuiPassportClient {
  private readonly notDeployed = (): never => {
    throw new Error(
      "RealSuiPassportClient: Move contract not yet deployed. " +
        "Set SUI_CLIENT=mock or deploy the contract and set NEXT_PUBLIC_SUISHIP_PACKAGE_ID."
    );
  };

  mintPassport(_input: MintPassportInput): Promise<MintPassportResult> { return this.notDeployed(); }
  getPassport(_passportId: string): Promise<PassportRecord> { return this.notDeployed(); }
  grantAccess(_input: GrantAccessInput): Promise<GrantAccessResult> { return this.notDeployed(); }
  revokeAccess(_input: RevokeAccessInput): Promise<{ txDigest: string }> { return this.notDeployed(); }
  listGrants(_passportId: string): Promise<Grant[]> { return this.notDeployed(); }
  transferPassport(_input: TransferPassportInput): Promise<{ txDigest: string }> { return this.notDeployed(); }
  checkScope(_requestorAddress: string, _passportId: string, _scope: MemWalAccessScope): Promise<boolean> { return this.notDeployed(); }
}
