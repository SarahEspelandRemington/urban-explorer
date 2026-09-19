import { describe, expect, it } from "vitest";
import {
  runChecks,
  resolveRootProvenance,
  claimProvenanceProfile,
} from "./checks";
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
    supportingSpan: "quoted span",
    claimType: "use-history",
    claimText: "A generic claim.",
    ...overrides,
  };
}

describe("admissibleSourceClass", () => {
  it("fails when every cited source is inadmissible-generic-web", () => {
    const sources: Record<string, Source> = {
      web1: makeSource({ id: "web1", sourceClass: "inadmissible-generic-web" }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["web1"] });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "admissible-source-class",
    )!;
    expect(result.outcome).toBe("fail");
  });

  it("passes when at least one cited source is admissible", () => {
    const sources: Record<string, Source> = {
      web1: makeSource({ id: "web1", sourceClass: "inadmissible-generic-web" }),
      gov1: makeSource({
        id: "gov1",
        sourceClass: "government-preservation-record",
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["web1", "gov1"],
    });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "admissible-source-class",
    )!;
    expect(result.outcome).toBe("pass");
  });
});

describe("synthesizedSearchRejection", () => {
  it("fails when a cited source is a synthesized search output", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({ id: "s1", isSynthesizedSearchOutput: true }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "synthesized-search-rejection",
    )!;
    expect(result.outcome).toBe("fail");
  });

  it("passes when no cited source is a synthesized search output", () => {
    const sources: Record<string, Source> = { s1: makeSource({ id: "s1" }) };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "synthesized-search-rejection",
    )!;
    expect(result.outcome).toBe("pass");
  });
});

describe("provenanceTracing", () => {
  it("fails when a cited source has provenanceVerified === false", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        provenanceVerified: false,
        provenanceVerificationNote: "resolves to unrelated building",
      }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find((r) => r.checkId === "provenance-tracing")!;
    expect(result.outcome).toBe("fail");
    expect(result.reason).toContain("resolves to unrelated building");
  });

  it("passes when no cited source has a failed provenance-verification note", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({ id: "s1", provenanceVerified: true }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find((r) => r.checkId === "provenance-tracing")!;
    expect(result.outcome).toBe("pass");
  });
});

describe("temporalConsistency", () => {
  const sources: Record<string, Source> = {
    s1: makeSource({ id: "s1" }),
    s2: makeSource({ id: "s2" }),
  };

  it("blocks auto-admit on conflicting precise construction-date claims at the same place (singular-fact type)", () => {
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
    const results = runChecks({
      claim: claimA,
      allClaims: [claimA, claimB],
      sources,
    });
    const result = results.find((r) => r.checkId === "temporal-consistency")!;
    expect(result.outcome).toBe("block-auto-admit");
  });

  it("does not conflict on different construction-date claims at different places", () => {
    const claimA = makeClaim({
      id: "a",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "construction-date",
      dateRange: { start: "1890", precise: true },
    });
    const claimB = makeClaim({
      id: "b",
      placeKey: "p2",
      sourceIds: ["s2"],
      claimType: "construction-date",
      dateRange: { start: "1905", precise: true },
    });
    const results = runChecks({
      claim: claimA,
      allClaims: [claimA, claimB],
      sources,
    });
    const result = results.find((r) => r.checkId === "temporal-consistency")!;
    expect(result.outcome).toBe("pass");
  });

  it("does not conflict for a non-singular-fact claim type (event) without a shared corroborationKey", () => {
    const claimA = makeClaim({
      id: "a",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "event",
      dateRange: { start: "1920", precise: true },
    });
    const claimB = makeClaim({
      id: "b",
      placeKey: "p1",
      sourceIds: ["s2"],
      claimType: "event",
      dateRange: { start: "1955", precise: true },
    });
    const results = runChecks({
      claim: claimA,
      allClaims: [claimA, claimB],
      sources,
    });
    const result = results.find((r) => r.checkId === "temporal-consistency")!;
    expect(result.outcome).toBe("pass");
  });

  it("blocks on a non-singular-fact claim type (event) when both claims share a corroborationKey but disagree on date", () => {
    const claimA = makeClaim({
      id: "a",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "event",
      corroborationKey: "sale-1955",
      dateRange: { start: "1955", precise: true },
    });
    const claimB = makeClaim({
      id: "b",
      placeKey: "p1",
      sourceIds: ["s2"],
      claimType: "event",
      corroborationKey: "sale-1955",
      dateRange: { start: "1958", precise: true },
    });
    const results = runChecks({
      claim: claimA,
      allClaims: [claimA, claimB],
      sources,
    });
    const result = results.find((r) => r.checkId === "temporal-consistency")!;
    expect(result.outcome).toBe("block-auto-admit");
  });

  it("does not collateral-block a clean claim against a Pass-1-disqualified conflicting claim", () => {
    const disqualifyingSources: Record<string, Source> = {
      web1: makeSource({ id: "web1", sourceClass: "inadmissible-generic-web" }),
      s1: makeSource({ id: "s1" }),
    };
    const cleanClaim = makeClaim({
      id: "clean",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "construction-date",
      dateRange: { start: "1890", precise: true },
    });
    const disqualifiedClaim = makeClaim({
      id: "bad",
      placeKey: "p1",
      sourceIds: ["web1"],
      claimType: "construction-date",
      dateRange: { start: "1905", precise: true },
    });
    const results = runChecks({
      claim: cleanClaim,
      allClaims: [cleanClaim, disqualifiedClaim],
      sources: disqualifyingSources,
    });
    const result = results.find((r) => r.checkId === "temporal-consistency")!;
    expect(result.outcome).toBe("pass");
  });
});

