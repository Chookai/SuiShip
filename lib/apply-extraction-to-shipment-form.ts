import type { AggregateResult } from "@/src/agent/schemas/aggregate-result";

export type ShipmentDetailsForm = {
  shipmentId: string;
  origin: string;
  originPort: string;
  destination: string;
  destinationPort: string;
  carrier: string;
  transportMode: string;
  incoterm: string;
  etd: string;
  eta: string;
  declaredValue: string;
  currency: string;
  bookingRef: string;
  paymentTerms: string;
  blType: string;
};

export type CargoDetailsForm = {
  description: string;
  sku: string;
  hsCode: string;
  quantity: string;
  grossWeight: string;
  netWeight: string;
  handlingUnits: string;
  container: string;
  seal: string;
  countryOfOrigin: string;
  dangerousGoods: string;
  temperatureControlled: string;
};

function fmtWeight(w: { value: number | null; unit: string | null } | null | undefined): string | null {
  if (!w || w.value == null) return null;
  return `${w.value}${w.unit ? ` ${w.unit}` : ""}`;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function pickPrimaryInvoice(result: AggregateResult) {
  return result.detected.commercial_invoice[0]?.extraction_result.document_type === "commercial_invoice"
    ? result.detected.commercial_invoice[0].extraction_result.data
    : null;
}

function pickPrimaryBol(result: AggregateResult) {
  return result.detected.bill_of_lading[0]?.extraction_result.document_type === "bill_of_lading"
    ? result.detected.bill_of_lading[0].extraction_result.data
    : null;
}

function pickPrimaryPacking(result: AggregateResult) {
  return result.detected.packing_list[0]?.extraction_result.document_type === "packing_list"
    ? result.detected.packing_list[0].extraction_result.data
    : null;
}

function pickPrimaryCoo(result: AggregateResult) {
  return result.detected.certificate_of_origin[0]?.extraction_result.document_type === "certificate_of_origin"
    ? result.detected.certificate_of_origin[0].extraction_result.data
    : null;
}

/**
 * Maps aggregated document extraction into shipment + cargo form fields.
 * Only overwrites empty fields unless `overwrite` is true.
 */
export function applyExtractionToShipmentForm(
  result: AggregateResult,
  current: { details: ShipmentDetailsForm; cargo: CargoDetailsForm },
  options?: { overwrite?: boolean }
): { details: ShipmentDetailsForm; cargo: CargoDetailsForm; filledCount: number } {
  const overwrite = options?.overwrite ?? true;
  const inv = pickPrimaryInvoice(result);
  const bol = pickPrimaryBol(result);
  const pl = pickPrimaryPacking(result);
  const coo = pickPrimaryCoo(result);
  const line = inv?.line_items?.[0];

  const patches: Partial<ShipmentDetailsForm> = {};
  const cargoPatches: Partial<CargoDetailsForm> = {};

  const originFromParty =
    inv?.sender?.country ??
    bol?.shipper?.country ??
    coo?.exporter?.country ??
    null;
  const destFromParty =
    inv?.recipient?.country ??
    bol?.consignee?.country ??
    coo?.importer?.country ??
    null;

  if (originFromParty) patches.origin = originFromParty;
  if (bol?.port_of_loading) patches.originPort = bol.port_of_loading;
  else if (inv?.sender?.city) patches.originPort = `${inv.sender.city}${inv.sender.state ? `, ${inv.sender.state}` : ""}`;

  if (destFromParty) patches.destination = destFromParty;
  if (bol?.port_of_discharge) patches.destinationPort = bol.port_of_discharge;
  else if (inv?.recipient?.city) patches.destinationPort = inv.recipient.city;

  if (bol?.carrier) patches.carrier = bol.carrier;
  if (inv?.incoterms) patches.incoterm = inv.incoterms;
  if (bol?.shipment_date) patches.etd = bol.shipment_date;
  else if (pl?.ship_date) patches.etd = pl.ship_date;
  if (inv?.totals?.total_invoice_amount != null) patches.declaredValue = String(inv.totals.total_invoice_amount);
  if (inv?.currency) patches.currency = inv.currency;
  if (bol?.bl_number) patches.bookingRef = bol.bl_number;
  else if (inv?.sender_reference) patches.bookingRef = inv.sender_reference;
  if (inv?.payment_terms) patches.paymentTerms = inv.payment_terms;
  if (bol?.bl_type) patches.blType = bol.bl_type;

  const transportHint = (bol?.carrier ?? "").toLowerCase();
  patches.transportMode = transportHint.includes("air") || transportHint.includes("awb") ? "Air" : "Sea";

  if (line?.description) cargoPatches.description = line.description;
  if (line?.hs_code) cargoPatches.hsCode = line.hs_code;
  if (line?.quantity != null) cargoPatches.quantity = String(line.quantity);
  const gross = fmtWeight(pl?.totals?.total_gross_weight);
  if (gross) cargoPatches.grossWeight = gross;
  const net = fmtWeight(pl?.totals?.total_net_weight ?? inv?.totals?.total_net_weight);
  if (net) cargoPatches.netWeight = net;
  if (pl?.totals?.total_packages != null) {
    cargoPatches.handlingUnits = `${pl.totals.total_packages} Cartons`;
  }
  if (coo?.country_of_origin) cargoPatches.countryOfOrigin = coo.country_of_origin;
  else if (line?.country_of_origin) cargoPatches.countryOfOrigin = line.country_of_origin;

  function merge<T extends Record<string, string>>(base: T, patch: Partial<T>): T {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (!value) continue;
      const k = key as keyof T;
      if (overwrite || !str(out[k])) {
        out[k] = value as T[keyof T];
      }
    }
    return out;
  }

  const details = merge(current.details, patches);
  const cargo = merge(current.cargo, cargoPatches);
  const filledCount =
    Object.keys(patches).length +
    Object.keys(cargoPatches).length;

  return { details, cargo, filledCount };
}
