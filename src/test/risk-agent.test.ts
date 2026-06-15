import { describe, expect, it } from "vitest";
import {
  RISK_EVENTS_NAMESPACE,
  RISK_OBSERVATIONS_NAMESPACE,
  SYNTHETIC_SHIPMENT_RISK_EVENT_IDS,
  buildRiskMemoryVerificationQuery,
  applyRiskCorrelationVerdicts,
  buildRiskCorrelationPrompt,
  buildRiskSearchQueries,
  fingerprintRiskObservation,
  hasDirectShipmentMatch,
  isRiskFindingRelevantToShipment,
  normalizeRiskMemoryResults,
  normalizeSerpApiResults,
  serializeRiskObservation,
  stageUnconfirmedLiveRisksForMemory,
  summarizeRiskSources,
  verifyShipmentRiskMemories,
} from "../../lib/agents/risk-agent";
import type { ShipmentRecord } from "../../lib/shipments-store";

function shipment(overrides: Partial<ShipmentRecord> = {}): ShipmentRecord {
  const base: ShipmentRecord = {
    id: "SS-RISK-001",
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    createdBy: "exporter",
    workflow: "exporter",
    status: "Documents Uploaded",
    importer: { company: "Acme Imports", contact: "Ivy", email: "ivy@example.com", phone: "100" },
    exporter: { company: "Ocean Exporters", contact: "Noah", email: "noah@example.com", phone: "200" },
    shipment: {
      origin: "Singapore",
      originPort: "SGSIN",
      destination: "Los Angeles",
      destinationPort: "USLAX",
      carrier: "SuiShip Freight",
      transportMode: "Ocean",
      incoterm: "FOB",
      etd: "2026-06-01",
      eta: "2026-06-21",
      declaredValue: "50000",
      currency: "USD",
    },
    cargo: {
      description: "Industrial servers",
      sku: "SRV-100",
      hsCode: "847150",
      quantity: "10",
      grossWeight: "1000 kg",
      netWeight: "900 kg",
      handlingUnits: "10 pallets",
      container: "CONT-1",
      seal: "SEAL-1",
      countryOfOrigin: "Singapore",
      dangerousGoods: "No",
      temperatureControlled: "No",
    },
    documents: [],
  };
  return { ...base, ...overrides };
}

