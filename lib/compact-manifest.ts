import type Database from "better-sqlite3";
import type { AggregateResult } from "@/src/agent/schemas/aggregate-result";

type ExtractionRunRow = {
  id: string;
  aggregate_json: string;
  created_at: string;
};

/**
 * Builds the compact manifest (~1K tokens) for a shipment from its latest
 * non-superseded extraction run stored in SQLite.
 *
 * Returns null if no extraction run exists yet.
 */
export function buildCompactManifest(shipmentId: string, db: Database.Database): string | null {
  const row = db
    .prepare(
      `SELECT id, aggregate_json, created_at FROM extraction_runs
       WHERE shipment_id = ? AND is_superseded = 0
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(shipmentId) as ExtractionRunRow | undefined;

  if (!row) return null;

  try {
    const agg = JSON.parse(row.aggregate_json) as AggregateResult;
    return buildDocSummaryFromAggregate(agg);
  } catch {
    return null;
  }
}

export function buildDocSummaryFromAggregate(agg: AggregateResult): string {
  const summary: Record<string, unknown> = {};

  const inv = agg.detected.commercial_invoice[0];
  if (inv?.extraction_result.document_type === "commercial_invoice") {
    const d = inv.extraction_result.data;
    summary.commercial_invoice = {
      file: inv.file_name,
      invoice_number: d.invoice_number,
      invoice_date: d.invoice_date,
      sender_reference: d.sender_reference,
      shipper_name: d.sender?.name,
      recipient_name: d.recipient?.name,
      recipient_city: d.recipient?.city,
      city_of_liability: d.city_of_liability,
      incoterms: d.incoterms,
      currency: d.currency,
      total_invoice_amount: d.totals?.total_invoice_amount,
      total_net_weight: d.totals?.total_net_weight,
      line_items: d.line_items?.map((li) => ({
        description: li.description,
        hs_code: li.hs_code,
        country_of_origin: li.country_of_origin,
        quantity: li.quantity,
        subtotal: li.subtotal,
      })),
    };
  }

  const pl = agg.detected.packing_list[0];
  if (pl?.extraction_result.document_type === "packing_list") {
    const d = pl.extraction_result.data;
    summary.packing_list = {
      file: pl.file_name,
      packing_list_number: d.packing_list_number,
      invoice_number: d.invoice_number,
      ship_date: d.ship_date,
      shipper_name: d.shipper?.name,
      consignee_name: d.consignee?.name,
      consignee_city: d.consignee?.city,
      total_packages: d.totals?.total_packages,
      total_gross_weight: d.totals?.total_gross_weight,
      total_net_weight: d.totals?.total_net_weight,
    };
  }

  const bol = agg.detected.bill_of_lading[0];
  if (bol?.extraction_result.document_type === "bill_of_lading") {
    const d = bol.extraction_result.data;
    const bolTotalPackages = d.cargo?.reduce((s, c) => s + (c.number_of_packages ?? 0), 0) ?? null;
    const bolTotalGrossWeightKg =
      d.cargo?.reduce(
        (s, c) => (c.gross_weight?.unit === "kg" ? s + (c.gross_weight.value ?? 0) : s),
        0
      ) ?? null;
    summary.bill_of_lading = {
      file: bol.file_name,
      bl_number: d.bl_number,
      invoice_reference: d.invoice_reference,
      shipper_name: d.shipper?.name,
      consignee_name: d.consignee?.name,
      carrier: d.carrier,
      port_of_loading: d.port_of_loading,
      port_of_discharge: d.port_of_discharge,
      shipment_date: d.shipment_date,
      total_cargo_packages: bolTotalPackages,
      total_cargo_gross_weight_kg: bolTotalGrossWeightKg,
    };
  }

  const coo = agg.detected.certificate_of_origin[0];
  if (coo?.extraction_result.document_type === "certificate_of_origin") {
    const d = coo.extraction_result.data;
    summary.certificate_of_origin = {
      file: coo.file_name,
      certificate_number: d.certificate_number,
      issue_date: d.issue_date,
      country_of_origin: d.country_of_origin,
      exporter_name: d.exporter?.name,
      importer_name: d.importer?.name,
      goods: d.goods?.map((g) => ({
        hs_code: g.hs_code,
        description: g.description,
        invoice_reference: g.invoice_reference,
        quantity: g.quantity,
      })),
    };
  }

  return JSON.stringify(summary, null, 2);
}
