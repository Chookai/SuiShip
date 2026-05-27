export const RISK_EVENTS_NAMESPACE = "suiship:risk-events" as const;
export const RISK_OBSERVATIONS_NAMESPACE = "suiship:risk-observations" as const;

export type RiskFindingSeverity = "critical" | "warning" | "info";
export type RiskFindingCategory =
  | "weather"
  | "piracy"
  | "port_disruption"
  | "customs"
  | "canal"
  | "geopolitical"
  | "carrier_schedule"
  | "memory_pattern";

export type RiskFindingSource = {
  kind: "memwal" | "serpapi";
  title: string;
  url?: string;
  blobId?: string;
  publishedAt?: string;
  snippet?: string;
};

export type RiskCorrelation = {
  related: boolean;
  confidence: number;
  matchedFactors: string[];
  missingFactors: string[];
  reasoning: string;
};

export type RiskFinding = {
  id: string;
  severity: RiskFindingSeverity;
  category: RiskFindingCategory;
  title: string;
  summary: string;
  affectedShipmentFacts: string[];
  recommendedActions: string[];
  memoryWriteStatus: "not_applicable" | "pending" | "written" | "failed" | "deferred_until_delay_confirmed";
  memwalBlobId?: string;
  sources: RiskFindingSource[];
  correlation?: RiskCorrelation;
  correlationModel?: string;
  correlatedAt?: string;
};

export type RejectedRiskCandidate = {
  finding: RiskFinding;
  correlation?: RiskCorrelation;
  reason: "not_related" | "low_confidence" | "missing_verdict" | "judge_failed";
};

export type RiskScanResult = {
  id: string;
  shipmentId: string;
  status: "completed" | "failed";
  findings: RiskFinding[];
  generatedAt: string;
  memwalConfigured: boolean;
  serpApiConfigured: boolean;
  sourceMessages: string[];
  error?: string;
};
