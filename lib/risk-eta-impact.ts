import type { RiskFinding, RiskFindingCategory } from "@/lib/agents/risk-types";

function extractField(text: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? null;
}

function categoryEtaFallback(category: RiskFindingCategory): string {
  switch (category) {
    case "geopolitical":
      return "Trade or port controls may hold cargo and push out the planned ETA.";
    case "carrier_schedule":
      return "Carrier schedule changes may break the current ETA window.";
    case "weather":
      return "Weather routing or port closures may delay arrival versus the planned ETA.";
    case "port_disruption":
      return "Terminal congestion may delay discharge and downstream delivery after ETA.";
    case "customs":
      return "Customs delays may postpone release even if the vessel arrives near ETA.";
    case "canal":
      return "Canal or routing disruption may add transit days beyond the planned ETA.";
    case "piracy":
      return "Security rerouting may extend transit time and delay ETA.";
    case "memory_pattern":
      return "Recalled risk patterns suggest possible schedule or clearance delay.";
  }
}

export function resolveEtaImpactFromText(
  text: string,
  category: RiskFindingCategory,
): string | null {
  const fromTypical = extractField(text, "typical_impact");
  if (fromTypical) return fromTypical;

  return categoryEtaFallback(category);
}

export function enrichRiskFinding(finding: RiskFinding): RiskFinding {
  if (finding.etaImpact?.trim()) return finding;

  const sourceText = finding.sources.map((s) => s.snippet ?? "").join("\n");
  const combined = [finding.title, finding.summary, sourceText].join("\n");
  const etaImpact = resolveEtaImpactFromText(combined, finding.category);
  return etaImpact ? { ...finding, etaImpact } : finding;
}

const CATEGORY_DELAY_DAYS: Partial<Record<RiskFindingCategory, number>> = {
  geopolitical: 3,
  carrier_schedule: 5,
  weather: 4,
  port_disruption: 3,
  customs: 2,
  canal: 10,
  piracy: 5,
};

export function parseEstimatedDelayDays(text: string): number | null {
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)\s*days?/i);
  if (range) {
    return Math.max(Number.parseInt(range[1], 10), Number.parseInt(range[2], 10));
  }
  const pushWindow = text.match(/push(?:\s+\w+){0,6}\s*(?:by\s+)?(\d+)\s*[-–]?\s*(\d+)?\s*days?/i);
  if (pushWindow) {
    const high = pushWindow[2] ? Number.parseInt(pushWindow[2], 10) : Number.parseInt(pushWindow[1], 10);
    return Number.isFinite(high) ? high : null;
  }
  const addDays = text.match(/add\s+(\d+)\s*[-–]?\s*(\d+)?\s*days?/i);
  if (addDays) {
    const high = addDays[2] ? Number.parseInt(addDays[2], 10) : Number.parseInt(addDays[1], 10);
    return Number.isFinite(high) ? high : null;
  }
  const single = text.match(/(\d+)\s*days?/i);
  if (single) {
    const days = Number.parseInt(single[1], 10);
    return Number.isFinite(days) ? days : null;
  }
  return null;
}

function estimateDelayDaysForFinding(finding: RiskFinding): number | null {
  const enriched = enrichRiskFinding(finding);
  const combined = [enriched.etaImpact, enriched.summary, enriched.title].filter(Boolean).join(" ");
  const parsed = parseEstimatedDelayDays(combined);
  if (parsed != null) return parsed;
  return CATEGORY_DELAY_DAYS[enriched.category] ?? null;
}

function formatEtaLabel(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.trim() || null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function addDaysToEta(plannedEta: string, days: number): string | null {
  const date = new Date(plannedEta);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return formatEtaLabel(date.toISOString());
}

export type ShipmentEtaRiskSummary = {
  atRisk: boolean;
  criticalCount: number;
  warningCount: number;
  topImpact: string | null;
  topTitle: string | null;
  estimatedDelayDays: number | null;
  revisedEtaLabel: string | null;
  delayLabel: string | null;
};

const SEVERITY_RANK: Record<RiskFinding["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function summarizeShipmentEtaRisk(
  findings: RiskFinding[],
  plannedEta?: string,
): ShipmentEtaRiskSummary {
  const enriched = findings.map(enrichRiskFinding);
  const delayFindings = enriched.filter((f) => f.etaImpact);
  const criticalFindings = delayFindings.filter((f) => f.severity === "critical");
  const criticalCount = criticalFindings.length;
  const warningCount = delayFindings.filter((f) => f.severity === "warning").length;

  const sorted = [...delayFindings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  const top = sorted[0];

  const delayEstimates = criticalFindings
    .map(estimateDelayDaysForFinding)
    .filter((days): days is number => days != null);
  const estimatedDelayDays =
    delayEstimates.length > 0 ? Math.max(...delayEstimates) : null;

  let delayLabel: string | null = null;
  let revisedEtaLabel: string | null = null;
  if (estimatedDelayDays != null) {
    delayLabel =
      estimatedDelayDays === 1 ? "~1 day delay" : `~${estimatedDelayDays} day delay`;
    if (plannedEta?.trim()) {
      revisedEtaLabel = addDaysToEta(plannedEta, estimatedDelayDays);
    }
  } else if (criticalCount > 0) {
    delayLabel = "ETA at risk";
  }

  return {
    atRisk: delayFindings.length > 0,
    criticalCount,
    warningCount,
    topImpact: top?.etaImpact ?? null,
    topTitle: top?.title ?? null,
    estimatedDelayDays,
    revisedEtaLabel,
    delayLabel,
  };
}
