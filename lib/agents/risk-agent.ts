import { createHash, randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type Database from "better-sqlite3";
import { isMemWalConfigured, memwalRecall, memwalRememberAndWait, type MemWalRecallItem } from "../memwal/client";
import { getShipmentById } from "../shipments-server";
import { getAisPosition } from "../tracker-api/client";
import type { ShipmentRecord } from "../shipments-store";
import { enrichRiskFinding } from "../risk-eta-impact";
export {
  RISK_EVENTS_NAMESPACE,
  RISK_OBSERVATIONS_NAMESPACE,
} from "./risk-types";
import {
  RISK_EVENTS_NAMESPACE,
  RISK_OBSERVATIONS_NAMESPACE,
  type RiskFinding,
  type RiskFindingCategory,
  type RiskFindingSeverity,
  type RejectedRiskCandidate,
  type RiskCorrelation,
  type RiskScanResult,
} from "./risk-types";

export const RISK_CORRELATION_MODEL = "claude-sonnet-4-20250514";
const RISK_CORRELATION_CONFIDENCE_THRESHOLD = 0.7;
const RISK_CORRELATION_CANDIDATE_LIMIT = 10;

export type SerpApiResultLike = {
  title?: unknown;
  link?: unknown;
  url?: unknown;
  source?: unknown;
  date?: unknown;
  publishedAt?: unknown;
  snippet?: unknown;
  summary?: unknown;
};

export type RiskCorrelationVerdict = RiskCorrelation & {
  candidateId: string;
};

export type RiskCorrelationVerdictPayload = {
  verdicts: RiskCorrelationVerdict[];
};

export type RiskCorrelationApplyResult = {
  accepted: RiskFinding[];
  rejected: RejectedRiskCandidate[];
};

export type RiskEventMemory = {
  id: string;
  category: string;
  title: string;
  summary: string;
  affectedRegions: string[];
  typicalImpact: string;
  recommendedActions: string[];
};

export const SYNTHETIC_SHIPMENT_RISK_EVENT_IDS = [
  "risk-la-shanghai-geopolitical-blockade",
  "risk-pacific-star-security-suspension",
] as const;

export const SYNTHETIC_SHIPMENT_RISK_EVENT_MEMORIES: RiskEventMemory[] = [
  {
    id: "risk-la-shanghai-geopolitical-blockade",
    category: "geopolitical",
    title: "Shanghai-bound trans-Pacific sailings face geopolitical port-entry suspension",
    summary: "A geopolitical trade-control escalation suspended selected Shanghai-bound container services from Los Angeles, with carriers holding cargo pending revised routing and compliance screening.",
    affectedRegions: ["Los Angeles, CA", "Shanghai, China", "trans-Pacific lane", "Pacific Star Lines network"],
    typicalImpact: "Port-entry suspension and carrier routing holds can block shipment movement, invalidate the current ETA, and require urgent carrier and broker escalation.",
    recommendedActions: ["Contact carrier for route safety and service status", "Escalate to customs broker for trade-control screening", "Notify importer that release may be blocked", "Review alternate discharge or transshipment options"],
  },
  {
    id: "risk-pacific-star-security-suspension",
    category: "carrier_schedule",
    title: "Pacific Star Lines suspended Los Angeles to Shanghai service after security incident",
    summary: "Pacific Star Lines suspended a Los Angeles to Shanghai sailing after a security incident and rolled booked containers to an unconfirmed later voyage.",
    affectedRegions: ["Los Angeles, CA", "Shanghai, China", "Pacific Star Lines", "trans-Pacific container service"],
    typicalImpact: "Suspended carrier service can strand booked cargo, break the planned ETA window, and require rebooking before customs release planning can continue.",
    recommendedActions: ["Confirm whether SS-EXP-378147 is on the suspended service", "Request revised vessel and voyage details", "Update ETA and stakeholder notices", "Hold customs package submission until carrier confirms routing"],
  },
];

export const RISK_EVENT_MEMORIES: RiskEventMemory[] = [
  ...SYNTHETIC_SHIPMENT_RISK_EVENT_MEMORIES,
  {
    id: "risk-typhoon-western-pacific",
    category: "weather",
    title: "Typhoon delay in Western Pacific",
    summary: "Typhoon conditions in the Western Pacific caused carriers to slow steam, omit port calls, and push ETA windows by 2-5 days.",
    affectedRegions: ["Western Pacific", "South China Sea", "Taiwan Strait", "Philippines"],
    typicalImpact: "Weather avoidance routing and port closure windows can delay vessel arrivals and container handoffs.",
    recommendedActions: ["Check carrier ETA advisories", "Notify consignee of weather delay risk", "Review free-time and demurrage exposure"],
  },
  {
    id: "risk-piracy-gulf-of-aden",
    category: "piracy",
    title: "Piracy risk near Gulf of Aden",
    summary: "A piracy report near a commercial sea lane led carriers to reroute vessels, add security checks, and extend transit schedules.",
    affectedRegions: ["Gulf of Aden", "Red Sea", "Somalia coast", "Arabian Sea"],
    typicalImpact: "Security rerouting can add days of transit time and require revised carrier instructions.",
    recommendedActions: ["Ask carrier for security routing update", "Confirm cargo insurance coverage", "Prepare consignee delay notice"],
  },
  {
    id: "risk-port-strike-europe",
    category: "port_disruption",
    title: "Port strike and terminal backlog",
    summary: "Labor action at a major container terminal created berth congestion, truck appointment shortages, and delayed release.",
    affectedRegions: ["Northern Europe", "US West Coast", "major container terminals"],
    typicalImpact: "Terminal closures and backlog can delay discharge, customs handoff, and last-mile delivery.",
    recommendedActions: ["Check terminal operating status", "Book alternate pickup windows", "Warn importer about release delay"],
  },
  {
    id: "risk-customs-congestion",
    category: "customs",
    title: "Customs congestion after inspection surge",
    summary: "A surge in customs inspections increased clearance cycle times for high-volume HS code categories and triggered document rechecks.",
    affectedRegions: ["destination customs", "high-volume import lanes"],
    typicalImpact: "Customs queues can delay release even when the carrier arrives on time.",
    recommendedActions: ["Verify complete document set", "Prepare broker for inspection questions", "Check document expiry against revised ETA"],
  },
  {
    id: "risk-canal-disruption",
    category: "canal",
    title: "Canal disruption caused route diversion",
    summary: "A canal transit disruption forced carriers to wait for convoy slots or divert around longer ocean routes.",
    affectedRegions: ["Suez Canal", "Panama Canal", "Cape routing"],
    typicalImpact: "Diversions can add 5-14 days and shift transshipment connections.",
    recommendedActions: ["Request revised vessel schedule", "Assess alternate routing", "Update consignee arrival planning"],
  },
  {
    id: "risk-hormuz-geopolitical-strait",
    category: "geopolitical",
    title: "Geopolitical strait disruption",
    summary: "A geopolitical incident near a strategic strait caused carriers to issue risk advisories and review route safety windows.",
    affectedRegions: ["Straits of Hormuz", "Persian Gulf", "Red Sea", "Malacca Strait"],
    typicalImpact: "Strategic chokepoint risk can delay departures, trigger rerouting, or require extra carrier confirmation.",
    recommendedActions: ["Contact carrier for risk advisory", "Notify importer/exporter stakeholders", "Review alternate sailing options"],
  },
  {
    id: "risk-carrier-schedule-rollback",
    category: "carrier_schedule",
    title: "Carrier schedule rollback after blank sailing",
    summary: "A carrier blank sailing or service rollback rolled cargo to a later vessel and changed the booked ETA.",
    affectedRegions: ["global liner services", "transshipment hubs"],
    typicalImpact: "Rolled bookings can create missed delivery windows and require updated commercial expectations.",
    recommendedActions: ["Confirm new vessel and voyage", "Update ETA in shipment record", "Notify consignee and freight forwarder"],
  },
];

export function buildRiskSearchQueries(shipment: ShipmentRecord): string[] {
  const route = [
    shipment.shipment.origin,
    shipment.shipment.originPort,
    shipment.shipment.destination,
    shipment.shipment.destinationPort,
  ].filter(Boolean).join(" ");
  const carrier = shipment.shipment.carrier?.trim();
  return [
    `${route} port congestion shipping disruption`,
    `${route} weather typhoon vessel delay logistics`,
    `${route} customs congestion clearance delay ${shipment.cargo.hsCode}`.trim(),
    carrier ? `${carrier} schedule rollback blank sailing delay ${route}` : "",
    `${shipment.shipment.originPort} ${shipment.shipment.destinationPort} piracy geopolitical canal disruption freight`,
  ].filter((query, index, all) => query && all.indexOf(query) === index);
}

export function normalizeSerpApiResults(
  shipment: ShipmentRecord,
  results: SerpApiResultLike[]
): RiskFinding[] {
  return results
    .map((result) => normalizeSerpApiResult(shipment, result))
    .filter((finding): finding is RiskFinding => Boolean(finding));
}

export function isRiskFindingRelevantToShipment(
  shipment: ShipmentRecord,
  text: string
): boolean {
  const haystack = normalizeText(text);
  const directTerms = routeDirectTerms(shipment);
  if (directTerms.some((term) => haystack.includes(term))) return true;

  const originRegionHits = routeRegionTerms(shipment.shipment.origin, shipment.shipment.originPort)
    .filter((term) => haystack.includes(term)).length;
  const destinationRegionHits = routeRegionTerms(shipment.shipment.destination, shipment.shipment.destinationPort)
    .filter((term) => haystack.includes(term)).length;

  return originRegionHits + destinationRegionHits > 0;
}

export function fingerprintRiskObservation(shipment: ShipmentRecord, finding: RiskFinding): string {
  const sourceUrl = finding.sources.find((source) => source.kind === "serpapi")?.url ?? "";
  return createHash("sha256")
    .update([
      finding.category,
      shipment.shipment.originPort,
      shipment.shipment.destinationPort,
      sourceUrl,
      normalizeText(finding.title),
    ].join("|"))
    .digest("hex");
}

export function buildRiskCorrelationPrompt(
  shipment: ShipmentRecord,
  candidates: RiskFinding[]
): string {
  return [
    "You are SuiShip's maritime logistics risk correlation judge.",
    "Decide whether each candidate risk event actually relates to this shipment route, ports, carrier, cargo, or timing.",
    "Be conservative: generic global logistics news is not related unless it plausibly affects this shipment lane.",
    "Return ONLY JSON with this shape:",
    '{"verdicts":[{"candidateId":"string","related":true,"confidence":0.0,"matchedFactors":["string"],"missingFactors":["string"],"reasoning":"string"}]}',
    "",
    "Shipment:",
    JSON.stringify({
      shipmentId: shipment.id,
      origin: shipment.shipment.origin,
      originPort: shipment.shipment.originPort,
      destination: shipment.shipment.destination,
      destinationPort: shipment.shipment.destinationPort,
      carrier: shipment.shipment.carrier,
      transportMode: shipment.shipment.transportMode,
      etd: shipment.shipment.etd,
      eta: shipment.shipment.eta,
      cargo: shipment.cargo.description,
      hsCode: shipment.cargo.hsCode,
    }, null, 2),
    "",
    "Candidates:",
    JSON.stringify(candidates.map((candidate) => ({
      id: candidate.id,
      category: candidate.category,
      severity: candidate.severity,
      title: candidate.title,
      summary: candidate.summary,
      sources: candidate.sources.map((source) => ({
        kind: source.kind,
        title: source.title,
        url: source.url,
        blobId: source.blobId,
        publishedAt: source.publishedAt,
        snippet: source.snippet?.slice(0, 500),
      })),
    })), null, 2),
  ].join("\n");
}

export function applyRiskCorrelationVerdicts(
  candidates: RiskFinding[],
  payload: RiskCorrelationVerdictPayload,
  model: string,
  correlatedAt: string
): RiskCorrelationApplyResult {
  const verdicts = new Map(payload.verdicts.map((verdict) => [verdict.candidateId, sanitizeCorrelation(verdict)]));
  const accepted: RiskFinding[] = [];
  const rejected: RejectedRiskCandidate[] = [];

  for (const candidate of candidates) {
    const correlation = verdicts.get(candidate.id);
    if (!correlation) {
      rejected.push({ finding: candidate, reason: "missing_verdict" });
      continue;
    }
    if (!correlation.related) {
      rejected.push({ finding: candidate, correlation, reason: "not_related" });
      continue;
    }
    if (correlation.confidence < RISK_CORRELATION_CONFIDENCE_THRESHOLD) {
      rejected.push({ finding: candidate, correlation, reason: "low_confidence" });
      continue;
    }
    accepted.push({
      ...candidate,
      correlation,
      correlationModel: model,
      correlatedAt,
    });
  }

  return { accepted, rejected };
}

export function serializeRiskObservation(
  shipment: ShipmentRecord,
  finding: RiskFinding,
  scannedAt: string
): string {
  const source = finding.sources.find((item) => item.kind === "serpapi");
  return [
    "SUISHIP RISK OBSERVATION",
    `fingerprint: ${fingerprintRiskObservation(shipment, finding)}`,
    `shipment_id: ${shipment.id}`,
    `category: ${finding.category}`,
    `severity: ${finding.severity}`,
    `title: ${finding.title}`,
    `summary: ${finding.summary}`,
    `route: ${shipment.shipment.origin} (${shipment.shipment.originPort}) -> ${shipment.shipment.destination} (${shipment.shipment.destinationPort})`,
    `carrier: ${shipment.shipment.carrier}`,
    `recommended_actions: ${finding.recommendedActions.join(" | ")}`,
    `correlation_model: ${finding.correlationModel ?? "n/a"}`,
    `correlation_confidence: ${finding.correlation?.confidence ?? "n/a"}`,
    `matched_factors: ${finding.correlation?.matchedFactors.join(" | ") ?? "n/a"}`,
    `missing_factors: ${finding.correlation?.missingFactors.join(" | ") ?? "n/a"}`,
    `correlation_reasoning: ${finding.correlation?.reasoning ?? "n/a"}`,
    `source_title: ${source?.title ?? "n/a"}`,
    `source_url: ${source?.url ?? "n/a"}`,
    `source_published_at: ${source?.publishedAt ?? "n/a"}`,
    `source_snippet: ${source?.snippet ?? "n/a"}`,
    `scan_timestamp: ${scannedAt}`,
  ].join("\n");
}

export function stageUnconfirmedLiveRisksForMemory(findings: RiskFinding[]): RiskFinding[] {
  return findings.map((finding) =>
    finding.sources.some((source) => source.kind === "serpapi")
      ? {
          ...finding,
          memoryWriteStatus: "deferred_until_delay_confirmed",
          memwalBlobId: undefined,
        }
      : finding
  );
}

export function summarizeRiskSources(input: {
  memwalConfigured: boolean;
  serpApiConfigured: boolean;
}): string[] {
  const messages: string[] = [];
  if (!input.memwalConfigured) {
    messages.push("MemWal is not configured; historical risk recall is unavailable.");
  }
  if (!input.serpApiConfigured) {
    messages.push("SERPAPI_API_KEY is missing; live public search is unavailable.");
  }
  return messages;
}

export function serializeRiskEventMemory(memory: RiskEventMemory): string {
  return [
    "SUISHIP GENERAL RISK MEMORY",
    `event_id: ${memory.id}`,
    `category: ${memory.category}`,
    `title: ${memory.title}`,
    `summary: ${memory.summary}`,
    `affected_regions: ${memory.affectedRegions.join(", ")}`,
    `typical_impact: ${memory.typicalImpact}`,
    `recommended_actions: ${memory.recommendedActions.join(" | ")}`,
  ].join("\n");
}

export function buildRiskMemoryVerificationQuery(shipment: ShipmentRecord): string {
  return [
    shipment.id,
    shipment.shipment.origin,
    shipment.shipment.originPort,
    shipment.shipment.destination,
    shipment.shipment.destinationPort,
    shipment.shipment.carrier,
    shipment.cargo.description,
    shipment.cargo.hsCode,
    "suspended geopolitical security port-entry carrier schedule blockade",
  ].filter(Boolean).join(" ");
}

type RiskMemoryRecallFn = (
  query: string,
  namespace: typeof RISK_EVENTS_NAMESPACE,
  limit: number
) => Promise<MemWalRecallItem[]>;

export async function verifyShipmentRiskMemories(
  shipment: ShipmentRecord,
  recallFn: RiskMemoryRecallFn = memwalRecall
): Promise<{
  memwalConfigured: boolean;
  namespace: typeof RISK_EVENTS_NAMESPACE;
  query: string;
  expected: string[];
  found: string[];
  missing: string[];
  memories: MemWalRecallItem[];
}> {
  const query = buildRiskMemoryVerificationQuery(shipment);
  const expected = [...SYNTHETIC_SHIPMENT_RISK_EVENT_IDS];
  if (recallFn === memwalRecall && !isMemWalConfigured()) {
    return {
      memwalConfigured: false,
      namespace: RISK_EVENTS_NAMESPACE,
      query,
      expected,
      found: [],
      missing: expected,
      memories: [],
    };
  }

  const memories = await recallFn(query, RISK_EVENTS_NAMESPACE, 10);
  const found = expected.filter((eventId) =>
    memories.some((memory) => memory.text.includes(`event_id: ${eventId}`))
  );
  return {
    memwalConfigured: true,
    namespace: RISK_EVENTS_NAMESPACE,
    query,
    expected,
    found,
    missing: expected.filter((eventId) => !found.includes(eventId)),
    memories,
  };
}

export async function seedRiskEventMemories(): Promise<{
  memwalConfigured: boolean;
  namespace: typeof RISK_EVENTS_NAMESPACE;
  seeded: number;
  skipped: number;
  failed: number;
  memories: RiskEventMemory[];
}> {
  if (!isMemWalConfigured()) {
    return { memwalConfigured: false, namespace: RISK_EVENTS_NAMESPACE, seeded: 0, skipped: 0, failed: 0, memories: RISK_EVENT_MEMORIES };
  }

  let seeded = 0;
  let skipped = 0;
  let failed = 0;
  for (const memory of RISK_EVENT_MEMORIES) {
    try {
      const existing = await memwalRecall(`event_id ${memory.id}`, RISK_EVENTS_NAMESPACE, 3);
      if (existing.some((item) => item.text.includes(`event_id: ${memory.id}`))) {
        skipped += 1;
        continue;
      }
      await memwalRememberAndWait(serializeRiskEventMemory(memory), RISK_EVENTS_NAMESPACE, 120_000);
      seeded += 1;
    } catch {
      failed += 1;
    }
  }
  return { memwalConfigured: true, namespace: RISK_EVENTS_NAMESPACE, seeded, skipped, failed, memories: RISK_EVENT_MEMORIES };
}

export async function runRiskScanForShipment(
  shipmentId: string,
  db: Database.Database
): Promise<RiskScanResult> {
  const shipment = getShipmentById(shipmentId);
  if (!shipment) throw new Error("Shipment not found");

  const now = new Date().toISOString();
  const scanId = randomUUID();
  const memwalConfigured = isMemWalConfigured();
  const serpApiConfigured = Boolean(process.env.SERPAPI_API_KEY);
  const sourceMessages = summarizeRiskSources({ memwalConfigured, serpApiConfigured });
  let findings: RiskFinding[] = [];
  let rejectedCandidates: RejectedRiskCandidate[] = [];

  try {
    if (memwalConfigured) {
      const verification = await verifyShipmentRiskMemories(shipment);
      if (verification.missing.length > 0) {
        sourceMessages.push(`MemWal synthetic risk verification missing expected event_id(s): ${verification.missing.join(", ")}.`);
      } else {
        sourceMessages.push(`MemWal synthetic risk verification found expected event_id(s): ${verification.found.join(", ")}.`);
      }
    }

    const [memoryFindings, serpFindings] = await Promise.all([
      recallRiskMemoryFindings(shipment),
      searchLiveRiskFindings(shipment),
    ]);
    const candidates = [...memoryFindings, ...serpFindings].slice(0, RISK_CORRELATION_CANDIDATE_LIMIT);
    const correlation = await judgeRiskCorrelation(shipment, candidates, sourceMessages);
    findings = correlation.accepted;
    rejectedCandidates = correlation.rejected;
    findings = stageUnconfirmedLiveRisksForMemory(findings);

    // Write accepted live (SerpAPI) findings to MemWal observations namespace
    if (isMemWalConfigured()) {
      const toWrite = findings.filter(
        (f) => f.sources.some((s) => s.kind === "serpapi") && (f.correlation?.confidence ?? 0) >= 0.5
      );
      await Promise.allSettled(
        toWrite.map((f) => memwalRememberAndWait(serializeRiskObservation(shipment, f, now), RISK_OBSERVATIONS_NAMESPACE, 60_000))
      );

      // Synthetic AIS-delay observation when simulation is paused on issue
      const ais = await getAisPosition(shipmentId);
      if (ais.ok && ais.status === "paused_issue") {
        const delayFinding: RiskFinding = enrichRiskFinding({
          id: `ais-delay-${createHash("sha256").update(`${shipmentId}:${ais.timestamp}`).digest("hex").slice(0, 16)}`,
          severity: "warning",
          category: "carrier_schedule",
          title: `AIS issue detected — vessel paused at ${ais.progressPercent}% on ${ais.origin} → ${ais.destination}`,
          summary: `Live AIS simulation shows vessel ${ais.vesselName} paused at ${ais.progressPercent}% progress (lat ${ais.lat.toFixed(2)}, lng ${ais.lng.toFixed(2)}) indicating an in-transit delay or operational hold.`,
          etaImpact: "In-transit hold may delay arrival versus the planned ETA.",
          affectedShipmentFacts: affectedFacts(shipment),
          recommendedActions: [
            "Contact carrier for status update",
            "Check for port congestion or route disruption",
            "Notify consignee of potential delay",
            "Review ETA and demurrage exposure",
          ],
          memoryWriteStatus: "pending",
          sources: [{ kind: "serpapi", title: "AIS simulation", snippet: `Vessel paused at ${ais.progressPercent}% — status: ${ais.status}` }],
          correlation: { related: true, confidence: 0.9, matchedFactors: ["route", "carrier", "AIS status"], missingFactors: [], reasoning: "Direct AIS simulation signal." },
        });
        await memwalRememberAndWait(serializeRiskObservation(shipment, delayFinding, now), RISK_OBSERVATIONS_NAMESPACE, 60_000).catch(() => {/* best-effort */});
        if (!findings.some((f) => f.id.startsWith("ais-delay-"))) {
          findings = [...findings, { ...delayFinding, memoryWriteStatus: "written" }];
        }
      }
    }

    const result: RiskScanResult = {
      id: scanId,
      shipmentId,
      status: "completed",
      findings,
      generatedAt: now,
      memwalConfigured,
      serpApiConfigured,
      sourceMessages,
    };
    saveRiskScan(db, result, rejectedCandidates);
    return result;
  } catch (err) {
    const result: RiskScanResult = {
      id: scanId,
      shipmentId,
      status: "failed",
      findings,
      generatedAt: now,
      memwalConfigured,
      serpApiConfigured,
      sourceMessages,
      error: err instanceof Error ? err.message : String(err),
    };
    saveRiskScan(db, result, rejectedCandidates);
    return result;
  }
}

export function getLatestRiskScan(
  shipmentId: string,
  db: Database.Database
): RiskScanResult | null {
  const row = db.prepare(
    `SELECT id, shipment_id, status, findings_json, source_messages_json,
            memwal_configured, serpapi_configured, error, created_at
     FROM risk_scans
     WHERE shipment_id = ?
     ORDER BY created_at DESC LIMIT 1`
  ).get(shipmentId) as RiskScanRow | undefined;
  return row ? rowToRiskScan(row) : null;
}

async function judgeRiskCorrelation(
  shipment: ShipmentRecord,
  candidates: RiskFinding[],
  sourceMessages: string[]
): Promise<RiskCorrelationApplyResult> {
  if (candidates.length === 0) return { accepted: [], rejected: [] };
  if (!process.env.ANTHROPIC_API_KEY) {
    sourceMessages.push("ANTHROPIC_API_KEY is missing; Sonnet risk correlation is unavailable. Accepted fallback matches use fixed 0.7 confidence and correlationModel deterministic-fallback.");
    return fallbackDirectCorrelation(shipment, candidates, "judge_failed");
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: RISK_CORRELATION_MODEL,
      max_tokens: 1600,
      system: "You are a conservative maritime logistics risk correlation judge. Return only valid JSON.",
      messages: [{ role: "user", content: buildRiskCorrelationPrompt(shipment, candidates) }],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as Anthropic.TextBlock).text)
      .join("")
      .trim();
    const payload = parseRiskCorrelationPayload(text);
    return applyRiskCorrelationVerdicts(candidates, payload, RISK_CORRELATION_MODEL, new Date().toISOString());
  } catch {
    sourceMessages.push("Sonnet risk correlation failed; showing only direct port/carrier/source-route matches with fixed 0.7 fallback confidence.");
    return fallbackDirectCorrelation(shipment, candidates, "judge_failed");
  }
}

