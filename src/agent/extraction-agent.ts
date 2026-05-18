import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import { extractFromPdf } from "./haiku-client";
import { aggregate } from "./aggregator";
import { llmCrossValidate } from "./llm-cross-validator";
import { mockExtractPass, mockExtractFail } from "./mock-extractor";
import type { AggregateResult } from "./schemas/aggregate-result";
import type { PdfFile } from "../types";

const CONCURRENCY_LIMIT = 5;

export async function extract(files: PdfFile[]): Promise<AggregateResult> {
  if (process.env.MOCK_DOC_AI === "true") {
    return process.env.MOCK_DOC_PASS === "true"
      ? mockExtractPass(files)
      : mockExtractFail(files);
  }

  if (files.length === 0) {
    return {
      detected: { commercial_invoice: [], packing_list: [], bill_of_lading: [], certificate_of_origin: [] },
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
    files.map((file) => limit(() => extractFromPdf(file, client)))
  );

  const partialAggregate = aggregate(extractedDocs);
  const crossValidation = await llmCrossValidate(partialAggregate.detected, client);

  return { ...partialAggregate, cross_validation: crossValidation };
}
