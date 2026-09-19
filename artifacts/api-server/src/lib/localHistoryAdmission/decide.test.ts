import { describe, expect, it } from "vitest";
import { decideClaim } from "./decide";
import { groundClaim } from "./grounding";
import { runChecks } from "./checks";
import type { Claim, Source } from "./types";

function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    title: overrides.id,
    sourceClass: "local-public-history-narrative",
    capabilities: [],
    ...overrides,
  };
}

function makeClaim(
  overrides: Partial<Claim> & {
    id: string;
    placeKey: string;
    sourceIds: string[];
  },
): Claim {
  return {
    proposedIdentityType: "current-osm-entity",
    address: "123 Main St",
    supportingSpan: "quoted span",
    claimType: "use-history",
    claimText:
      "A generic, sufficiently long claim text for editorial specificity checks.",
    ...overrides,
  };
}

function decide(
  claim: Claim,
  allClaims: Claim[],
  sources: Record<string, Source>,
) {
  const checks = runChecks({ claim, allClaims, sources });
  const grounding = groundClaim(claim);
  return decideClaim(claim, checks, grounding, sources);
}

describe("decideClaim", () => {
  it("SUPPRESSes a claim that fails an independent check (inadmissible source)", () => {
    const sources: Record<string, Source> = {
      web1: makeSource({ id: "web1", sourceClass: "inadmissible-generic-web" }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["web1"] });
    const result = decide(claim, [claim], sources);
    expect(result.decision).toBe("SUPPRESS");
  });

  it("HOLDs a claim that is blocked by a relational check even with strong grounding/trust", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "construction-date", strength: "high" }],
      }),
      s2: makeSource({
        id: "s2",
        capabilities: [{ claimType: "construction-date", strength: "high" }],
      }),
    };
    const claimA = makeClaim({
      id: "a",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "construction-date",
      dateRange: { start: "1890", precise: true },
    });
    const claimB = makeClaim({
      id: "b",
      placeKey: "p1",
      sourceIds: ["s2"],
      claimType: "construction-date",
      dateRange: { start: "1905", precise: true },
    });
    const result = decide(claimA, [claimA, claimB], sources);
    expect(result.decision).toBe("HOLD");
  });

  it("HOLDs a claim with grounding tier 0 / confidence none", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      proposedIdentityType: "unresolved",
    });
    const result = decide(claim, [claim], sources);
    expect(result.decision).toBe("HOLD");
    expect(result.identityConfidence).toBe("none");
  });

  it("HOLDs a claim with low factual trust (no source has capability for this claim type)", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "construction-date", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "use-history",
    });
    const result = decide(claim, [claim], sources);
    expect(result.decision).toBe("HOLD");
    expect(result.factualTrust).toBe("low");
  });

  it("AUTO-ADMITs a claim that passes all checks with sufficient grounding and factual trust", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const result = decide(claim, [claim], sources);
    expect(result.decision).toBe("AUTO-ADMIT");
    expect(result.factualTrust).toBe("high");
    expect(result.identityConfidence).toBe("high");
  });

  it("takes the best (highest-strength) factual trust across multiple cited sources", () => {
    const sources: Record<string, Source> = {
      weak: makeSource({
        id: "weak",
        capabilities: [{ claimType: "use-history", strength: "low" }],
      }),
      strong: makeSource({
        id: "strong",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["weak", "strong"],
    });
    const result = decide(claim, [claim], sources);
    expect(result.factualTrust).toBe("high");
    expect(result.decision).toBe("AUTO-ADMIT");
  });

  it("never lets editorialQuality gate the decision (low editorial quality still AUTO-ADMITs)", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "register-status", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "register-status",
      claimText: "Listed.",
      relatedEntities: [],
    });
    const result = decide(claim, [claim], sources);
    expect(result.editorialQuality).toBe("low");
    expect(result.decision).toBe("AUTO-ADMIT");
  });

  it("SUPPRESSes over HOLD when both a failing and a blocking check apply", () => {
    const sources: Record<string, Source> = {
      web1: makeSource({ id: "web1", sourceClass: "inadmissible-generic-web" }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["web1"],
      epistemicMarkers: ["legend-or-tradition"],
    });
    const result = decide(claim, [claim], sources);
    expect(result.decision).toBe("SUPPRESS");
  });
});

