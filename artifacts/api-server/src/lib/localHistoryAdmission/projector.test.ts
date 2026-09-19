import { describe, expect, it } from "vitest";
import { generateArtifact } from "./artifact";
import { projectRuntimeCompat } from "./projector";
import type { CuratedEntry } from "../curatedLocalHistory";
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

describe("projectRuntimeCompat", () => {
  it("only includes AUTO-ADMIT claims — HOLD and SUPPRESS are excluded categorically", () => {
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
      makeClaim({ id: "suppress1", placeKey: "p3", sourceIds: ["web"] }),
    ];
    const artifact = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    expect(Object.keys(projection.entries)).toEqual(["prod-p1"]);
    expect(projection.compositionMap).toEqual({ "prod-p1": ["auto1"] });
  });

  it("aggregates curatedTrust and verificationConfidence conservatively (weakest-link) across multiple composed claims", () => {
    const sources: Record<string, Source> = {
      strong: makeSource({
        id: "strong",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
      medium: makeSource({
        id: "medium",
        capabilities: [
          { claimType: "institutional-founding", strength: "medium" },
        ],
      }),
    };
    const claims: Claim[] = [
      makeClaim({
        id: "c1",
        placeKey: "p1",
        sourceIds: ["strong"],
        claimType: "use-history",
      }),
      makeClaim({
        id: "c2",
        placeKey: "p1",
        sourceIds: ["medium"],
        claimType: "institutional-founding",
        proposedIdentityType: "unnamed-current-building",
      }),
    ];
    const artifact = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    const entry = projection.entries["prod-p1"];
    // c1: factualTrust=high, identityConfidence=high; c2: factualTrust=medium, identityConfidence=medium (unnamed-current-building+address)
    expect(entry.evidence.curatedTrust).toBe("medium");
    expect(entry.evidence.verificationConfidence).toBe("medium");
  });

  it("editorialQuality variance does not affect curatedTrust or verificationConfidence (regression guard)", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "register-status", strength: "high" }],
      }),
    };
    // register-status + no relatedEntities => editorialQuality "low" (thin-fact type), but factualTrust/identityConfidence both high.
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["s1"],
      claimType: "register-status",
      claimText: "Listed.",
      relatedEntities: [],
    });
    const artifactLowEditorial = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projectionLowEditorial = projectRuntimeCompat(artifactLowEditorial);
    expect(artifactLowEditorial.claims[0].decision.editorialQuality).toBe(
      "low",
    );
    expect(
      projectionLowEditorial.entries["prod-p1"].evidence.curatedTrust,
    ).toBe("high");
    expect(
      projectionLowEditorial.entries["prod-p1"].evidence.verificationConfidence,
    ).toBe("high");

    // Same factual/identity trust, but a story-rich claim type with related entities => editorialQuality "high". Trust fields must be identical.
    const highEditorialClaim = makeClaim({
      id: "c2",
      placeKey: "p2",
      sourceIds: ["s2"],
      claimType: "biographical",
      claimText: "A rich biographical account.",
      relatedEntities: ["Some Person"],
    });
    const sourcesForP2: Record<string, Source> = {
      s2: makeSource({
        id: "s2",
        capabilities: [{ claimType: "biographical", strength: "high" }],
      }),
    };
    const artifactHighEditorial = generateArtifact(
      [highEditorialClaim],
      sourcesForP2,
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );
    expect(artifactHighEditorial.claims[0].decision.editorialQuality).toBe(
      "high",
    );
    const projectionHighEditorial = projectRuntimeCompat(artifactHighEditorial);
    expect(
      projectionHighEditorial.entries["prod-p2"].evidence.curatedTrust,
    ).toBe(projectionLowEditorial.entries["prod-p1"].evidence.curatedTrust);
    expect(
      projectionHighEditorial.entries["prod-p2"].evidence
        .verificationConfidence,
    ).toBe(
      projectionLowEditorial.entries["prod-p1"].evidence.verificationConfidence,
    );
  });

  it("composes multiple distinct sources into a single CuratedSource without inventing a new sourceType field", () => {
    const sources: Record<string, Source> = {
      gov: makeSource({
        id: "gov",
        title: "State Register Nomination",
        sourceClass: "government-preservation-record",
        capabilities: [{ claimType: "construction-date", strength: "high" }],
      }),
      narrative: makeSource({
        id: "narrative",
        title: "Local History Blog",
        sourceClass: "local-public-history-narrative",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claims: Claim[] = [
      makeClaim({
        id: "c1",
        placeKey: "p1",
        sourceIds: ["gov"],
        claimType: "construction-date",
        dateRange: { start: "1890", precise: true },
      }),
      makeClaim({
        id: "c2",
        placeKey: "p1",
        sourceIds: ["narrative"],
        claimType: "use-history",
      }),
    ];
    const artifact = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    const entry = projection.entries["prod-p1"];
    expect(typeof entry.source.sourceType).toBe("string");
    expect(entry.source.sourceType).toContain("government preservation record");
    expect(entry.source.sourceType).toContain(
      "local public-history narrative source",
    );
    expect(entry.source.title).toContain("State Register Nomination");
    expect(entry.source.title).toContain("Local History Blog");
  });

  it("excludes an inadmissible-generic-web co-cited source from the composite source disclosure", () => {
    const sources: Record<string, Source> = {
      gov: makeSource({
        id: "gov",
        title: "State Register Nomination",
        sourceClass: "government-preservation-record",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
      web: makeSource({
        id: "web",
        title: "Random Blog Post",
        sourceClass: "inadmissible-generic-web",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "p1",
      sourceIds: ["gov", "web"],
      claimType: "use-history",
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    expect(projection.entries["prod-p1"].source.title).not.toContain(
      "Random Blog Post",
    );
  });

  it("produces a structurally valid CuratedEntry (type-level compatibility check)", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    const entry: CuratedEntry = projection.entries["prod-p1"];
    expect(entry.evidence.subjectId).toBe("prod-p1");
    expect(entry.evidence.verificationStatus).toBe("approved");
    expect(entry.evidence.lastVerifiedDate).toBe("2026-01-01");
    expect(entry.evidence.admissionMethod).toBe("automated");
  });

  it("skips an otherwise AUTO-ADMIT-eligible claim lacking productionSubjectId — fail-closed, reported as non-projectable, not merged under placeKey", () => {
    const sources: Record<string, Source> = {
      good: makeSource({
        id: "good",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "unresolved1",
      placeKey: "pab-record-12",
      productionSubjectId: undefined,
      sourceIds: ["good"],
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.claims[0].decision.decision).toBe("AUTO-ADMIT");
    const projection = projectRuntimeCompat(artifact);
    expect(Object.keys(projection.entries)).toEqual([]);
    expect(projection.compositionMap).toEqual({});
    expect(projection.nonProjectableClaimIds).toEqual(["unresolved1"]);
  });

  it("exact OSM element id survives grounding → artifact → projection unchanged, and stays distinct from placeKey throughout", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "c1",
      placeKey: "pab-record-77",
      productionSubjectId: "way/338306649",
      sourceIds: ["s1"],
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.claims[0].subjectId).toBe("way/338306649");
    const projection = projectRuntimeCompat(artifact);
    expect(Object.keys(projection.entries)).toEqual(["way/338306649"]);
    expect(projection.entries["way/338306649"].evidence.subjectId).toBe(
      "way/338306649",
    );
    expect(projection.compositionMap).toEqual({ "way/338306649": ["c1"] });
    expect(projection.nonProjectableClaimIds).toEqual([]);
  });

  it("stamps automated admissionMethod without affecting curatedTrust/verificationConfidence or projection eligibility (provenance-only)", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    const entry = projection.entries["prod-p1"];
    expect(entry.evidence.admissionMethod).toBe("automated");
    // Same claim/source composition as the "structurally valid CuratedEntry"
    // test above, with admissionMethod now present — trust/confidence must
    // be identical to what they'd be without this field ever existing.
    expect(entry.evidence.curatedTrust).toBe("high");
    expect(entry.evidence.verificationConfidence).toBe("high");
    expect(Object.keys(projection.entries)).toEqual(["prod-p1"]);
  });

  it("is deterministic across repeated runs on the same artifact", () => {
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
    const artifact = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(projectRuntimeCompat(artifact)).toEqual(
      projectRuntimeCompat(artifact),
    );
  });
});
