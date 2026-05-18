import { z } from "zod";
import { DocumentTypeSchema } from "./base";
import { CommercialInvoiceDataSchema } from "./commercial-invoice";
import { PackingListDataSchema } from "./packing-list";
import { BillOfLadingDataSchema } from "./bill-of-lading";
import { CertificateOfOriginDataSchema } from "./certificate-of-origin";

/**
 * Discriminated union on `document_type`. This is the contract Haiku must produce.
 * Using z.discriminatedUnion gives you type-narrowing in TS: once you check
 * `result.document_type === "commercial_invoice"`, TS knows `result.data` is invoice data.
 */
export const ExtractionResultSchema = z.discriminatedUnion("document_type", [
  z.object({
    document_type: z.literal("commercial_invoice"),
    confidence: z.number().min(0).max(1),
    extraction_notes: z.array(z.string()),
    data: CommercialInvoiceDataSchema,
  }),
  z.object({
    document_type: z.literal("packing_list"),
    confidence: z.number().min(0).max(1),
    extraction_notes: z.array(z.string()),
    data: PackingListDataSchema,
  }),
  z.object({
    document_type: z.literal("bill_of_lading"),
    confidence: z.number().min(0).max(1),
    extraction_notes: z.array(z.string()),
    data: BillOfLadingDataSchema,
  }),
  z.object({
    document_type: z.literal("certificate_of_origin"),
    confidence: z.number().min(0).max(1),
    extraction_notes: z.array(z.string()),
    data: CertificateOfOriginDataSchema,
  }),
  z.object({
    document_type: z.literal("unknown"),
    confidence: z.number().min(0).max(1),
    extraction_notes: z.array(z.string()),
    data: z.null(),
  }),
]);
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * What a single extracted file looks like as it flows through the aggregator.
 * Wraps ExtractionResult with file-level metadata.
 */
export const ExtractedDocSchema = z.object({
  file_id: z.string(),                  // your internal ID
  file_name: z.string(),                // original upload filename
  file_size_bytes: z.number(),
  extraction_result: ExtractionResultSchema,
  haiku_latency_ms: z.number(),
  haiku_input_tokens: z.number(),
  haiku_output_tokens: z.number(),
  retries: z.number(),
  error: z.string().nullable(),         // populated only if extraction itself failed
});
export type ExtractedDoc = z.infer<typeof ExtractedDocSchema>;

// Re-export for convenience
export { DocumentTypeSchema };
