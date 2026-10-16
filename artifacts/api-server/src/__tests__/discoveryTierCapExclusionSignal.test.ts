import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/curatedLocalHistory", () => ({
  getApprovedCuratedEntry: vi.fn(),
}));

import { getApprovedCuratedEntry } from "../lib/curatedLocalHistory";
import {
  classifyDiscoveryTier,
  applyDiscoveryTier,
  PLACEHOLDER_SUMMARY,
} from "../lib/discoveryTier";
import type { CuratedEntry } from "../lib/curatedLocalHistory";

const mockedGetApprovedCuratedEntry = vi.mocked(getApprovedCuratedEntry);

function curatedEntry(
  overrides: Partial<CuratedEntry["evidence"]> = {},
): CuratedEntry {
  return {
    source: {
      title: "Test Source",
      sourceType: "local public-history narrative source",
      usageNote: "test",
    },
    evidence: {
      subjectId: "way/000000001",
      text: "test evidence text",
      claimScope: "test claim scope",
      verificationStatus: "approved",
      verificationConfidence: "high",
      curatedTrust: "medium",
      lastVerifiedDate: "2026-01-01",
      admissionMethod: "automated",
      ...overrides,
    },
  };
}

function placeholderPlace(extras: Record<string, unknown> = {}) {
  return {
    name: "Test Place",
    summary: PLACEHOLDER_SUMMARY,
    facts: [],
    osmId: "way/1",
    ...extras,
  };
}

beforeEach(() => {
  mockedGetApprovedCuratedEntry.mockReset();
});

// ---------------------------------------------------------------------------
// explicitDiscoveryTier override + copyGenSelected
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — cap-exclusion placeholder carve-out (explicitDiscoveryTier override)", () => {
  it("curated + placeholder + copyGenSelected: false → rescued to the explicit tier", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ explicitDiscoveryTier: 2 }),
    );
    const places: any[] = [placeholderPlace({ copyGenSelected: false })];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(2);
    expect(places[0].discoveryRejectionReason).toBeUndefined();
  });

  it("curated + placeholder + copyGenSelected: true → Tier 4 placeholderFallback remains", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ explicitDiscoveryTier: 2 }),
    );
    const places: any[] = [placeholderPlace({ copyGenSelected: true })];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("placeholderFallback");
  });

  it("curated + placeholder + copyGenSelected absent (legacy cache entry) → Tier 4 placeholderFallback remains", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ explicitDiscoveryTier: 2 }),
    );
    const places: any[] = [placeholderPlace()];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("placeholderFallback");
  });
});

// ---------------------------------------------------------------------------
// hasStoryBearingClaim override + copyGenSelected
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — cap-exclusion placeholder carve-out (hasStoryBearingClaim override)", () => {
  it("curated + placeholder + copyGenSelected: false → rescued to unclassified (not promoted to a positive tier)", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const places: any[] = [placeholderPlace({ copyGenSelected: false })];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBeUndefined();
    expect(places[0].discoveryRejectionReason).toBeUndefined();
  });

  it("curated + placeholder + copyGenSelected: true → Tier 4 placeholderFallback remains", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const places: any[] = [placeholderPlace({ copyGenSelected: true })];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("placeholderFallback");
  });

  it("curated + placeholder + copyGenSelected absent (legacy cache entry) → Tier 4 placeholderFallback remains", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const places: any[] = [placeholderPlace()];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("placeholderFallback");
  });
});

// ---------------------------------------------------------------------------
// Non-curated places and no-rescue-available cases
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — cap-exclusion signal never invents a rescue on its own", () => {
  it("non-curated place + placeholder + copyGenSelected: false → still Tier 4 (no curated evidence to rescue with)", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(undefined);
    const places: any[] = [placeholderPlace({ copyGenSelected: false })];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("placeholderFallback");
  });

  it("curated entry with neither explicitDiscoveryTier nor hasStoryBearingClaim + placeholder + copyGenSelected: false → still Tier 4", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(curatedEntry());
    const places: any[] = [placeholderPlace({ copyGenSelected: false })];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBe(4);
    expect(places[0].discoveryRejectionReason).toBe("placeholderFallback");
  });
});

