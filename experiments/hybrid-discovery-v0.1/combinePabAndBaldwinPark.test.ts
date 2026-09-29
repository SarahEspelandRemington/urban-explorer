/**
 * Regression tests for the Hybrid Discovery v1 sibling-placeKey
 * canonicalization + Baldwin Park extraction dedup fix (see
 * combinePabAndBaldwinPark.ts). Offline/non-production, experimental — see
 * README.md.
 *
 * NOTE ON TEST-RUNNER SCOPE: this file lives under experiments/
 * hybrid-discovery-v0.1/ and is not currently scanned by the committed CI
 * test path (artifacts/api-server/src only) — same disclosed limitation as
 * pab/pabGrounding.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  combinePabAndBaldwinParkClaims,
  computePlaceKeysBySubjectId,
  canonicalPlaceKeyForSubject,
  type CombinablePabPlace,
} from "./combinePabAndBaldwinPark";
import {
  extractClaimsFromPabRecord,
  buildPabSource,
} from "./pab/pabClaimExtractor";
import type { PabRetrievalRecord } from "./pab/pabAdapter";
import type { PabInterpretedRecord } from "./pab/pabInterpreter";
import type { PabGroundingResult } from "./pab/pabGrounding";
import type { BaldwinParkPage } from "./baldwinpark/baldwinParkAdapter";
import type { Claim, Source } from "./types";
import { generateArtifact } from "../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";

const SHARED_SUBJECT_ID = "way/1314403623";

function makeRecord(pabId: string): PabRetrievalRecord {
  return {
    pabId,
    url: `https://example.invalid/pab-${pabId}`,
    title: "Test Building",
    addressBlock: ["1901 Spring Garden St"],
    matchedCorridorAddresses: ["1901 Spring Garden St"],
  };
}

function makeConstructionDateInterpreted(
  pabId: string,
  dateRaw: string,
): PabInterpretedRecord {
  return {
    pabId,
    url: `https://example.invalid/pab-${pabId}`,
    title: "Test Building",
    classification: "claim-bearing",
    plainText: "",
    signals: {
      chronologyEvents: [
        { dateRaw, eventRaw: "BUILT", architects: [], contractors: [] },
      ],
    },
  };
}

function makeClientOnlyInterpreted(pabId: string): PabInterpretedRecord {
  return {
    pabId,
    url: `https://example.invalid/pab-${pabId}`,
    title: "Test Building",
    classification: "claim-bearing",
    plainText: "",
    signals: { client: "A Named Client" },
  };
}

function makeGrounding(osmElementId?: string): PabGroundingResult {
  return {
    category: "current-entity",
    proposedIdentityType: "current-osm-entity",
    confidence: "high",
    osmElementId,
  };
}

const BP_PAGE: BaldwinParkPage = {
  url: "https://example.invalid/bp-test-page",
  slug: "test-page",
  title: "Test Page",
  plainText: "1901 Spring Garden Street was built in 1875.",
};

function isFromBp(claim: Claim): boolean {
  return claim.sourceIds.some((id) => id.startsWith("bp-"));
}
function isFromPab(claim: Claim): boolean {
  return claim.sourceIds.some((id) => id.startsWith("pab-"));
}

/** Builds two sibling places at the same address sharing SHARED_SUBJECT_ID, the first carrying whatever PAB claims `interpreted` produces. */
function makeSiblingPlaces(interpreted: PabInterpretedRecord): {
  places: CombinablePabPlace[];
  pabOnlyClaims: Claim[];
  pabSources: Record<string, Source>;
} {
  const record = makeRecord(interpreted.pabId);
  const pabSource = buildPabSource(record, interpreted);
  const pabClaims = extractClaimsFromPabRecord(record, interpreted).map((c) => {
    c.proposedIdentityType = "current-osm-entity";
    c.productionSubjectId = SHARED_SUBJECT_ID;
    return c;
  });

  const places: CombinablePabPlace[] = [
    {
      placeKey: `pab-record-${interpreted.pabId}`,
      address: "1901 Spring Garden St",
      title: "Test Building",
      grounding: makeGrounding(SHARED_SUBJECT_ID),
      pabClaims,
    },
    {
      placeKey: "pab-record-sibling",
      address: "1901 Spring Garden St",
      title: "Test Building",
      grounding: makeGrounding(SHARED_SUBJECT_ID),
      pabClaims: [],
    },
  ];
  return {
    places,
    pabOnlyClaims: pabClaims,
    pabSources: { [pabSource.id]: pabSource },
  };
}

