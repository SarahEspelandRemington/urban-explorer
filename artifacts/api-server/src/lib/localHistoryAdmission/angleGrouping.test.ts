import { describe, expect, it } from "vitest";
import {
  groupClaimsIntoAngles,
  resolveSubjectDiscoveryProjections,
  type AngleGroupingResult,
} from "./angleGrouping";
import { generateArtifact } from "./artifact";
import { projectRuntimeCompat } from "./projector";
import {
  applyDiscoveryWorthinessGate,
  type DiscoveryWorthinessGateResult,
} from "./worthiness";
import type { Claim, Source } from "./types";
import type { CuratedEntry } from "../curatedLocalHistory";

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
function buildPipeline(claims: Claim[], sources: Record<string, Source>) {
  const artifact = generateArtifact(claims, sources, {
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  const projection = projectRuntimeCompat(artifact);
  const gated = applyDiscoveryWorthinessGate(projection, artifact);
  return { artifact, projection, gated };
}
function makeGatedStub(
  entries: Record<string, CuratedEntry>,
): DiscoveryWorthinessGateResult {
  return {
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    entries,
    compositionMap: {},
    nonProjectableClaimIds: [],
    worthinessBySubject: {},
    rejectedForWorthiness: [],
  };
}
function makeFakeCuratedEntry(subjectId: string): CuratedEntry {
  return {
    source: { title: "stub", sourceType: "stub", usageNote: "stub" },
    evidence: {
      subjectId,
      text: "stub",
      claimScope: "stub",
      verificationStatus: "approved",
      verificationConfidence: "high",
      curatedTrust: "high",
      lastVerifiedDate: "2026-01-01",
    },
  };
}

describe("groupClaimsIntoAngles (no-op first slice)", () => {
  it("1924 Spring Garden Street (way/349397298, real admitted claims from curatedLocalHistory.ts): zero angle groups, all 4 eligible claims ungrouped, hasStoryBearingClaim unaffected, flattenedFallback populated per the migration rule", () => {
    const subjectId = "way/349397298";
    const sources: Record<string, Source> = {
      "pab-75672": makeSource({
        id: "pab-75672",
        title:
          "Philadelphia Architects and Buildings — 1924 Spring Garden Street (1924 SPRING GARDEN ST)",
        sourceClass: "built-environment-cultural-database",
        capabilities: [
          { claimType: "identity", strength: "high" },
          { claimType: "register-status", strength: "high" },
        ],
      }),
      "bp-unions-in-the-neighborhood-pab-record-75672": makeSource({
        id: "bp-unions-in-the-neighborhood-pab-record-75672",
        title: 'Baldwin Park — "Unions in the Neighborhood"',
        sourceClass: "local-public-history-narrative",
        capabilities: [
          { claimType: "construction-date", strength: "high" },
          { claimType: "institutional-founding", strength: "high" },
        ],
      }),
    };
    const claims: Claim[] = [
      makeClaim({
        id: "pab-75672-identity",
        placeKey: "pab-record-75672",
        sourceIds: ["pab-75672"],
        claimType: "identity",
        claimText:
          'PAB\'s own record for 1924 SPRING GARDEN ST identifies this as "1924 Spring Garden Street."',
        productionSubjectId: subjectId,
      }),
      makeClaim({
        id: "bp-unions-in-the-neighborhood-pab-record-75672-p79s0-construction-date",
        placeKey: "pab-record-75672",
        sourceIds: ["bp-unions-in-the-neighborhood-pab-record-75672"],
        claimType: "construction-date",
        claimText:
          'Baldwin Park\'s page "Unions in the Neighborhood" states about 1924 SPRING GARDEN ST: "The squat new building at 1924 Spring Garden Street in 1971, built for the Ironworkers Union."',
        productionSubjectId: subjectId,
      }),
      makeClaim({
        id: "pab-75672-register-status",
        placeKey: "pab-record-75672",
        sourceIds: ["pab-75672"],
        claimType: "register-status",
        claimText:
          "PAB's record shows a historic-register listing entry for 1924 SPRING GARDEN ST, dated 10/11/2000.",
        productionSubjectId: subjectId,
      }),
      makeClaim({
        id: "bp-unions-in-the-neighborhood-pab-record-75672-p76s0-institutional-founding",
        placeKey: "pab-record-75672",
        sourceIds: ["bp-unions-in-the-neighborhood-pab-record-75672"],
        claimType: "institutional-founding",
        claimText:
          'Baldwin Park\'s page "Unions in the Neighborhood" states about 1924 SPRING GARDEN ST: "The International Association of Bridge, Structural, & Ornamental Iron Workers Union Local 401 (founded 1901), which had been at 1924 Spring Garden Street for at least four decades, sold the site to PSSU in 1993."',
        productionSubjectId: subjectId,
      }),
    ];

    const { artifact, projection, gated } = buildPipeline(claims, sources);
    // Sanity: real admitted-claim composition matches curatedLocalHistory.ts's
    // way/349397298 entry (4 claims, 4 distinct claim types) before angle
    // grouping runs at all.
    expect(projection.compositionMap[subjectId]).toHaveLength(4);
    expect(gated.worthinessBySubject[subjectId].projectableForDiscovery).toBe(
      true,
    );
    const originalProjectionEntry = projection.entries[subjectId];

    const grouping = groupClaimsIntoAngles(artifact, projection);
    const subjectGrouping = grouping.bySubject[subjectId];
    expect(subjectGrouping.angleGroups).toEqual([]);
    expect([...subjectGrouping.ungroupedClaimIds].sort()).toEqual(
      [...projection.compositionMap[subjectId]].sort(),
    );

    // hasStoryBearingClaim and projectRuntimeCompat's own output are
    // untouched by angle grouping having run.
    expect(gated.entries[subjectId].evidence.hasStoryBearingClaim).toBe(true);
    expect(projection.entries[subjectId]).toBe(originalProjectionEntry);

    const resolved = resolveSubjectDiscoveryProjections(grouping, gated);
    expect(resolved[subjectId].angleGroups).toEqual([]);
    // Migration rule: zero groups + passed today's worthiness gate =>
    // fallback populated from the real gated entry, never synthesized as a
    // fake angle.
    expect(resolved[subjectId].flattenedFallback).toEqual(
      gated.entries[subjectId],
    );
    expect(resolved[subjectId].flattenedFallback).not.toHaveProperty("angleId");
  });

  it("a subject with zero angle groups that FAILS today's worthiness gate gets no flattenedFallback (never synthesized to fill the gap)", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "register-status", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "stub1",
      placeKey: "p-thin",
      sourceIds: ["s1"],
      claimType: "register-status",
    });
    const { artifact, projection, gated } = buildPipeline([claim], sources);
    const subjectId = "prod-p-thin";
    expect(gated.entries[subjectId]).toBeUndefined();

    const grouping = groupClaimsIntoAngles(artifact, projection);
    expect(grouping.bySubject[subjectId].angleGroups).toEqual([]);
    expect(grouping.bySubject[subjectId].ungroupedClaimIds).toEqual(["stub1"]);

    const resolved = resolveSubjectDiscoveryProjections(grouping, gated);
    expect(resolved[subjectId].flattenedFallback).toBeUndefined();
  });

  it("is deterministic across repeated runs on the same artifact/projection", () => {
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
    const { artifact, projection } = buildPipeline(claims, sources);
    expect(groupClaimsIntoAngles(artifact, projection)).toEqual(
      groupClaimsIntoAngles(artifact, projection),
    );
  });

  it("does not mutate its artifact or projection inputs", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const { artifact, projection } = buildPipeline([claim], sources);
    const artifactSnapshot = JSON.parse(JSON.stringify(artifact));
    const projectionSnapshot = JSON.parse(JSON.stringify(projection));
    groupClaimsIntoAngles(artifact, projection);
    expect(artifact).toEqual(artifactSnapshot);
    expect(projection).toEqual(projectionSnapshot);
  });

  it("throws if a composed claimId is missing from artifact.claims — proves it genuinely cross-checks the artifact directly, not just compositionMap", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const { artifact, projection } = buildPipeline([claim], sources);
    const tamperedProjection = {
      ...projection,
      compositionMap: {
        ...projection.compositionMap,
        "prod-p1": ["nonexistent-claim"],
      },
    };
    expect(() => groupClaimsIntoAngles(artifact, tamperedProjection)).toThrow(
      /not found in artifact\.claims/,
    );
  });
});

