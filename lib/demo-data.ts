import { stableHash } from "@/lib/utils";

export type RiskLevel = "Low" | "Medium" | "High";
export type ShipmentStatus =
  | "Draft"
  | "Documents Uploaded"
  | "AI Verified"
  | "Customs Ready"
  | "Needs Review"
  | "Customs Cleared";

export type ShipmentDocument = {
  name: string;
  kind: string;
  hash: string;
  storageUri: string;
  verified: boolean;
};

export type ShipmentPassport = {
  id: string;
  objectId?: string;
  shipper: string;
  consignee: string;
  origin: string;
  destination: string;
  carrier: string;
  transportMode: string;
  incoterm: string;
  cargo: string;
  declaredValue: string;
  status: ShipmentStatus;
  aiScore: number;
  riskLevel: RiskLevel;
  documents: ShipmentDocument[];
  createdAt: string;
  updatedAt: string;
  owner: string;
};

export type ExtractionResult = {
  label: string;
  value: string;
  confidence: number;
};

export const demoShipments: ShipmentPassport[] = [
  {
    id: "SS-MY-US-0001",
    objectId: "0x9f4c...4e12",
    shipper: "Acme Robotics LLC",
    consignee: "Shanghai Smart Imports Co Ltd",
    origin: "Malaysia",
    destination: "United States",
    carrier: "DHL Global Forwarding",
    transportMode: "Air freight",
    incoterm: "DAP",
    cargo: "Semiconductor components",
    declaredValue: "USD 148,200",
    status: "Customs Ready",
    aiScore: 96,
    riskLevel: "Low",
    createdAt: "2026-05-10 09:42",
    updatedAt: "2026-05-13 14:18",
    owner: "0x4a3d...92bc",
    documents: [
      doc("Commercial Invoice", "Invoice", "SS-MY-US-0001"),
      doc("Packing List", "Packing List", "SS-MY-US-0001"),
      doc("Air Waybill", "Transport", "SS-MY-US-0001")
    ]
  },
  {
    id: "SS-SG-DE-0002",
    objectId: "0x8b21...77af",
    shipper: "Crescent MedTech Pte Ltd",
    consignee: "Helios Klinik Einkauf GmbH",
    origin: "Singapore",
    destination: "Germany",
    carrier: "Maersk",
    transportMode: "Ocean freight",
    incoterm: "CIF",
    cargo: "Medical devices",
    declaredValue: "EUR 92,700",
    status: "Needs Review",
    aiScore: 81,
    riskLevel: "Medium",
    createdAt: "2026-05-08 16:20",
    updatedAt: "2026-05-12 11:05",
    owner: "0xa18c...21f0",
    documents: [
      doc("Commercial Invoice", "Invoice", "SS-SG-DE-0002"),
      doc("Certificate of Conformity", "Compliance", "SS-SG-DE-0002"),
      doc("Bill of Lading", "Transport", "SS-SG-DE-0002")
    ]
  },
  {
    id: "SS-CN-AE-0003",
    objectId: "0x2c73...a908",
    shipper: "Shenzhen Alto Electronics Co.",
    consignee: "Emirates Retail Distribution LLC",
    origin: "China",
    destination: "UAE",
    carrier: "FedEx",
    transportMode: "Air freight",
    incoterm: "FOB",
    cargo: "Consumer electronics",
    declaredValue: "USD 67,500",
    status: "Documents Uploaded",
    aiScore: 89,
    riskLevel: "Low",
    createdAt: "2026-05-11 08:15",
    updatedAt: "2026-05-11 13:30",
    owner: "0x62de...0bb9",
    documents: [
      doc("Commercial Invoice", "Invoice", "SS-CN-AE-0003"),
      doc("Packing List", "Packing List", "SS-CN-AE-0003")
    ]
  }
];

export const extractionResults: ExtractionResult[] = [
  { label: "Invoice number", value: "INV-2026-48192", confidence: 98 },
  { label: "HS code", value: "8542.31", confidence: 94 },
  { label: "Quantity", value: "2,400 units", confidence: 97 },
  { label: "Declared value", value: "USD 148,200", confidence: 96 },
  { label: "Country of origin", value: "Malaysia", confidence: 99 },
  { label: "Incoterm", value: "DAP", confidence: 93 },
  { label: "Gross weight", value: "820 kg", confidence: 91 },
  { label: "Consignee", value: "Shanghai Smart Imports Co Ltd", confidence: 95 }
];

export function findShipment(id: string) {
  return demoShipments.find(
    (shipment) =>
      shipment.id.toLowerCase() === id.toLowerCase() ||
      shipment.objectId?.toLowerCase() === id.toLowerCase()
  );
}

function doc(name: string, kind: string, shipmentId: string): ShipmentDocument {
  const slug = `${shipmentId}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    name,
    kind,
    hash: stableHash(slug),
    storageUri: `walrus://demo-${slug}`,
    verified: true
  };
}
