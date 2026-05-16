import { Transaction } from "@mysten/sui/transactions";
import type { ShipmentDocument } from "@/lib/demo-data";

export const SUI_NETWORK = "testnet";
export const PACKAGE_ID = process.env.NEXT_PUBLIC_SUISHIP_PACKAGE_ID || "0xTODO_PUBLISH_PACKAGE";
export const MODULE_NAME = "shipment_passport";

type CreatePassportInput = {
  shipmentId: string;
  shipper: string;
  consignee: string;
  origin: string;
  destination: string;
  carrier: string;
  transportMode: string;
  aiScore: number;
  riskLevel: string;
  documents: ShipmentDocument[];
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
      tx.pure.string(input.shipper),
      tx.pure.string(input.consignee),
      tx.pure.string(input.origin),
      tx.pure.string(input.destination),
      tx.pure.string(input.carrier),
      tx.pure.string(input.transportMode),
      tx.pure.u64(input.aiScore),
      tx.pure.string(input.riskLevel),
      tx.pure.vector("string", input.documents.map((document) => document.hash)),
      tx.pure.vector("string", input.documents.map((document) => document.storageUri)),
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