function fallbackDirectCorrelation(
  shipment: ShipmentRecord,
  candidates: RiskFinding[],
  rejectedReason: RejectedRiskCandidate["reason"]
): RiskCorrelationApplyResult {
  const accepted: RiskFinding[] = [];
  const rejected: RejectedRiskCandidate[] = [];
  const correlatedAt = new Date().toISOString();
  for (const candidate of candidates) {
    if (hasDirectShipmentMatch(shipment, candidate)) {
      accepted.push({
        ...candidate,
        correlation: {
          related: true,
          confidence: 0.7,
          matchedFactors: ["direct shipment term match"],
          missingFactors: ["Sonnet correlation unavailable"],
          reasoning: "Accepted by fallback because the candidate directly mentions a shipment port, carrier, origin, or destination.",
        },
        correlationModel: "deterministic-fallback",
        correlatedAt,
      });
    } else {
      rejected.push({ finding: candidate, reason: rejectedReason });
    }
  }
  return { accepted, rejected };
}

function parseRiskCorrelationPayload(text: string): RiskCorrelationVerdictPayload {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<RiskCorrelationVerdictPayload>;
  if (!Array.isArray(parsed.verdicts)) throw new Error("Risk correlation response missing verdicts");
  return { verdicts: parsed.verdicts as RiskCorrelationVerdict[] };
}