// These fixtures exercise the AngleGroup contract and
// resolveSubjectDiscoveryProjections directly, independent of
// groupClaimsIntoAngles's no-op first-slice behavior (automatic grouping —
// producing non-empty angleGroups from real admitted claims — is a later
// slice). This is a representation/plumbing test only, per the settled
// correction to not defer the shared-claimId structural case.
describe("AngleGroup / SubjectAngleGrouping structural fixtures — one, multiple, and shared-claimId cases", () => {
  it("Actors' Temple (way/265322610, real single admitted claim): exactly one AngleGroup with the calibrated centralQuestion/perspectiveShift, claim correctly assigned, no fallback", () => {
    const subjectId = "way/265322610";
    const claimId =
      "eny-https-ephemeralnewyork-wordpress-com-2022-09-23-the-little-hells-kitchen-synagogue-where-old-broadway-stars-once-worshipped--eny-actors-temple-p4s1-use-history";
    const grouping: AngleGroupingResult = {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      bySubject: {
        [subjectId]: {
          subjectId,
          angleGroups: [
            {
              subjectId,
              angleId: "synagogue-actors-identity",
              centralQuestion:
                "Why did this Hell's Kitchen synagogue become known as the Actors' Temple, and why did that identity matter?",
              perspectiveShift:
                "The important story is not celebrity attendance itself, but that a neighborhood synagogue became a welcoming institution for Jewish performers and retained that identity as the surrounding theater district changed.",
              claimIds: [claimId],
            },
          ],
          ungroupedClaimIds: [],
        },
      },
    };
    const gated = makeGatedStub({
      [subjectId]: makeFakeCuratedEntry(subjectId),
    });
    const resolved = resolveSubjectDiscoveryProjections(grouping, gated);

    expect(resolved[subjectId].angleGroups).toHaveLength(1);
    expect(resolved[subjectId].angleGroups[0].claimIds).toEqual([claimId]);
    expect(resolved[subjectId].angleGroups[0].centralQuestion).toBe(
      "Why did this Hell's Kitchen synagogue become known as the Actors' Temple, and why did that identity matter?",
    );
    expect(resolved[subjectId].angleGroups[0].perspectiveShift).toBe(
      "The important story is not celebrity attendance itself, but that a neighborhood synagogue became a welcoming institution for Jewish performers and retained that identity as the surrounding theater district changed.",
    );
    // Non-empty angleGroups => no migration fallback, even though this
    // subject did pass the (stubbed) worthiness gate.
    expect(resolved[subjectId].flattenedFallback).toBeUndefined();
  });

  it("Clinton Court (way/265320377, real single admitted claim): exactly one AngleGroup with the calibrated centralQuestion/perspectiveShift, claim correctly assigned, no fallback", () => {
    const subjectId = "way/265320377";
    const claimId =
      "eny-https-ephemeralnewyork-wordpress-com-2017-09-25-a-secret-alley-behind-a-street-in-hells-kitchen--eny-clinton-court-p16s0-use-history";
    const grouping: AngleGroupingResult = {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      bySubject: {
        [subjectId]: {
          subjectId,
          angleGroups: [
            {
              subjectId,
              angleId: "hidden-courtyard-carriage-house",
              centralQuestion:
                "Why is there a secret courtyard and carriage house hidden behind an ordinary Hell's Kitchen street wall?",
              perspectiveShift:
                "Behind an ordinary dense street wall survives an older spatial layer of the city that reveals how the neighborhood once worked before later development enclosed it.",
              claimIds: [claimId],
            },
          ],
          ungroupedClaimIds: [],
        },
      },
    };
    const gated = makeGatedStub({
      [subjectId]: makeFakeCuratedEntry(subjectId),
    });
    const resolved = resolveSubjectDiscoveryProjections(grouping, gated);

    expect(resolved[subjectId].angleGroups).toHaveLength(1);
    expect(resolved[subjectId].angleGroups[0].claimIds).toEqual([claimId]);
    expect(resolved[subjectId].angleGroups[0].centralQuestion).toBe(
      "Why is there a secret courtyard and carriage house hidden behind an ordinary Hell's Kitchen street wall?",
    );
    expect(resolved[subjectId].angleGroups[0].perspectiveShift).toBe(
      "Behind an ordinary dense street wall survives an older spatial layer of the city that reveals how the neighborhood once worked before later development enclosed it.",
    );
    expect(resolved[subjectId].flattenedFallback).toBeUndefined();
  });

  it("Film Center Building (SYNTHETIC — no real canonical claim data exists for this subject): exactly 3 distinct AngleGroups with calibrated centralQuestion/perspectiveShift, and a shared synthetic claimId intentionally referenced by two of them without being deduped or dropped", () => {
    const subjectId = "SYNTHETIC/film-center-building";
    const sharedClaimId = "SYNTHETIC-claim-purpose-built-film-industry";
    const grouping: AngleGroupingResult = {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      bySubject: {
        [subjectId]: {
          subjectId,
          angleGroups: [
            {
              subjectId,
              angleId: "nitrate-fireproofing-infrastructure",
              centralQuestion:
                "Why did this office building need such heavy-duty fireproofing, vaults, vents, doors, and other specialized infrastructure?",
              perspectiveShift:
                "The building's heavy construction and fireproofing are physical evidence of its vanished function storing highly combustible nitrate film.",
              claimIds: ["SYNTHETIC-claim-3", sharedClaimId],
            },
            {
              subjectId,
              angleId: "ninth-avenue-film-district",
              centralQuestion:
                "Why was a purpose-built film-storage and distribution building located here, on Ninth Avenue?",
              perspectiveShift:
                "The Film Center Building is evidence that this part of Midtown once functioned as physical infrastructure for storing, moving, and distributing movies.",
              claimIds: ["SYNTHETIC-claim-4", sharedClaimId],
            },
            {
              subjectId,
              angleId: "art-deco-treatment",
              centralQuestion:
                "Why did a building whose practical job included storing and distributing dangerous film reels receive such elaborate, fashionable Art Deco treatment?",
              perspectiveShift:
                "Its Art Deco treatment becomes more than a style label: a highly practical film-logistics building was also made conspicuously modern and glamorous.",
              claimIds: ["SYNTHETIC-claim-5"],
            },
          ],
          ungroupedClaimIds: [],
        },
      },
    };
    const gated = makeGatedStub({});
    const resolved = resolveSubjectDiscoveryProjections(grouping, gated);

    expect(resolved[subjectId].angleGroups).toHaveLength(3);
    const angleIds = resolved[subjectId].angleGroups.map((g) => g.angleId);
    expect(new Set(angleIds).size).toBe(3);

    const nitrate = resolved[subjectId].angleGroups.find(
      (g) => g.angleId === "nitrate-fireproofing-infrastructure",
    )!;
    const ninthAve = resolved[subjectId].angleGroups.find(
      (g) => g.angleId === "ninth-avenue-film-district",
    )!;
    expect(nitrate.claimIds).toContain(sharedClaimId);
    expect(ninthAve.claimIds).toContain(sharedClaimId);
    // The shared claimId's second reference is not deduped or dropped -- it
    // appears once in each of the two groups' own claimIds arrays.
    const totalReferences = resolved[subjectId].angleGroups
      .flatMap((g) => g.claimIds)
      .filter((id) => id === sharedClaimId).length;
    expect(totalReferences).toBe(2);

    expect(resolved[subjectId].flattenedFallback).toBeUndefined();
  });

  it("Library Hotel (SYNTHETIC — no real canonical claim data exists for this subject): exactly 2 distinct AngleGroups with the calibrated centralQuestion/perspectiveShift", () => {
    const subjectId = "SYNTHETIC/library-hotel";
    const grouping: AngleGroupingResult = {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      bySubject: {
        [subjectId]: {
          subjectId,
          angleGroups: [
            {
              subjectId,
              angleId: "sliver-lot-form",
              centralQuestion:
                "Why is this building such a narrow sliver, and how did the awkward lot shape what you see today?",
              perspectiveShift:
                "The building's unusual narrowness is not just a visual oddity; the dimensions of the lot directly shaped the surviving building.",
              claimIds: ["SYNTHETIC-claim-1"],
            },
            {
              subjectId,
              angleId: "dewey-oclc-dispute",
              centralQuestion:
                "How did a boutique hotel's library gimmick turn into a legal fight with the organization behind the Dewey Decimal System?",
              perspectiveShift:
                "The Library Hotel's Dewey theme was not merely decorative or quirky; it was taken far enough to trigger a real legal dispute with OCLC.",
              claimIds: ["SYNTHETIC-claim-2"],
            },
          ],
          ungroupedClaimIds: [],
        },
      },
    };
    const gated = makeGatedStub({});
    const resolved = resolveSubjectDiscoveryProjections(grouping, gated);

    expect(resolved[subjectId].angleGroups).toHaveLength(2);
    expect(
      resolved[subjectId].angleGroups.map((g) => g.angleId).sort(),
    ).toEqual(["dewey-oclc-dispute", "sliver-lot-form"]);
    expect(resolved[subjectId].flattenedFallback).toBeUndefined();
  });

  it("admitted-but-ungrouped: a claim not assigned to any AngleGroup remains explicitly present in ungroupedClaimIds (SYNTHETIC structural fixture)", () => {
    const subjectId = "SYNTHETIC/mixed-grouped-ungrouped";
    const grouping: AngleGroupingResult = {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      bySubject: {
        [subjectId]: {
          subjectId,
          angleGroups: [
            {
              subjectId,
              angleId: "SYNTHETIC-angle",
              centralQuestion: "SYNTHETIC structural test question",
              perspectiveShift: "SYNTHETIC structural test perspective shift",
              claimIds: ["SYNTHETIC-claim-grouped"],
            },
          ],
          ungroupedClaimIds: ["SYNTHETIC-claim-ungrouped"],
        },
      },
    };
    expect(grouping.bySubject[subjectId].ungroupedClaimIds).toEqual([
      "SYNTHETIC-claim-ungrouped",
    ]);
    expect(
      grouping.bySubject[subjectId].angleGroups.flatMap((g) => g.claimIds),
    ).toEqual(["SYNTHETIC-claim-grouped"]);
    // Non-empty angleGroups => no fallback, regardless of ungrouped leftovers.
    const gated = makeGatedStub({
      [subjectId]: makeFakeCuratedEntry(subjectId),
    });
    const resolved = resolveSubjectDiscoveryProjections(grouping, gated);
    expect(resolved[subjectId].flattenedFallback).toBeUndefined();
  });
});