// Regression coverage for the real 1901 Spring Garden St PAB/Baldwin Park
// case: PAB's Project Chronology dates construction to 1865, Baldwin Park's
// narrative dates it to 1875. Both claims independently pass every Pass-1
// check, so temporalConsistency's symmetric relation (each claim's own
// runChecks call scans the full allClaims array, per pipeline.ts) already
// blocks BOTH sides — neither claim can remain AUTO-ADMIT merely because it
// wasn't the one decide.ts happened to evaluate first.
describe("decideClaim — symmetric cross-source conflict handling", () => {
  const sources: Record<string, Source> = {
    "pab-75513": makeSource({
      id: "pab-75513",
      sourceClass: "built-environment-cultural-database",
      capabilities: [{ claimType: "construction-date", strength: "high" }],
    }),
    "bp-1901-spring-garden-street": makeSource({
      id: "bp-1901-spring-garden-street",
      sourceClass: "local-public-history-narrative",
      capabilities: [{ claimType: "construction-date", strength: "medium" }],
    }),
  };

  function makePabClaim() {
    return makeClaim({
      id: "pab-75513-chrono-0-construction",
      placeKey: "pab-record-75513",
      sourceIds: ["pab-75513"],
      claimType: "construction-date",
      dateRange: { start: "1865-01-01", precise: true },
    });
  }
  function makeBpClaim() {
    return makeClaim({
      id: "bp-1901-spring-garden-street-p26s0-construction-date",
      placeKey: "pab-record-75513",
      sourceIds: ["bp-1901-spring-garden-street"],
      claimType: "construction-date",
      dateRange: { start: "1875-01-01", precise: true },
    });
  }

  it("PAB 1865 vs Baldwin Park 1875 construction-date conflict: both claims HOLD", () => {
    const pabClaim = makePabClaim();
    const bpClaim = makeBpClaim();
    const pabResult = decide(pabClaim, [pabClaim, bpClaim], sources);
    const bpResult = decide(bpClaim, [pabClaim, bpClaim], sources);
    expect(pabResult.decision).toBe("HOLD");
    expect(bpResult.decision).toBe("HOLD");
  });

  it("claim order reversed produces an identical result", () => {
    const pabClaim = makePabClaim();
    const bpClaim = makeBpClaim();
    const pabResultReversed = decide(pabClaim, [bpClaim, pabClaim], sources);
    const bpResultReversed = decide(bpClaim, [bpClaim, pabClaim], sources);
    expect(pabResultReversed.decision).toBe("HOLD");
    expect(bpResultReversed.decision).toBe("HOLD");
  });

  it("two agreeing construction dates produce no conflict for either claim", () => {
    const pabClaim = makePabClaim();
    const agreeingBpClaim = makeClaim({
      ...makeBpClaim(),
      dateRange: { start: "1865-01-01", precise: true },
    });
    const pabResult = decide(pabClaim, [pabClaim, agreeingBpClaim], sources);
    const bpResult = decide(
      agreeingBpClaim,
      [pabClaim, agreeingBpClaim],
      sources,
    );
    expect(pabResult.decision).toBe("AUTO-ADMIT");
    expect(bpResult.decision).toBe("AUTO-ADMIT");
  });

  it("unrelated events (different claim type, no shared corroborationKey) at the same place do not create a false conflict", () => {
    const eventSources: Record<string, Source> = {
      ...sources,
      "bp-event-source": makeSource({
        id: "bp-event-source",
        sourceClass: "local-public-history-narrative",
        capabilities: [{ claimType: "event", strength: "medium" }],
      }),
    };
    const pabClaim = makePabClaim();
    const unrelatedEvent = makeClaim({
      id: "bp-unrelated-event",
      placeKey: "pab-record-75513",
      sourceIds: ["bp-event-source"],
      claimType: "event",
      dateRange: { start: "1949-01-01", precise: true },
    });
    const pabResult = decide(
      pabClaim,
      [pabClaim, unrelatedEvent],
      eventSources,
    );
    const eventResult = decide(
      unrelatedEvent,
      [pabClaim, unrelatedEvent],
      eventSources,
    );
    expect(pabResult.decision).toBe("AUTO-ADMIT");
    expect(eventResult.decision).toBe("AUTO-ADMIT");
  });
});