describe("superlativeCorroboration", () => {
  it("blocks auto-admit for a superlative claim with no independent-source-class corroboration", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        sourceClass: "local-public-history-narrative",
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "superlative",
    });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "superlative-exclusivity-corroboration",
    )!;
    expect(result.outcome).toBe("block-auto-admit");
  });

  it("passes when corroborated by an independent source class via a shared corroborationKey", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        sourceClass: "local-public-history-narrative",
      }),
      s2: makeSource({
        id: "s2",
        sourceClass: "government-preservation-record",
      }),
    };
    const claimA = makeClaim({
      id: "a",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "superlative",
      corroborationKey: "oldest-in-district",
    });
    const claimB = makeClaim({
      id: "b",
      placeKey: "p1",
      sourceIds: ["s2"],
      claimType: "use-history",
      corroborationKey: "oldest-in-district",
    });
    const results = runChecks({
      claim: claimA,
      allClaims: [claimA, claimB],
      sources,
    });
    const result = results.find(
      (r) => r.checkId === "superlative-exclusivity-corroboration",
    )!;
    expect(result.outcome).toBe("pass");
  });

  it("passes trivially for a non-superlative claim", () => {
    const sources: Record<string, Source> = { s1: makeSource({ id: "s1" }) };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "use-history",
    });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "superlative-exclusivity-corroboration",
    )!;
    expect(result.outcome).toBe("pass");
  });
});

describe("epistemicMarkerPreservation", () => {
  it("fails when the source explicitly refutes the claim", () => {
    const sources: Record<string, Source> = { s1: makeSource({ id: "s1" }) };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      sourceRefutesThisClaim: true,
    });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "epistemic-marker-preservation",
    )!;
    expect(result.outcome).toBe("fail");
  });

  it("blocks auto-admit for a blocking epistemic marker (legend-or-tradition)", () => {
    const sources: Record<string, Source> = { s1: makeSource({ id: "s1" }) };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      epistemicMarkers: ["legend-or-tradition"],
    });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "epistemic-marker-preservation",
    )!;
    expect(result.outcome).toBe("block-auto-admit");
  });

  it("passes with no blocking epistemic marker", () => {
    const sources: Record<string, Source> = { s1: makeSource({ id: "s1" }) };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const results = runChecks({ claim, allClaims: [claim], sources });
    const result = results.find(
      (r) => r.checkId === "epistemic-marker-preservation",
    )!;
    expect(result.outcome).toBe("pass");
  });
});

describe("resolveRootProvenance / claimProvenanceProfile", () => {
  it("resolves a chained source down to its root, not counting the chain as independent", () => {
    const sources: Record<string, Source> = {
      republish: makeSource({
        id: "republish",
        sourceClass: "local-public-history-narrative",
        underlyingProvenanceOf: ["root"],
      }),
      root: makeSource({
        id: "root",
        sourceClass: "government-preservation-record",
      }),
    };
    const roots = resolveRootProvenance("republish", sources);
    expect(roots.has("root")).toBe(true);

    const profile = claimProvenanceProfile(["republish"], sources);
    expect(profile.roots.has("root")).toBe(true);
    expect(profile.classes.has("local-public-history-narrative")).toBe(true);
  });
});