describe("risk agent", () => {
  it("uses separate namespaces for historical events and new observations", () => {
    expect(RISK_EVENTS_NAMESPACE).toBe("suiship:risk-events");
    expect(RISK_OBSERVATIONS_NAMESPACE).toBe("suiship:risk-observations");
  });

  it("builds route and carrier search queries from shipment facts", () => {
    const queries = buildRiskSearchQueries(shipment());

    expect(queries.join("\n")).toContain("Singapore");
    expect(queries.join("\n")).toContain("Los Angeles");
    expect(queries.join("\n")).toContain("SGSIN");
    expect(queries.join("\n")).toContain("USLAX");
    expect(queries.join("\n")).toContain("SuiShip Freight");
    expect(queries.some((query) => query.includes("port congestion"))).toBe(true);
  });

  it("normalizes SerpAPI news items into actionable risk findings", () => {
    const findings = normalizeSerpApiResults(shipment(), [
      {
        title: "Los Angeles port congestion delays container pickup",
        link: "https://example.com/port-delay",
        source: "Trade News",
        date: "2 hours ago",
        snippet: "Terminal congestion at Los Angeles is delaying container release windows.",
      },
      {
        title: "Typhoon disrupts South China Sea sailings",
        link: "https://example.com/typhoon",
        source: { name: "Weather Desk" },
        publishedAt: "2026-05-26T01:00:00Z",
        snippet: "Typhoon conditions are forcing carriers to slow steam near the South China Sea.",
      },
    ]);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual(
      expect.objectContaining({
        category: "port_disruption",
        severity: "warning",
        memoryWriteStatus: "pending",
      })
    );
    expect(findings[0].sources[0]).toEqual(
      expect.objectContaining({
        kind: "serpapi",
        title: "Los Angeles port congestion delays container pickup",
        url: "https://example.com/port-delay",
      })
    );
    expect(findings[1].category).toBe("weather");
  });

  it("filters SerpAPI findings that do not relate to the shipment lane", () => {
    const chinaToUs = shipment({
      shipment: {
        ...shipment().shipment,
        origin: "China",
        originPort: "CNSHA",
        destination: "United States",
        destinationPort: "USLAX",
        carrier: "Pacific Bridge Line",
      },
    });

    const findings = normalizeSerpApiResults(chinaToUs, [
      {
        title: "Los Angeles port congestion delays China-US containers",
        link: "https://example.com/china-us",
        snippet: "Cargo from Shanghai to Los Angeles is facing terminal congestion.",
      },
      {
        title: "Northern Europe port strike delays regional truck pickups",
        link: "https://example.com/europe",
        snippet: "Rotterdam and Hamburg terminal labor action is affecting intra-Europe freight.",
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("Los Angeles");
  });

  it("does not duplicate affected shipment facts for display chips", () => {
    const findings = normalizeSerpApiResults(
      shipment({
        shipment: {
          ...shipment().shipment,
          origin: "Los Angeles, CA",
          originPort: "USLAX",
          destination: "Shanghai, China",
          destinationPort: "CNSHA",
        },
      }),
      [
        {
          title: "Los Angeles to Shanghai vessel delay reported",
          link: "https://example.com/lax-shanghai",
          snippet: "A vessel delay is affecting the Los Angeles to Shanghai lane.",
        },
      ]
    );

    const facts = findings[0].affectedShipmentFacts;
    expect(new Set(facts).size).toBe(facts.length);
  });

  it("checks MemWal memory text for route relevance before display", () => {
    const chinaToUs = shipment({
      shipment: {
        ...shipment().shipment,
        origin: "China",
        originPort: "CNSHA",
        destination: "United States",
        destinationPort: "USLAX",
      },
    });

    expect(
      isRiskFindingRelevantToShipment(
        chinaToUs,
        "route: China (CNSHA) -> United States (USLAX)\nsummary: Shanghai to Los Angeles containers delayed by port congestion"
      )
    ).toBe(true);
    expect(
      isRiskFindingRelevantToShipment(
        chinaToUs,
        "summary: Gulf of Aden piracy caused rerouting near Somalia and the Red Sea"
      )
    ).toBe(false);
  });

  it("serializes newly flagged risks without storing article bodies", () => {
    const [finding] = normalizeSerpApiResults(shipment(), [
      {
        title: "Carrier schedule rollback affects Singapore service",
        link: "https://example.com/carrier",
        source: "Carrier Journal",
        snippet: "A carrier schedule rollback is affecting multiple Singapore departures.",
      },
    ]);

    const memory = serializeRiskObservation(shipment(), finding, "2026-05-26T02:00:00.000Z");

    expect(memory).toContain("SUISHIP RISK OBSERVATION");
    expect(memory).toContain("shipment_id: SS-RISK-001");
    expect(memory).toContain("source_url: https://example.com/carrier");
    expect(memory).toContain("source_snippet:");
    expect(memory).not.toContain("<html");
  });

  it("creates stable fingerprints for duplicate source/title/category observations", () => {
    const [finding] = normalizeSerpApiResults(shipment(), [
      {
        title: "Port Strike Delays Los Angeles Containers",
        link: "https://example.com/strike",
        snippet: "Labor disruption at Los Angeles is delaying containers.",
      },
    ]);

    const first = fingerprintRiskObservation(shipment(), finding);
    const second = fingerprintRiskObservation(shipment(), {
      ...finding,
      id: "different-id",
      title: "  port strike delays los angeles containers  ",
    });

    expect(first).toBe(second);
  });

  it("summarizes unavailable integrations for the panel", () => {
    expect(summarizeRiskSources({ memwalConfigured: false, serpApiConfigured: false })).toEqual([
      "MemWal is not configured; historical risk recall is unavailable.",
      "SERPAPI_API_KEY is missing; live public search is unavailable.",
    ]);
  });

  it("builds a Sonnet correlation prompt with shipment and candidate facts", () => {
    const [candidate] = normalizeSerpApiResults(shipment(), [
      {
        title: "Los Angeles port congestion delays container pickup",
        link: "https://example.com/port-delay",
        snippet: "Terminal congestion at Los Angeles is delaying container release windows.",
      },
    ]);

    const prompt = buildRiskCorrelationPrompt(shipment(), [candidate]);

    expect(prompt).toContain("SS-RISK-001");
    expect(prompt).toContain("SGSIN");
    expect(prompt).toContain("USLAX");
    expect(prompt).toContain("SuiShip Freight");
    expect(prompt).toContain(candidate.id);
    expect(prompt).toContain("Return ONLY JSON");
    expect(prompt).not.toContain("affectedShipmentFacts");
  });

  it("includes synthetic SS-EXP-378147 critical-risk memories in the seed set", () => {
    expect(SYNTHETIC_SHIPMENT_RISK_EVENT_IDS).toEqual([
      "risk-la-shanghai-geopolitical-blockade",
      "risk-pacific-star-security-suspension",
    ]);
  });

  it("builds a direct MemWal verification query from shipment route and carrier facts", () => {
    const query = buildRiskMemoryVerificationQuery(shipment({
      id: "SS-EXP-378147",
      shipment: {
        ...shipment().shipment,
        origin: "Los Angeles, CA",
        originPort: "Los Angeles, CA",
        destination: "Shanghai, China",
        destinationPort: "Shanghai, China",
        carrier: "Pacific Star Lines",
      },
    }));

    expect(query).toContain("SS-EXP-378147");
    expect(query).toContain("Los Angeles");
    expect(query).toContain("Shanghai");
    expect(query).toContain("Pacific Star Lines");
    expect(query).toContain("suspended geopolitical");
  });

  it("classifies recalled MemWal risks before Claude judges shipment relation", () => {
    const candidates = normalizeRiskMemoryResults(shipment({
      shipment: {
        ...shipment().shipment,
        origin: "Los Angeles, CA",
        originPort: "Los Angeles, CA",
        destination: "Shanghai, China",
        destinationPort: "Shanghai, China",
        carrier: "Pacific Star Lines",
      },
    }), [
      {
        blobId: "blob-geopolitical",
        distance: 0.1,
        text: [
          "SUISHIP GENERAL RISK MEMORY",
          "event_id: risk-la-shanghai-geopolitical-blockade",
          "category: geopolitical",
          "title: Shanghai-bound trans-Pacific sailings face geopolitical port-entry suspension",
          "summary: A geopolitical trade-control escalation suspended selected Shanghai-bound container services from Los Angeles.",
          "affected_regions: Los Angeles, CA, Shanghai, China, Pacific Star Lines network",
          "recommended_actions: Contact carrier | Notify importer",
        ].join("\n"),
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      category: "geopolitical",
      severity: "critical",
      memoryWriteStatus: "not_applicable",
    }));
    expect(candidates[0].sources[0]).toEqual(expect.objectContaining({
      kind: "memwal",
      blobId: "blob-geopolitical",
    }));
  });

  it("puts both recalled MemWal and news candidates into the Claude correlation prompt", () => {
    const currentShipment = shipment({
      shipment: {
        ...shipment().shipment,
        origin: "Los Angeles, CA",
        originPort: "Los Angeles, CA",
        destination: "Shanghai, China",
        destinationPort: "Shanghai, China",
        carrier: "Pacific Star Lines",
      },
    });
    const memwalCandidates = normalizeRiskMemoryResults(currentShipment, [
      {
        blobId: "blob-carrier-suspension",
        distance: 0.1,
        text: [
          "SUISHIP GENERAL RISK MEMORY",
          "event_id: risk-pacific-star-security-suspension",
          "category: carrier_schedule",
          "title: Pacific Star Lines suspended Los Angeles to Shanghai service after security incident",
          "summary: Pacific Star Lines suspended a Los Angeles to Shanghai sailing.",
          "affected_regions: Los Angeles, CA, Shanghai, China, Pacific Star Lines",
          "recommended_actions: Confirm vessel | Update ETA",
        ].join("\n"),
      },
    ]);
    const newsCandidates = normalizeSerpApiResults(currentShipment, [
      {
        title: "Shanghai port-entry suspension affects Los Angeles containers",
        link: "https://example.com/shanghai-suspension",
        snippet: "Shanghai port-entry suspension is delaying Los Angeles export containers.",
      },
    ]);

    const prompt = buildRiskCorrelationPrompt(currentShipment, [...memwalCandidates, ...newsCandidates]);

    expect(prompt).toContain("memwal-blob-carrier-suspension");
    expect(prompt).toContain("serp-");
    expect(prompt).toContain("Pacific Star Lines suspended Los Angeles to Shanghai service");
    expect(prompt).toContain("Shanghai port-entry suspension affects Los Angeles containers");
  });

  it("verifies required synthetic risk memories are retrievable from MemWal recall results", async () => {
    const result = await verifyShipmentRiskMemories(shipment({
      id: "SS-EXP-378147",
      shipment: {
        ...shipment().shipment,
        origin: "Los Angeles, CA",
        originPort: "Los Angeles, CA",
        destination: "Shanghai, China",
        destinationPort: "Shanghai, China",
        carrier: "Pacific Star Lines",
      },
    }), async () => [
      {
        blobId: "blob-geopolitical",
        distance: 0.1,
        text: "event_id: risk-la-shanghai-geopolitical-blockade\nsummary: Los Angeles Shanghai Pacific Star Lines geopolitical",
      },
      {
        blobId: "blob-carrier",
        distance: 0.2,
        text: "event_id: risk-pacific-star-security-suspension\nsummary: Pacific Star Lines suspended Los Angeles to Shanghai service",
      },
    ]);

    expect(result).toEqual(expect.objectContaining({
      namespace: RISK_EVENTS_NAMESPACE,
      memwalConfigured: true,
      found: SYNTHETIC_SHIPMENT_RISK_EVENT_IDS,
      missing: [],
    }));
    expect(result.query).toContain("Los Angeles");
  });

  it("does not treat generated affected facts as correlation evidence", () => {
    const unrelatedShipment = shipment({
      shipment: {
        ...shipment().shipment,
        origin: "Los Angeles, CA",
        originPort: "USLAX",
        destination: "Shanghai, China",
        destinationPort: "CNSHA",
        carrier: "Pacific Star Lines",
      },
    });
    const candidateWithGeneratedFacts = {
      id: "memwal-gulf-of-aden",
      severity: "critical" as const,
      category: "piracy" as const,
      title: "Gulf of Aden piracy risk",
      summary: "Piracy near Somalia and the Red Sea caused security rerouting.",
      recommendedActions: ["Ask carrier for security routing update"],
      memoryWriteStatus: "not_applicable" as const,
      sources: [{
        kind: "memwal" as const,
        title: "Gulf of Aden piracy risk",
        blobId: "blob-gulf",
        snippet: "Gulf of Aden piracy near Somalia and the Red Sea.",
      }],
      affectedShipmentFacts: [
        "Los Angeles, CA -> Shanghai, China",
        "USLAX -> CNSHA",
        "Pacific Star Lines",
      ],
    };

    expect(hasDirectShipmentMatch(unrelatedShipment, candidateWithGeneratedFacts)).toBe(false);
  });

  it("accepts only high-confidence related Sonnet verdicts and keeps rejected candidates separate", () => {
    const findings = normalizeSerpApiResults(shipment(), [
      {
        title: "Los Angeles port congestion delays container pickup",
        link: "https://example.com/port-delay",
        snippet: "Terminal congestion at Los Angeles is delaying container release windows.",
      },
      {
        title: "South China Sea typhoon affects some sailings",
        link: "https://example.com/weather",
        snippet: "Typhoon conditions are disrupting regional sailings near Singapore.",
      },
    ]);

    const result = applyRiskCorrelationVerdicts(findings, {
      verdicts: [
        {
          candidateId: findings[0].id,
          related: true,
          confidence: 0.92,
          matchedFactors: ["destination port USLAX", "Los Angeles terminal congestion"],
          missingFactors: [],
          reasoning: "The event directly mentions Los Angeles container pickup delays.",
        },
        {
          candidateId: findings[1].id,
          related: true,
          confidence: 0.55,
          matchedFactors: ["broad origin-region weather"],
          missingFactors: ["no destination or carrier match"],
          reasoning: "Only weak regional overlap exists.",
        },
      ],
    }, "claude-sonnet-4-6", "2026-05-27T00:00:00.000Z");

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].correlation).toEqual(expect.objectContaining({
      related: true,
      confidence: 0.92,
      reasoning: "The event directly mentions Los Angeles container pickup delays.",
    }));
    expect(result.accepted[0].correlationModel).toBe("claude-sonnet-4-6");
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("low_confidence");
  });

  it("serializes accepted risk correlation evidence into MemWal observations", () => {
    const [candidate] = normalizeSerpApiResults(shipment(), [
      {
        title: "Los Angeles port congestion delays container pickup",
        link: "https://example.com/port-delay",
        snippet: "Terminal congestion at Los Angeles is delaying container release windows.",
      },
    ]);
    const { accepted } = applyRiskCorrelationVerdicts([candidate], {
      verdicts: [{
        candidateId: candidate.id,
        related: true,
        confidence: 0.91,
        matchedFactors: ["USLAX", "Los Angeles"],
        missingFactors: ["carrier not named"],
        reasoning: "Destination port congestion affects the shipment arrival lane.",
      }],
    }, "claude-sonnet-4-6", "2026-05-27T00:00:00.000Z");

    const memory = serializeRiskObservation(shipment(), accepted[0], "2026-05-27T00:01:00.000Z");

    expect(memory).toContain("correlation_model: claude-sonnet-4-6");
    expect(memory).toContain("correlation_confidence: 0.91");
    expect(memory).toContain("matched_factors: USLAX | Los Angeles");
    expect(memory).toContain("correlation_reasoning: Destination port congestion affects the shipment arrival lane.");
  });

  it("does not write SerpAPI news to MemWal until it causes a real delay", () => {
    const [candidate] = normalizeSerpApiResults(shipment(), [
      {
        title: "Los Angeles port congestion delays container pickup",
        link: "https://example.com/port-delay",
        snippet: "Terminal congestion at Los Angeles is delaying container release windows.",
      },
    ]);
    const { accepted } = applyRiskCorrelationVerdicts([candidate], {
      verdicts: [{
        candidateId: candidate.id,
        related: true,
        confidence: 0.91,
        matchedFactors: ["USLAX", "Los Angeles"],
        missingFactors: [],
        reasoning: "Destination port congestion could affect pickup after arrival.",
      }],
    }, "claude-sonnet-4-6", "2026-05-27T00:00:00.000Z");

    const staged = stageUnconfirmedLiveRisksForMemory(accepted);

    expect(staged[0].memoryWriteStatus).toBe("deferred_until_delay_confirmed");
    expect(staged[0].memwalBlobId).toBeUndefined();
  });
});
