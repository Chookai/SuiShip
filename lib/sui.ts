import { Transaction } from "@mysten/sui/transactions";

export const SUI_NETWORK = "testnet";
const DEPLOYED_PACKAGE_ID = "0xa6a570d7d1036900903210098785a7e296ddca8dc5674f1136f156ce6ceb52da";
const configuredPackageId = process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID;

export const PACKAGE_ID =
  configuredPackageId && configuredPackageId.startsWith("0x") && !configuredPackageId.includes("TODO")
    ? configuredPackageId
    : DEPLOYED_PACKAGE_ID;
export const MODULE_NAME = "shipment_passport";

type CreatePassportInput = {
  shipmentId: string;
  importer: string;
  exporter: string;
  walrusBlobId: string;
  memWalSpaceId: string;
  finalValidationMemWalId: string;
  packageHash?: number[] | null;
  verificationScore: number;
  documentCount: number;
};

export function canUsePublishedPackage() {
  return PACKAGE_ID.startsWith("0x") && !PACKAGE_ID.includes("TODO");
}

export function buildCreateShipmentTx(input: CreatePassportInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE_NAME}::create_shipment_passport`,
    arguments: [
      tx.pure.string(input.shipmentId),
      tx.pure.address(input.importer),
      tx.pure.address(input.exporter),
      tx.pure.string(input.walrusBlobId),
      tx.pure.string(input.memWalSpaceId),
      tx.pure.string(input.finalValidationMemWalId),
      tx.pure.option("vector<u8>", input.packageHash ?? null),
      tx.pure.u64(input.verificationScore),
      tx.pure.u64(input.documentCount),
      tx.object("0x6")
    ]
  });
  return tx;
}

export function buildStatusTx(objectId: string, status: "Customs Ready" | "Customs Cleared" | string) {
  const tx = new Transaction();
  const fn =
    status === "Customs Ready"
      ? "mark_customs_ready"
      : status === "Customs Cleared"
        ? "mark_customs_cleared"
        : "update_status";

  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE_NAME}::${fn}`,
    arguments:
      fn === "update_status"
        ? [tx.object(objectId), tx.pure.string(status), tx.object("0x6")]
        : [tx.object(objectId), tx.object("0x6")]
  });
  return tx;
}
