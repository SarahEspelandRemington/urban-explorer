import { describe, expect, it } from "vitest";
import { generateArtifact } from "./artifact";
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
    productionSubjectId: `prod-${overrides.placeKey}`,
    ...overrides,
  };
}

describe("generateArtifact", () => {
  it("produces deterministic ordering by subjectId, then canonical claimType order, then claimId", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [
          { claimType: "use-history", strength: "high" },
          { claimType: "identity", strength: "high" },
        ],
      }),
    };
    const claims: Claim[] = [
      makeClaim({
        id: "z-claim",
        placeKey: "placeB",
        sourceIds: ["s1"],
        claimType: "use-history",
      }),
      makeClaim({
        id: "a-claim",
        placeKey: "placeA",
        sourceIds: ["s1"],
        claimType: "use-history",
      }),
      makeClaim({
        id: "b-claim",
        placeKey: "placeA",
        sourceIds: ["s1"],
        claimType: "identity",
      }),
    ];
    const artifact = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.claims.map((c) => c.claimId)).toEqual([
      "b-claim",
      "a-claim",
      "z-claim",
    ]);
  });

  it("builds a source capability snapshot scoped to the claim's own claimType", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        title: "Preservation Alliance Record",
        sourceClass: "government-preservation-record",
        capabilities: [
          { claimType: "use-history", strength: "high" },
          { claimType: "construction-date", strength: "low" },
        ],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "use-history",
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const snapshot = artifact.claims[0].sourceCapabilitySnapshots[0];
    expect(snapshot.sourceId).toBe("s1");
    expect(snapshot.sourceClass).toBe("government-preservation-record");
    expect(snapshot.capabilityForClaimType).toEqual({
      claimType: "use-history",
      strength: "high",
    });
  });

  it("computes accurate summary counts across AUTO-ADMIT/HOLD/SUPPRESS", () => {
    const sources: Record<string, Source> = {
      good: makeSource({
        id: "good",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
      web: makeSource({ id: "web", sourceClass: "inadmissible-generic-web" }),
    };
    const claims: Claim[] = [
      makeClaim({
        id: "auto1",
        placeKey: "p1",
        sourceIds: ["good"],
        claimType: "use-history",
      }),
      makeClaim({
        id: "hold1",
        placeKey: "p2",
        sourceIds: ["good"],
        claimType: "use-history",
        proposedIdentityType: "unresolved",
      }),
      makeClaim({
        id: "suppress1",
        placeKey: "p3",
        sourceIds: ["web"],
        claimType: "use-history",
      }),
    ];
    const artifact = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.summary.totalClaims).toBe(3);
    expect(artifact.summary.byDecision).toEqual({
      "AUTO-ADMIT": 1,
      HOLD: 1,
      SUPPRESS: 1,
    });
    expect(artifact.summary.subjectCount).toBe(3);
    expect(artifact.summary.integrityViolations).toEqual([]);
  });

  it("flags an unknown cited source id as an integrity violation without throwing", () => {
    const sources: Record<string, Source> = {};
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["missing-source"],
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.summary.integrityViolations.length).toBe(1);
    expect(artifact.summary.integrityViolations[0]).toContain("missing-source");
    expect(artifact.claims[0].sourceCapabilitySnapshots).toEqual([]);
  });

  it("retains HOLD and SUPPRESS claims in the artifact (full audit trail)", () => {
    const sources: Record<string, Source> = {
      web: makeSource({ id: "web", sourceClass: "inadmissible-generic-web" }),
    };
    const claim = makeClaim({
      id: "suppress1",
      placeKey: "p1",
      sourceIds: ["web"],
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.claims.length).toBe(1);
    expect(artifact.claims[0].decision.decision).toBe("SUPPRESS");
  });

  it("derives subjectId from claim.productionSubjectId, never from placeKey — placeKey !== productionSubjectId", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "pab-record-42",
      productionSubjectId: "way/338306649",
      sourceIds: ["s1"],
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.claims[0].subjectId).toBe("way/338306649");
    expect(artifact.claims[0].subjectId).not.toBe(claim.placeKey);
    expect(artifact.claims[0].claim.placeKey).toBe("pab-record-42");
  });

  it("leaves subjectId undefined and records nonProjectableClaimIds when productionSubjectId is absent — never falls back to placeKey or address", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "pab-record-99",
      productionSubjectId: undefined,
      address: "1818 Spring Garden Street",
      sourceIds: ["s1"],
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.claims[0].subjectId).toBeUndefined();
    expect(artifact.summary.nonProjectableClaimIds).toEqual(["c1"]);
    expect(artifact.summary.integrityViolations).toEqual([]);
    expect(artifact.summary.subjectCount).toBe(0);
  });

  it("never merges two claims into the same subject via shared address when their productionSubjectId differs or is absent (no address-based fallback)", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    // Same real-world address, two distinct historic identities — the
    // Reyburn Mansion / Graham Residence ambiguity this design is built to
    // avoid resolving automatically.
    const claims: Claim[] = [
      makeClaim({
        id: "reyburn-claim",
        placeKey: "pab-record-1",
        productionSubjectId: "way/250836804",
        address: "1818-1820 Spring Garden Street",
        sourceIds: ["s1"],
      }),
      makeClaim({
        id: "graham-claim",
        placeKey: "pab-record-2",
        productionSubjectId: undefined,
        address: "1818 Spring Garden Street",
        sourceIds: ["s1"],
      }),
    ];
    const artifact = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const reyburn = artifact.claims.find((c) => c.claimId === "reyburn-claim")!;
    const graham = artifact.claims.find((c) => c.claimId === "graham-claim")!;
    expect(reyburn.subjectId).toBe("way/250836804");
    expect(graham.subjectId).toBeUndefined();
    expect(artifact.summary.nonProjectableClaimIds).toEqual(["graham-claim"]);
  });

  it("is deterministic across repeated runs with a fixed generatedAt", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claims: Claim[] = [
      makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] }),
      makeClaim({ id: "c2", placeKey: "p2", sourceIds: ["s1"] }),
    ];
    const artifactA = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const artifactB = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifactA).toEqual(artifactB);
  });
});