function sanitizeCorrelation(verdict: RiskCorrelationVerdict): RiskCorrelation {
  return {
    related: Boolean(verdict.related),
    confidence: Math.max(0, Math.min(1, Number(verdict.confidence) || 0)),
    matchedFactors: Array.isArray(verdict.matchedFactors) ? verdict.matchedFactors.map(String).slice(0, 8) : [],
    missingFactors: Array.isArray(verdict.missingFactors) ? verdict.missingFactors.map(String).slice(0, 8) : [],
    reasoning: typeof verdict.reasoning === "string" ? verdict.reasoning.slice(0, 600) : "",
  };
}

async function recallRiskMemoryFindings(shipment: ShipmentRecord): Promise<RiskFinding[]> {
  if (!isMemWalConfigured()) return [];
  const query = [
    shipment.shipment.origin,
    shipment.shipment.originPort,
    shipment.shipment.destination,
    shipment.shipment.destinationPort,
    shipment.shipment.carrier,
    shipment.cargo.description,
    "delay disruption customs port carrier weather piracy canal geopolitical",
  ].filter(Boolean).join(" ");
  const memories = await Promise.all([
    memwalRecall(query, RISK_EVENTS_NAMESPACE, 5),
    memwalRecall(query, RISK_OBSERVATIONS_NAMESPACE, 5),
  ]);
  return normalizeRiskMemoryResults(shipment, memories.flat());
}