// ---------------------------------------------------------------------------
// Existing metadataOnly/noHistoricalDepth curated rescue is unchanged by
// this feature — isRescuableTier4 itself was not modified.
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — pre-existing metadataOnly/noHistoricalDepth rescue is unaffected", () => {
  it("non-placeholder T4-A metadataOnly is still rescued by hasStoryBearingClaim regardless of copyGenSelected", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const summary = "A small structure near the edge of the block.";
    const baseline = classifyDiscoveryTier({ summary, facts: [] });
    expect(baseline.rejectionReason).toBe("metadataOnly");

    const places: any[] = [
      {
        name: "Test",
        summary,
        facts: [],
        osmId: "way/9",
        copyGenSelected: true,
      },
    ];
    applyDiscoveryTier(places);
    expect(places[0].discoveryTier).toBeUndefined();
    expect(places[0].discoveryRejectionReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Route-level integration: simulates the exact cappedCandidateIds derivation
// used in routes/explore/index.ts (distance-sorted, sliced to
// COPY_GEN_CANDIDATE_CAP, Set over resulting osmIds) feeding into the merge
// step's copyGenSelected field, for a dense (>22 candidate) osm-anchor batch.
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — dense route-level osm-anchor batch (cap derivation integration)", () => {
  const COPY_GEN_CANDIDATE_CAP = 22;

  function buildDenseBatch(curatedOsmId: string, curatedDistanceRank: number) {
    // 30 candidates, distance-sorted ascending (closest first), mirroring the
    // route's cappedCandidates derivation. The curated candidate is placed at
    // `curatedDistanceRank` (0-indexed) among them.
    const candidates = Array.from({ length: 30 }, (_, i) => ({
      osmId: i === curatedDistanceRank ? curatedOsmId : `way/${1000 + i}`,
      distanceMeters: i * 10,
    }));
    const cappedCandidates = [...candidates]
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, COPY_GEN_CANDIDATE_CAP);
    const cappedCandidateIds = new Set(cappedCandidates.map((c) => c.osmId));

    // Merge step: every candidate gets a merged place; those not selected
    // for copy-gen fall back to the placeholder shape exactly as the route
    // does (copy?.summary ?? PLACEHOLDER_SUMMARY, copy?.facts ?? []).
    return candidates.map((c): any => ({
      name: "Test",
      osmId: c.osmId,
      summary: PLACEHOLDER_SUMMARY,
      facts: [],
      copyGenSelected: cappedCandidateIds.has(c.osmId),
    }));
  }

  it("curated candidate beyond the 22-candidate cap: copyGenSelected is false and the curated rescue applies", () => {
    mockedGetApprovedCuratedEntry.mockImplementation((id: string) =>
      id === "way/265322610"
        ? curatedEntry({
            subjectId: "way/265322610",
            hasStoryBearingClaim: true,
          })
        : undefined,
    );
    const places = buildDenseBatch("way/265322610", 25); // rank 25 > cap of 22
    applyDiscoveryTier(places);
    const curatedPlace = places.find((p) => p.osmId === "way/265322610")!;
    expect(curatedPlace.copyGenSelected).toBe(false);
    expect(curatedPlace.discoveryTier).toBeUndefined();
    expect(curatedPlace.discoveryRejectionReason).toBeUndefined();
  });

  it("curated candidate within the cap with normal generated copy: unchanged behavior (classifier runs normally)", () => {
    mockedGetApprovedCuratedEntry.mockImplementation((id: string) =>
      id === "way/265322610"
        ? curatedEntry({
            subjectId: "way/265322610",
            hasStoryBearingClaim: true,
          })
        : undefined,
    );
    const places = buildDenseBatch("way/265322610", 5); // rank 5 < cap of 22
    // Simulate normal generated copy for the in-cap candidate (not the
    // placeholder fallback) — copyGenSelected is true.
    const curated = places.find((p) => p.osmId === "way/265322610")!;
    curated.summary =
      "Originally built as a synagogue in 1917, the building became known as the Actors' Temple.";
    expect(curated.copyGenSelected).toBe(true);

    applyDiscoveryTier(places);
    expect(curated.discoveryTier).toBe(1);
    expect(curated.discoveryRejectionReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// In-flight / coalesced-waiter preservation: applyDiscoveryTier is a pure
// function of each place object's own fields, so re-running it on the exact
// same stored object (as respondFromDiscoverEntry does on every cache hit /
// coalesced waiter) is idempotent and preserves the same signal/result.
// ---------------------------------------------------------------------------

describe("applyDiscoveryTier — idempotent across repeated (cache-hit / coalesced-waiter) invocations", () => {
  it("re-running applyDiscoveryTier on the same stored place object yields the same rescued result", () => {
    mockedGetApprovedCuratedEntry.mockReturnValue(
      curatedEntry({ hasStoryBearingClaim: true }),
    );
    const places: any[] = [placeholderPlace({ copyGenSelected: false })];

    applyDiscoveryTier(places); // "fresh generation" run
    const firstResult = {
      discoveryTier: places[0].discoveryTier,
      discoveryRejectionReason: places[0].discoveryRejectionReason,
    };

    applyDiscoveryTier(places); // simulated cache-hit / coalesced-waiter re-run
    expect(places[0].discoveryTier).toBe(firstResult.discoveryTier);
    expect(places[0].discoveryRejectionReason).toBe(
      firstResult.discoveryRejectionReason,
    );
    expect(places[0].discoveryTier).toBeUndefined();
  });
});
