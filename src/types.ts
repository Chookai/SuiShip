import type { AggregateResult } from "./agent/schemas/aggregate-result";
import type { DocumentType } from "./agent/schemas/base";
import type { ExtractedDoc, ExtractionResult } from "./agent/schemas/extraction-result";

export type PdfFile = {
  id: string;           // caller-assigned, used in logs; typically the original filename
  name: string;         // display name
  buffer: Buffer;       // raw PDF bytes
  sizeBytes: number;
};

export type { AggregateResult, DocumentType, ExtractedDoc, ExtractionResult };