describe("combinePabAndBaldwinParkClaims — sibling-placeKey canonicalization", () => {
  it("both sides of a same-fact construction-date conflict remain HOLD when two sibling PAB placeKeys share one productionSubjectId", () => {
    const { places, pabOnlyClaims, pabSources } = makeSiblingPlaces(
      makeConstructionDateInterpreted("75513", "1865"),
    );

    const { combinedPabClaims, combinedSources } =
      combinePabAndBaldwinParkClaims(places, pabOnlyClaims, pabSources, [
        BP_PAGE,
      ]);

    // Exactly one Baldwin Park claim extracted (deduped across the two sibling placeKeys).
    const bpClaims = combinedPabClaims.filter(isFromBp);
    expect(bpClaims).toHaveLength(1);

    const pabConstructionClaim = combinedPabClaims.find(
      (c) => isFromPab(c) && c.claimType === "construction-date",
    );
    expect(pabConstructionClaim).toBeDefined();

    const canonicalPlaceKey = `subject:${SHARED_SUBJECT_ID}`;
    expect(pabConstructionClaim!.placeKey).toBe(canonicalPlaceKey);
    expect(bpClaims[0].placeKey).toBe(canonicalPlaceKey);

    const artifact = generateArtifact(combinedPabClaims, combinedSources);
    const pabOutcome = artifact.claims.find(
      (r) => r.claimId === pabConstructionClaim!.id,
    )!;
    const bpOutcome = artifact.claims.find(
      (r) => r.claimId === bpClaims[0].id,
    )!;
    expect(pabOutcome.decision.decision).toBe("HOLD");
    expect(bpOutcome.decision.decision).toBe("HOLD");
  });

  it("multiple PAB records resolving to one production subject do not create duplicate Baldwin Park claims/prose", () => {
    const { places, pabOnlyClaims, pabSources } = makeSiblingPlaces(
      makeClientOnlyInterpreted("75513"),
    );

    const { combinedPabClaims } = combinePabAndBaldwinParkClaims(
      places,
      pabOnlyClaims,
      pabSources,
      [BP_PAGE],
    );

    const bpClaims = combinedPabClaims.filter(isFromBp);
    expect(bpClaims).toHaveLength(1);
    expect(bpClaims[0].claimText).toContain("1875");
  });

  it("a single place with no sibling is unaffected: canonical placeKey equals its own placeKey and the Baldwin Park claim AUTO-ADMITs normally", () => {
    const record = makeRecord("1900");
    const interpreted = makeClientOnlyInterpreted("1900");
    const pabSource = buildPabSource(record, interpreted);
    const pabClaims = extractClaimsFromPabRecord(record, interpreted).map(
      (c) => {
        c.proposedIdentityType = "current-osm-entity";
        c.productionSubjectId = SHARED_SUBJECT_ID;
        return c;
      },
    );

    const places: CombinablePabPlace[] = [
      {
        placeKey: "pab-record-1900",
        address: "1901 Spring Garden St",
        title: "Test Building",
        grounding: makeGrounding(SHARED_SUBJECT_ID),
        pabClaims,
      },
    ];
    const pabSources: Record<string, Source> = { [pabSource.id]: pabSource };

    const { combinedPabClaims, combinedSources } =
      combinePabAndBaldwinParkClaims(places, pabClaims, pabSources, [BP_PAGE]);

    const bpClaims = combinedPabClaims.filter(isFromBp);
    expect(bpClaims).toHaveLength(1);
    expect(bpClaims[0].placeKey).toBe("pab-record-1900");

    const artifact = generateArtifact(combinedPabClaims, combinedSources);
    const bpOutcome = artifact.claims.find(
      (r) => r.claimId === bpClaims[0].id,
    )!;
    expect(bpOutcome.decision.decision).toBe("AUTO-ADMIT");
  });
});

describe("computePlaceKeysBySubjectId / canonicalPlaceKeyForSubject — pure helper behavior", () => {
  it("groups placeKeys sharing a subjectId, and returns the synthetic canonical key only when >=2 siblings exist", () => {
    const map = computePlaceKeysBySubjectId([
      { placeKey: "a", grounding: { osmElementId: "way/1" } },
      { placeKey: "b", grounding: { osmElementId: "way/1" } },
      { placeKey: "c", grounding: { osmElementId: "way/2" } },
    ]);
    expect(canonicalPlaceKeyForSubject(map, "way/1", "a")).toBe(
      "subject:way/1",
    );
    expect(canonicalPlaceKeyForSubject(map, "way/1", "b")).toBe(
      "subject:way/1",
    );
    expect(canonicalPlaceKeyForSubject(map, "way/2", "c")).toBe("c");
  });

  it("returns the place's own placeKey unchanged when subjectId is undefined", () => {
    const map = computePlaceKeysBySubjectId([{ placeKey: "a", grounding: {} }]);
    expect(canonicalPlaceKeyForSubject(map, undefined, "a")).toBe("a");
  });
});