export function normalizeRiskMemoryResults(
  shipment: ShipmentRecord,
  memories: MemWalRecallItem[]
): RiskFinding[] {
  return memories.filter((memory) =>
    isRiskFindingRelevantToShipment(shipment, memory.text)
  ).map((memory) => {
    const title = extractField(memory.text, "title") ?? "Recalled risk memory";
    const summary = extractField(memory.text, "summary") ?? memory.text.split("\n").find(Boolean) ?? "Historical logistics risk memory.";
    const category = coerceCategory(extractField(memory.text, "category") ?? title);
    const findingText = [title, summary, memory.text].join("\n");
    const base = {
      id: `memwal-${memory.blobId}`,
      severity: category === "memory_pattern" ? "info" : classifySeverity(category, findingText),
      category: category === "memory_pattern" ? "memory_pattern" : category,
      title,
      summary,
      etaImpact: extractField(memory.text, "typical_impact") ?? undefined,
      affectedShipmentFacts: affectedFacts(shipment),
      recommendedActions: parseActions(extractField(memory.text, "recommended_actions")) ?? defaultActions(category),
      memoryWriteStatus: "not_applicable" as const,
      sources: [{
        kind: "memwal" as const,
        title,
        blobId: memory.blobId,
        snippet: memory.text.slice(0, 400),
      }],
    } satisfies RiskFinding;
    return enrichRiskFinding(base);
  });
}

