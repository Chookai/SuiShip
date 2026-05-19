import type { ExtractedDoc } from "@/src/agent/schemas/extraction-result";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

type ChunkInsert = {
  id: string;
  shipmentId: string;
  sha256: string;
  docType: string;
  chunkIndex: number;
  chunkText: string;
  fieldTags: string[];
};

/**
 * Extracts field-tagged text chunks from an ExtractedDoc and writes them to
 * the embedding_chunks table. Idempotent — skips if sha256 already has chunks
 * for this shipment.
 */
export function storeChunks(
  doc: ExtractedDoc,
  sha256: string,
  shipmentId: string,
  db: Database.Database
): void {
  const existing = db
    .prepare("SELECT COUNT(*) as n FROM embedding_chunks WHERE shipment_id = ? AND sha256 = ?")
    .get(shipmentId, sha256) as { n: number };
  if (existing.n > 0) return;

  const chunks = extractChunks(doc, shipmentId, sha256);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO embedding_chunks
      (id, shipment_id, sha256, doc_type, chunk_index, chunk_text, field_tags)
    VALUES (@id, @shipmentId, @sha256, @docType, @chunkIndex, @chunkText, @fieldTags)
  `);

  const insertMany = db.transaction((rows: ChunkInsert[]) => {
    for (const row of rows) {
      insert.run({
        id: row.id,
        shipmentId: row.shipmentId,
        sha256: row.sha256,
        docType: row.docType,
        chunkIndex: row.chunkIndex,
        chunkText: row.chunkText,
        fieldTags: JSON.stringify(row.fieldTags),
      });
    }
  });

  insertMany(chunks);
}

function extractChunks(
  doc: ExtractedDoc,
  shipmentId: string,
  sha256: string
): ChunkInsert[] {
  const dt = doc.extraction_result.document_type;
  const chunks: ChunkInsert[] = [];
  let idx = 0;

  const push = (text: string, tags: string[]) => {
    if (!text?.trim()) return;
    chunks.push({
      id: randomUUID(),
      shipmentId,
      sha256,
      docType: dt,
      chunkIndex: idx++,
      chunkText: text.trim(),
      fieldTags: tags,
    });
  };

  if (dt === "commercial_invoice") {
    const d = doc.extraction_result.data;
    push(`Invoice number: ${d.invoice_number ?? "N/A"}`, ["invoice_number"]);
    push(`Invoice date: ${d.invoice_date ?? "N/A"}`, ["invoice_date"]);
    push(`Shipper: ${d.sender?.name ?? "N/A"}, ${d.sender?.country ?? ""}`, ["shipper_name", "shipper"]);
    push(`Consignee: ${d.recipient?.name ?? "N/A"}, ${d.recipient?.city ?? ""}`, ["consignee_name", "consignee"]);
    push(`Incoterms: ${d.incoterms ?? "N/A"}, Currency: ${d.currency ?? "N/A"}`, ["incoterms", "currency"]);
    push(
      `Total invoice amount: ${d.totals?.total_invoice_amount ?? "N/A"} ${d.currency ?? ""}`,
      ["declared_value", "total_invoice_amount"]
    );
    push(
      `Gross weight: ${d.totals?.total_gross_weight ?? "N/A"}, Net weight: ${d.totals?.total_net_weight ?? "N/A"}`,
      ["gross_weight", "net_weight"]
    );
    if (d.line_items?.length) {
      const hsText = d.line_items.map((li) => `HS: ${li.hs_code ?? "?"} (${li.description ?? "?"}) COO: ${li.country_of_origin ?? "?"}`).join("; ");
      push(hsText, ["hs_code", "country_of_origin"]);
    }
  } else if (dt === "packing_list") {
    const d = doc.extraction_result.data;
    push(`Packing list number: ${d.packing_list_number ?? "N/A"}, Invoice ref: ${d.invoice_number ?? "N/A"}`, ["packing_list_number", "invoice_number"]);
    push(`Shipper: ${d.shipper?.name ?? "N/A"}`, ["shipper_name"]);
    push(`Consignee: ${d.consignee?.name ?? "N/A"}, ${d.consignee?.city ?? ""}`, ["consignee_name"]);
    push(`Total packages: ${d.totals?.total_packages ?? "N/A"}, Gross weight: ${d.totals?.total_gross_weight ?? "N/A"}, Net weight: ${d.totals?.total_net_weight ?? "N/A"}`, ["total_packages", "gross_weight", "net_weight"]);
  } else if (dt === "bill_of_lading") {
    const d = doc.extraction_result.data;
    push(`BL number: ${d.bl_number ?? "N/A"}, Booking: ${d.booking_number ?? "N/A"}`, ["bl_number"]);
    push(`Shipper: ${d.shipper?.name ?? "N/A"}`, ["shipper_name"]);
    push(`Consignee: ${d.consignee?.name ?? "N/A"}`, ["consignee_name"]);
    push(`Port of loading: ${d.port_of_loading ?? "N/A"}, Port of discharge: ${d.port_of_discharge ?? "N/A"}`, ["port_of_loading", "port_of_discharge"]);
    push(`Carrier: ${d.carrier ?? "N/A"}, Shipment date: ${d.shipment_date ?? "N/A"}`, ["carrier", "shipment_date"]);
    if (d.cargo?.length) {
      const cargoText = d.cargo.map((c) => `HS: ${c.hs_code ?? "?"}, Packages: ${c.number_of_packages ?? "?"},  Weight: ${c.gross_weight?.value ?? "?"} ${c.gross_weight?.unit ?? ""}`).join("; ");
      push(cargoText, ["hs_code", "gross_weight", "total_packages"]);
    }
  } else if (dt === "certificate_of_origin") {
    const d = doc.extraction_result.data;
    push(`Certificate number: ${d.certificate_number ?? "N/A"}, Issue date: ${d.issue_date ?? "N/A"}`, ["certificate_number", "issue_date"]);
    push(`Country of origin: ${d.country_of_origin ?? "N/A"}`, ["country_of_origin"]);
    push(`Exporter: ${d.exporter?.name ?? "N/A"}`, ["exporter_name", "shipper_name"]);
    push(`Importer: ${d.importer?.name ?? "N/A"}`, ["importer_name", "consignee_name"]);
    if (d.goods?.length) {
      const goodsText = d.goods.map((g) => `HS: ${g.hs_code ?? "?"}, ${g.description ?? "?"}`).join("; ");
      push(goodsText, ["hs_code", "country_of_origin"]);
    }
  }

  return chunks;
}
