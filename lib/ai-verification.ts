import type { AiCheck, AiResult, ShipmentRecord } from "./shipments-store";

const FIELD_TO_DOCS: Array<{ field: string; docs: string[]; sourceField?: keyof FlatRecord }> = [
  {
    field: "Invoice number",
    docs: ["Commercial Invoice", "Packing List", "Customs Declaration"],
    sourceField: "invoiceRef"
  },
  {
    field: "HS code",
    docs: ["Commercial Invoice", "Customs Declaration", "Certificate of Origin"],
    sourceField: "hsCode"
  },
  {
    field: "Quantity",
    docs: ["Commercial Invoice", "Packing List", "Air Waybill / Bill of Lading"],
    sourceField: "quantity"
  },
  {
    field: "Declared value",
    docs: ["Commercial Invoice", "Customs Declaration"],
    sourceField: "declaredValue"
  },
  {
    field: "Country of origin",
    docs: ["Certificate of Origin", "Commercial Invoice", "Customs Declaration"],
    sourceField: "countryOfOrigin"
  },
  {
    field: "Importer (consignee)",
    docs: ["Commercial Invoice", "Air Waybill / Bill of Lading", "Customs Declaration"],
    sourceField: "importer"
  },
  {
    field: "Exporter (shipper)",
    docs: ["Commercial Invoice", "Air Waybill / Bill of Lading", "Certificate of Origin"],
    sourceField: "exporter"
  },
  {
    field: "Gross weight",
    docs: ["Packing List", "Air Waybill / Bill of Lading"],
    sourceField: "grossWeight"
  }
];

type FlatRecord = {
  invoiceRef: string;
  hsCode: string;
  quantity: string;
  declaredValue: string;
  countryOfOrigin: string;
  importer: string;
  exporter: string;
  grossWeight: string;
};

export function runAiVerification(shipment: ShipmentRecord): AiResult {
  const flat: FlatRecord = {
    invoiceRef: shipment.id,
    hsCode: shipment.cargo.hsCode,
    quantity: shipment.cargo.quantity,
    declaredValue: `${shipment.shipment.currency} ${shipment.shipment.declaredValue}`,
    countryOfOrigin: shipment.cargo.countryOfOrigin,
    importer: shipment.importer.company,
    exporter: shipment.exporter.company,
    grossWeight: shipment.cargo.grossWeight
  };

  const uploadedDocNames = new Set(shipment.documents.filter((doc) => doc.uploaded).map((doc) => doc.name));
  const requiredDocs = shipment.documents.filter((doc) => doc.required);
  const requiredUploaded = requiredDocs.filter((doc) => doc.uploaded).length;
  const completeness = requiredDocs.length === 0 ? 1 : requiredUploaded / requiredDocs.length;

  const checks: AiCheck[] = FIELD_TO_DOCS.map(({ field, docs, sourceField }) => {
    const presentDocs = docs.filter((name) => uploadedDocNames.has(name));
    const value = sourceField ? flat[sourceField] : undefined;
    if (presentDocs.length === 0) {
      return {
        field,
        status: "missing",
        detail: value ? `No uploaded document carries "${value}". Upload at least one of: ${docs.join(", ")}` : "No source document available for cross-check.",
        documents: docs
      };
    }
    if (presentDocs.length === 1) {
      return {
        field,
        status: "info",
        detail: value
          ? `"${value}" detected in ${presentDocs[0]}. Upload a second source to cross-verify.`
          : `Single source: ${presentDocs[0]}.`,
        documents: presentDocs
      };
    }
    return {
      field,
      status: "matched",
      detail: value
        ? `"${value}" consistent across ${presentDocs.join(", ")}.`
        : `Consistent across ${presentDocs.join(", ")}.`,
      documents: presentDocs
    };
  });

  // Missing required document check.
  const missingDocs = requiredDocs.filter((doc) => !doc.uploaded);
  if (missingDocs.length > 0) {
    checks.unshift({
      field: "Required document set",
      status: "missing",
      detail: `${missingDocs.length} required document(s) not uploaded: ${missingDocs.map((doc) => doc.name).join(", ")}.`,
      documents: missingDocs.map((doc) => doc.name)
    });
  } else {
    checks.unshift({
      field: "Required document set",
      status: "matched",
      detail: `All ${requiredDocs.length} required documents uploaded.`,
      documents: requiredDocs.map((doc) => doc.name)
    });
  }

  const matchedCount = checks.filter((check) => check.status === "matched").length;
  const infoCount = checks.filter((check) => check.status === "info").length;
  const missingCount = checks.filter((check) => check.status === "missing").length;

  // Score = 60% completeness + 40% cross-match strength.
  const matchStrength = checks.length === 0 ? 0 : (matchedCount + infoCount * 0.5) / checks.length;
  const rawScore = completeness * 60 + matchStrength * 40;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  const riskLevel: AiResult["riskLevel"] = score >= 85 ? "Low" : score >= 65 ? "Medium" : "High";

  const summary = missingCount === 0
    ? `All ${matchedCount} cross-document fields aligned.`
    : `${missingCount} field${missingCount === 1 ? "" : "s"} need attention — upload missing docs to lift the score.`;

  return {
    score,
    riskLevel,
    checks,
    ranAt: new Date().toISOString(),
    summary
  };
}
