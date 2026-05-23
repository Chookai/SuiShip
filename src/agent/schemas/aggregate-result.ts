import { z } from "zod";
import { DocumentTypeSchema } from "./base";
import { ExtractedDocSchema } from "./extraction-result";

export const ValidationIssueSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  field: z.string(),                    // e.g. "invoice_number"
  message: z.string(),
  affected_files: z.array(z.string()),  // file_ids
  values: z.record(z.string(), z.unknown()),  // {file_id: value} map showing the mismatch
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const AggregateResultSchema = z.object({
  // Detected docs grouped by type
  detected: z.object({
    commercial_invoice: z.array(ExtractedDocSchema),
    packing_list: z.array(ExtractedDocSchema),
    bill_of_lading: z.array(ExtractedDocSchema),
    certificate_of_origin: z.array(ExtractedDocSchema),
  }),
  // Required types not uploaded
  missing: z.array(DocumentTypeSchema),
  // Same type uploaded multiple times — user may need to pick one
  duplicates: z.array(z.object({
    type: DocumentTypeSchema,
    files: z.array(ExtractedDocSchema),
  })),
  // Files Haiku flagged as not shipping docs
  garbage: z.array(z.object({
    file: ExtractedDocSchema,
    reason: z.string(),                 // human-readable, surface this to UI
  })),
  // Low confidence — needs human review even if classified
  low_confidence: z.array(ExtractedDocSchema),
  // Cross-document field consistency issues
  cross_validation: z.array(ValidationIssueSchema),
  // Files where extraction itself crashed (not classification failures)
  errors: z.array(ExtractedDocSchema),
  // Summary stats
  summary: z.object({
    total_files: z.number(),
    successfully_extracted: z.number(),
    is_complete: z.boolean(),           // all 4 required types present & validated
    total_haiku_cost_usd: z.number().nullable(),
  }),
  // Extracted reference from invoice_number or bl_number
  extractedRef: z.string().optional(),
  extractionProvenance: z.array(z.object({
    fileId: z.string(),
    fileName: z.string(),
    sha256: z.string().optional(),
    mode: z.enum(["live_haiku", "cached_haiku", "mock"]),
    model: z.string().nullable(),
    latencyMs: z.number().nullable(),
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
    extractedAt: z.string(),
  })).optional(),
});
export type AggregateResult = z.infer<typeof AggregateResultSchema>;
