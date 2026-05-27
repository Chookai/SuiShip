import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import { extractFromPdf } from "./haiku-client";
import { aggregate } from "./aggregator";
import { mockExtractPass, mockExtractFail } from "./mock-extractor";
import type { AggregateResult } from "./schemas/aggregate-result";
import type { PdfFile } from "../types";

const CONCURRENCY_LIMIT = 5;

/**
 * Extracts documents using Haiku. Cross-validation is intentionally NOT performed
 * here — it runs separately via /api/shipments/{id}/validate once all docs are uploaded.
 */
export async function extract(
  files: PdfFile[],
  groundingContext?: string | null
): Promise<AggregateResult> {
  if (process.env.MOCK_DOC_AI === "true") {
    return process.env.MOCK_DOC_PASS === "true"
      ? mockExtractPass(files)
      : mockExtractFail(files);
  }

  if (files.length === 0) {
    return {
      detected: { commercial_invoice: [], packing_list: [], bill_of_lading: [], certificate_of_origin: [], other: [] },
      missing: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin"],
      duplicates: [],
      garbage: [],
      low_confidence: [],
      cross_validation: [],
      errors: [],
      summary: { total_files: 0, successfully_extracted: 0, is_complete: false, total_haiku_cost_usd: null },
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const limit = pLimit(CONCURRENCY_LIMIT);

  const extractedDocs = await Promise.all(
    files.map((file) => limit(() => extractFromPdf(file, client, groundingContext)))
  );

  // cross_validation is empty — callers should invoke runShipmentValidation separately.
  return aggregate(extractedDocs);
}