describe("canonicalization generalizes to non-PAB/BP source pairs (NYC Phase 3: LPC + Ephemeral)", () => {
  const SHARED = "way/265301770";

  function makeClaim(overrides: Partial<Claim>): Claim {
    return {
      id: "c",
      placeKey: "p",
      proposedIdentityType: "current-osm-entity",
      sourceIds: ["s1"],
      supportingSpan: "span",
      claimType: "construction-date",
      claimText: "text",
      productionSubjectId: SHARED,
      ...overrides,
    };
  }

  it("canonicalizes LPC- and Ephemeral-shaped placeKeys (not pab-/bp- prefixed) sharing one productionSubjectId, and the existing temporalConsistency check then HOLDs the resulting same-fact date conflict", () => {
    const lpcClaim = makeClaim({
      id: "lpc-row-12-construction-date",
      placeKey: "lpc-record-row-12",
      sourceIds: ["lpc-row-12"],
      claimText: "LPC: dated 1924 - 1926",
      dateRange: { start: "1924-01-01", end: "1926-01-01", precise: true },
    });
    const ephemeralClaim = makeClaim({
      id: "eny-fashion-tower-construction-date",
      placeKey: "eny-fashion-tower",
      sourceIds: ["eny-fashion-tower-article"],
      claimText: "Ephemeral: circa-1922",
      dateRange: { start: "1922-01-01", precise: true },
    });

    const placeKeysBySubjectId = computePlaceKeysBySubjectId([
      { placeKey: lpcClaim.placeKey, grounding: { osmElementId: SHARED } },
      {
        placeKey: ephemeralClaim.placeKey,
        grounding: { osmElementId: SHARED },
      },
    ]);
    const claims = [lpcClaim, ephemeralClaim].map((c) => ({
      ...c,
      placeKey: canonicalPlaceKeyForSubject(
        placeKeysBySubjectId,
        c.productionSubjectId,
        c.placeKey,
      ),
    }));

    const canonicalKey = `subject:${SHARED}`;
    expect(claims[0].placeKey).toBe(canonicalKey);
    expect(claims[1].placeKey).toBe(canonicalKey);

    const sources: Record<string, Source> = {
      "lpc-row-12": {
        id: "lpc-row-12",
        title: "LPC test source",
        sourceClass: "government-preservation-record",
        capabilities: [{ claimType: "construction-date", strength: "high" }],
      },
      "eny-fashion-tower-article": {
        id: "eny-fashion-tower-article",
        title: "Ephemeral test source",
        sourceClass: "local-public-history-narrative",
        capabilities: [{ claimType: "construction-date", strength: "medium" }],
      },
    };
    const artifact = generateArtifact(claims, sources);
    const lpcOutcome = artifact.claims.find((r) => r.claimId === claims[0].id)!;
    const ephemeralOutcome = artifact.claims.find(
      (r) => r.claimId === claims[1].id,
    )!;

    expect(lpcOutcome.decision.decision).toBe("HOLD");
    expect(ephemeralOutcome.decision.decision).toBe("HOLD");
    expect(
      lpcOutcome.checks.find((c) => c.checkId === "temporal-consistency")
        ?.outcome,
    ).toBe("block-auto-admit");
  });

  it("without canonicalization (source-native placeKeys left as-is), the same conflicting claims incorrectly both AUTO-ADMIT — demonstrates why the fix is necessary", () => {
    const lpcClaim = makeClaim({
      id: "lpc-row-12-construction-date",
      placeKey: "lpc-record-row-12",
      sourceIds: ["lpc-row-12"],
      dateRange: { start: "1924-01-01", end: "1926-01-01", precise: true },
    });
    const ephemeralClaim = makeClaim({
      id: "eny-fashion-tower-construction-date",
      placeKey: "eny-fashion-tower",
      sourceIds: ["eny-fashion-tower-article"],
      dateRange: { start: "1922-01-01", precise: true },
    });
    const sources: Record<string, Source> = {
      "lpc-row-12": {
        id: "lpc-row-12",
        title: "LPC test source",
        sourceClass: "government-preservation-record",
        capabilities: [{ claimType: "construction-date", strength: "high" }],
      },
      "eny-fashion-tower-article": {
        id: "eny-fashion-tower-article",
        title: "Ephemeral test source",
        sourceClass: "local-public-history-narrative",
        capabilities: [{ claimType: "construction-date", strength: "medium" }],
      },
    };

    const artifact = generateArtifact([lpcClaim, ephemeralClaim], sources);
    const lpcOutcome = artifact.claims.find((r) => r.claimId === lpcClaim.id)!;
    const ephemeralOutcome = artifact.claims.find(
      (r) => r.claimId === ephemeralClaim.id,
    )!;

    expect(lpcOutcome.decision.decision).toBe("AUTO-ADMIT");
    expect(ephemeralOutcome.decision.decision).toBe("AUTO-ADMIT");
  });
});