async function searchLiveRiskFindings(shipment: ShipmentRecord): Promise<RiskFinding[]> {
  if (!process.env.SERPAPI_API_KEY) return [];
  const batches = await Promise.all(buildRiskSearchQueries(shipment).map((query) => fetchSerpApi(query)));
  const seen = new Set<string>();
  const raw = batches.flat().filter((item) => {
    const key = `${String(item.link ?? item.url ?? "")}|${String(item.title ?? "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return normalizeSerpApiResults(shipment, raw).slice(0, 8);
}

async function fetchSerpApi(query: string): Promise<SerpApiResultLike[]> {
  const params = new URLSearchParams({
    engine: "google_news",
    q: query,
    api_key: process.env.SERPAPI_API_KEY!,
    hl: "en",
  });
  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpAPI returned HTTP ${response.status}`);
  }
  const payload = await response.json() as {
    news_results?: SerpApiResultLike[];
    organic_results?: SerpApiResultLike[];
  };
  return payload.news_results ?? payload.organic_results ?? [];
}

function saveRiskScan(
  db: Database.Database,
  result: RiskScanResult,
  rejectedCandidates: RejectedRiskCandidate[]
): void {
  db.prepare(`
    INSERT INTO risk_scans
      (id, shipment_id, status, findings_json, source_messages_json,
       memwal_configured, serpapi_configured, error, created_at, rejected_candidates_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.id,
    result.shipmentId,
    result.status,
    JSON.stringify(result.findings),
    JSON.stringify(result.sourceMessages),
    result.memwalConfigured ? 1 : 0,
    result.serpApiConfigured ? 1 : 0,
    result.error ?? null,
    result.generatedAt,
    JSON.stringify(rejectedCandidates)
  );
}

function normalizeSerpApiResult(shipment: ShipmentRecord, result: SerpApiResultLike): RiskFinding | null {
  const title = asString(result.title);
  if (!title) return null;
  const snippet = asString(result.snippet) ?? asString(result.summary) ?? "";
  const text = `${title} ${snippet}`;
  const category = classifyCategory(text);
  if (!category) return null;
  if (!isRiskFindingRelevantToShipment(shipment, text)) return null;
  const source = sourceTitle(result.source);
  const summary = snippet || `${title} may affect the shipment route.`;
  return enrichRiskFinding({
    id: `serp-${createHash("sha256").update(`${asString(result.link) ?? asString(result.url) ?? ""}|${title}`).digest("hex").slice(0, 16)}`,
    severity: classifySeverity(category, text),
    category,
    title,
    summary,
    affectedShipmentFacts: affectedFacts(shipment),
    recommendedActions: defaultActions(category),
    memoryWriteStatus: "pending",
    sources: [{
      kind: "serpapi",
      title,
      url: asString(result.link) ?? asString(result.url) ?? undefined,
      publishedAt: asString(result.publishedAt) ?? asString(result.date) ?? undefined,
      snippet: source ? `${source}: ${summary}` : summary,
    }],
  });
}

export function hasDirectShipmentMatch(shipment: ShipmentRecord, finding: RiskFinding): boolean {
  const text = [
    finding.title,
    finding.summary,
    ...finding.sources.flatMap((source) => [source.title, source.snippet ?? "", source.url ?? ""]),
  ].join(" ");
  const haystack = normalizeText(text);
  return routeDirectTerms(shipment).some((term) => haystack.includes(term));
}

function classifyCategory(text: string): RiskFindingCategory | null {
  const value = text.toLowerCase();
  if (/(typhoon|storm|weather|monsoon|hurricane|cyclone)/.test(value)) return "weather";
  if (/(piracy|pirate|security attack|hijack)/.test(value)) return "piracy";
  if (/(port|terminal|strike|congestion|berth|backlog|labor action)/.test(value)) return "port_disruption";
  if (/(customs|inspection|clearance|broker|hs code)/.test(value)) return "customs";
  if (/(suez|panama canal|canal|cape route|diversion)/.test(value)) return "canal";
  if (/(geopolitical|strait|hormuz|red sea|sanction|conflict|war)/.test(value)) return "geopolitical";
  if (/(blank sailing|schedule rollback|rolled|carrier delay|service rollback|vessel delay)/.test(value)) return "carrier_schedule";
  return null;
}

function classifySeverity(category: RiskFindingCategory, text: string): RiskFindingSeverity {
  const value = text.toLowerCase();
  if (category === "piracy" || category === "geopolitical") return "critical";
  if (/(closed|closure|attack|war|blocked|suspended)/.test(value)) return "critical";
  if (category === "weather" || category === "port_disruption" || category === "canal") return "warning";
  return "info";
}

function coerceCategory(value: string): RiskFindingCategory {
  return classifyCategory(value) ?? (RISK_CATEGORY_VALUES.includes(value as RiskFindingCategory) ? value as RiskFindingCategory : "memory_pattern");
}

const RISK_CATEGORY_VALUES: RiskFindingCategory[] = [
  "weather",
  "piracy",
  "port_disruption",
  "customs",
  "canal",
  "geopolitical",
  "carrier_schedule",
  "memory_pattern",
];

function defaultActions(category: RiskFindingCategory): string[] {
  switch (category) {
    case "weather":
      return ["Check carrier ETA advisories", "Notify consignee of weather delay risk"];
    case "piracy":
      return ["Ask carrier for security routing update", "Confirm cargo insurance coverage"];
    case "port_disruption":
      return ["Check terminal operating status", "Book alternate pickup or delivery windows"];
    case "customs":
      return ["Verify document completeness", "Prepare broker for inspection questions"];
    case "canal":
      return ["Request revised vessel schedule", "Assess alternate routing"];
    case "geopolitical":
      return ["Contact carrier for risk advisory", "Review alternate sailing options"];
    case "carrier_schedule":
      return ["Confirm new vessel and voyage", "Update ETA in shipment record"];
    case "memory_pattern":
      return ["Compare current shipment against recalled risk pattern", "Escalate if route or party overlap is material"];
  }
}

function affectedFacts(shipment: ShipmentRecord): string[] {
  const facts = [
    `${shipment.shipment.origin} -> ${shipment.shipment.destination}`,
    `${shipment.shipment.originPort} -> ${shipment.shipment.destinationPort}`,
    shipment.shipment.carrier,
    shipment.shipment.transportMode,
  ].filter(Boolean);
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = normalizeText(fact);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseActions(value: string | null): string[] | null {
  if (!value) return null;
  const actions = value.split("|").map((item) => item.trim()).filter(Boolean);
  return actions.length > 0 ? actions : null;
}

function extractField(text: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceTitle(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return asString((value as { name?: unknown }).name);
  }
  return null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ");
}

function routeDirectTerms(shipment: ShipmentRecord): string[] {
  return [
    shipment.shipment.origin,
    shipment.shipment.originPort,
    shipment.shipment.destination,
    shipment.shipment.destinationPort,
    shipment.shipment.carrier,
    portAlias(shipment.shipment.originPort),
    portAlias(shipment.shipment.destinationPort),
  ]
    .flatMap((term) => term ? [term, ...splitRouteTerm(term)] : [])
    .map(normalizeText)
    .filter((term, index, all) => term.length >= 3 && all.indexOf(term) === index);
}

function splitRouteTerm(value: string): string[] {
  return value
    .split(/[,/()\-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function routeRegionTerms(place?: string, port?: string): string[] {
  const combined = normalizeText(`${place ?? ""} ${port ?? ""}`);
  const terms = new Set<string>();

  if (/(china|cnsha|shanghai|ningbo|shenzhen|yantian|qingdao)/.test(combined)) {
    ["china", "mainland china", "east asia", "asia", "pacific", "transpacific", "south china sea", "shanghai"].forEach((term) => terms.add(term));
  }
  if (/(singapore|sgsin|malaysia|malacca|southeast asia)/.test(combined)) {
    ["singapore", "southeast asia", "asia", "south china sea", "malacca", "pacific"].forEach((term) => terms.add(term));
  }
  if (/(united states|usa|uslax|los angeles|long beach|oakland|usnyc|new york|savannah)/.test(combined)) {
    ["united states", "usa", "u.s.", "us", "america", "north america", "us west coast", "west coast", "los angeles", "long beach", "pacific"].forEach((term) => terms.add(term));
  }
  if (/(europe|rotterdam|hamburg|nlrtm|deham)/.test(combined)) {
    ["europe", "northern europe", "rotterdam", "hamburg"].forEach((term) => terms.add(term));
  }

  return [...terms].map(normalizeText).filter((term) => term.length >= 3);
}

function portAlias(port?: string): string | null {
  const normalized = port?.trim().toUpperCase();
  if (!normalized) return null;
  const aliases: Record<string, string> = {
    CNSHA: "Shanghai",
    CNNGB: "Ningbo",
    CNSZX: "Shenzhen",
    CNYTN: "Yantian",
    SGSIN: "Singapore",
    USLAX: "Los Angeles",
    USLGB: "Long Beach",
    USOAK: "Oakland",
    USNYC: "New York",
    USSAV: "Savannah",
  };
  return aliases[normalized] ?? null;
}

type RiskScanRow = {
  id: string;
  shipment_id: string;
  status: "completed" | "failed";
  findings_json: string;
  source_messages_json: string;
  memwal_configured: number;
  serpapi_configured: number;
  error: string | null;
  created_at: string;
};

function rowToRiskScan(row: RiskScanRow): RiskScanResult {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    status: row.status,
    findings: (JSON.parse(row.findings_json) as RiskFinding[]).map(enrichRiskFinding),
    generatedAt: row.created_at,
    memwalConfigured: Boolean(row.memwal_configured),
    serpApiConfigured: Boolean(row.serpapi_configured),
    sourceMessages: JSON.parse(row.source_messages_json) as string[],
    error: row.error ?? undefined,
  };
}
