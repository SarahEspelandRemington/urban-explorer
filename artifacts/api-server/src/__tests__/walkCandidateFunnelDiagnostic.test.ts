import { describe, it, expect } from "vitest";
import {
  buildWalkCandidateFunnelDiagnostic,
  buildWalkCandidateFunnelLogEvents,
  classifyPreCopyGenExclusionReason,
  shouldEmitWalkCandidateFunnelDiagnostic,
  type FunnelCopyGenCandidateInput,
  type FunnelRawCandidate,
} from "../lib/walkCandidateFunnelDiagnostic";

const CAP = 22;

function raw(
  osmId: string,
  overrides: Partial<FunnelRawCandidate> = {},
): FunnelRawCandidate {
  return {
    osmId,
    name: `Place ${osmId}`,
    tags: { name: `Place ${osmId}`, building: "yes", historic: "building" },
    distanceMeters: 100,
    ...overrides,
  };
}

function copyGenCand(
  rank: number,
  overrides: Partial<FunnelCopyGenCandidateInput> = {},
): FunnelCopyGenCandidateInput {
  return {
    osmId: `way/${rank}`,
    name: `Place ${rank}`,
    tags: { name: `Place ${rank}`, building: "yes", historic: "building" },
    distanceMeters: rank * 10,
    ...overrides,
  };
}

describe("shouldEmitWalkCandidateFunnelDiagnostic", () => {
  it("is false outside Walk Mode even when over the cap", () => {
    expect(shouldEmitWalkCandidateFunnelDiagnostic(false, 30, CAP)).toBe(false);
  });

  it("is false in Walk Mode when at or below the cap", () => {
    expect(shouldEmitWalkCandidateFunnelDiagnostic(true, 22, CAP)).toBe(false);
    expect(shouldEmitWalkCandidateFunnelDiagnostic(true, 10, CAP)).toBe(false);
  });

  it("is true only in Walk Mode and only when over the cap", () => {
    expect(shouldEmitWalkCandidateFunnelDiagnostic(true, 23, CAP)).toBe(true);
  });
});

describe("classifyPreCopyGenExclusionReason", () => {
  const deps = {
    effectiveDenylist: new Set(["garage"]),
    searchRadiusMeters: 300,
  };

  it("classifies a denylisted building", () => {
    const c = raw("way/1", { tags: { building: "garage" } });
    expect(classifyPreCopyGenExclusionReason(c, deps)).toBe(
      "denylist_building",
    );
  });

  it("classifies a boring residential building with no curated entry", () => {
    const c = raw("way/2", { tags: { building: "apartments" } });
    expect(classifyPreCopyGenExclusionReason(c, deps)).toBe(
      "boring_residential",
    );
  });

  it("classifies ordinary commercial use with no curated entry", () => {
    const c = raw("way/3", { tags: { shop: "convenience" } });
    expect(classifyPreCopyGenExclusionReason(c, deps)).toBe(
      "ordinary_commercial_use",
    );
  });

  it("classifies a candidate outside the search radius", () => {
    const c = raw("way/4", {
      tags: { building: "office", historic: "building" },
      distanceMeters: 1000,
    });
    expect(classifyPreCopyGenExclusionReason(c, deps)).toBe("outside_radius");
  });

  it("classifies an osm_bare candidate with no curated entry", () => {
    const c = raw("way/5", { tags: {} });
    expect(classifyPreCopyGenExclusionReason(c, deps)).toBe(
      "osm_bare_no_curated",
    );
  });
});

describe("buildWalkCandidateFunnelDiagnostic", () => {
  const baseInput = {
    requestCenter: { lat: 40.76, lon: -73.98 },
    requestedRadiusMeters: 300,
    candidateCap: CAP,
    effectiveDenylist: new Set<string>(),
    now: () => new Date("2026-11-04T00:00:00.000Z"),
  };

  it("includes the full ordered pre-cap list when over cap, marking inside/below the cutoff", () => {
    const copyGenCandidates = Array.from({ length: 26 }, (_, i) =>
      copyGenCand(i + 1),
    ).reverse(); // out of order on purpose — function must sort
    const diagnostic = buildWalkCandidateFunnelDiagnostic({
      ...baseInput,
      rawOsmCandidates: copyGenCandidates.map((c) => raw(c.osmId)),
      copyGenCandidates,
    });
    expect(diagnostic.copyGenCandidateList).toHaveLength(26);
    expect(diagnostic.copyGenCandidateList.map((r) => r.distanceRank)).toEqual(
      Array.from({ length: 26 }, (_, i) => i + 1),
    );
    expect(
      diagnostic.copyGenCandidateList.filter((r) => r.insideCap),
    ).toHaveLength(22);
    // Ranks beyond 22 are retained, not dropped — required for offline N=1..6 sweeps.
    const ranks23to26 = diagnostic.copyGenCandidateList
      .filter((r) => r.distanceRank > 22)
      .map((r) => r.distanceRank);
    expect(ranks23to26).toEqual([23, 24, 25, 26]);
  });

  it("marks exact-knowledge-tag status matching the existing reserved-slot definition", () => {
    const copyGenCandidates = [
      copyGenCand(1, { tags: { wikidata: "Q123" } }),
      copyGenCand(2, { tags: { "operator:wikidata": "Q456" } }), // look-alike, must NOT count
      copyGenCand(3, { tags: { wikipedia: "en:Real Place" } }),
    ];
    const diagnostic = buildWalkCandidateFunnelDiagnostic({
      ...baseInput,
      rawOsmCandidates: copyGenCandidates.map((c) => raw(c.osmId)),
      copyGenCandidates,
    });
    const byOsmId = new Map(
      diagnostic.copyGenCandidateList.map((r) => [r.osmId, r]),
    );
    expect(byOsmId.get("way/1")?.hasExactKnowledgeTag).toBe(true);
    expect(byOsmId.get("way/2")?.hasExactKnowledgeTag).toBe(false);
    expect(byOsmId.get("way/3")?.hasExactKnowledgeTag).toBe(true);
  });

  it("marks protected/displaceable status matching the existing reserved-slot definition", () => {
    const copyGenCandidates = [
      copyGenCand(1, { candidateOrigin: "streetlit" }),
      copyGenCand(2, { candidateOrigin: "approvedRescue" }),
      copyGenCand(3), // ordinary OSM candidate, not protected
    ];
    const diagnostic = buildWalkCandidateFunnelDiagnostic({
      ...baseInput,
      rawOsmCandidates: copyGenCandidates.map((c) => raw(c.osmId)),
      copyGenCandidates,
    });
    const byOsmId = new Map(
      diagnostic.copyGenCandidateList.map((r) => [r.osmId, r]),
    );
    expect(byOsmId.get("way/1")?.isDisplacementProtected).toBe(true);
    expect(byOsmId.get("way/2")?.isDisplacementProtected).toBe(true);
    expect(byOsmId.get("way/3")?.isDisplacementProtected).toBe(false);
  });

  it("lists raw candidates excluded before copyGenCandidates with an existing reason", () => {
    const copyGenCandidates = [copyGenCand(1)];
    const excludedRaw = raw("way/999", {
      name: "Excluded Shop",
      tags: { shop: "bakery" },
      distanceMeters: 50,
    });
    const diagnostic = buildWalkCandidateFunnelDiagnostic({
      ...baseInput,
      rawOsmCandidates: [raw(copyGenCandidates[0].osmId), excludedRaw],
      copyGenCandidates,
    });
    expect(diagnostic.excludedBeforeCopyGen).toEqual([
      {
        osmId: "way/999",
        name: "Excluded Shop",
        distanceMeters: 50,
        reason: "ordinary_commercial_use",
      },
    ]);
  });

  it("falls back to not_retained when no deterministic reason matches", () => {
    const copyGenCandidates = [copyGenCand(1)];
    const mystery = raw("way/777", {
      tags: { name: "Mystery", amenity: "cafe" },
      distanceMeters: 10,
    });
    const diagnostic = buildWalkCandidateFunnelDiagnostic({
      ...baseInput,
      rawOsmCandidates: [raw(copyGenCandidates[0].osmId), mystery],
      copyGenCandidates,
    });
    expect(diagnostic.excludedBeforeCopyGen[0].reason).toBe("not_retained");
  });

  it("emits no evidence text, generated copy, or other large narrative fields", () => {
    const copyGenCandidates = [copyGenCand(1)];
    const diagnostic = buildWalkCandidateFunnelDiagnostic({
      ...baseInput,
      rawOsmCandidates: [raw(copyGenCandidates[0].osmId)],
      copyGenCandidates,
    });
    const serialized = JSON.stringify(diagnostic).toLowerCase();
    for (const forbidden of [
      "wikipedia_extract",
      "wikipediacontent",
      "narration",
      "generatedcopy",
      "evidencetext",
      'summary":"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    const allowedKeys = new Set([
      "osmid",
      "name",
      "distancemeters",
      "distancerank",
      "insidecap",
      "hasexactknowledgetag",
      "isdisplacementprotected",
      "reason",
    ]);
    for (const row of diagnostic.copyGenCandidateList) {
      for (const key of Object.keys(row)) {
        expect(allowedKeys.has(key.toLowerCase())).toBe(true);
      }
    }
    for (const row of diagnostic.excludedBeforeCopyGen) {
      for (const key of Object.keys(row)) {
        expect(allowedKeys.has(key.toLowerCase())).toBe(true);
      }
    }
  });
});

describe("buildWalkCandidateFunnelLogEvents", () => {
  const baseDiagnostic = {
    timestamp: "2026-11-04T00:00:00.000Z",
    requestCenter: { lat: 40.76, lon: -73.98 },
    requestedRadiusMeters: 300,
    candidateCap: CAP,
    counts: { rawOsmCandidates: 100, copyGenCandidates: 40 },
  };

  function excludedRow(i: number) {
    return {
      osmId: `way/${i}`,
      name: `Excluded ${i}`,
      distanceMeters: i,
      reason: "outside_radius" as const,
    };
  }

  function copyGenRow(i: number) {
    return {
      osmId: `way/g${i}`,
      name: `Kept ${i}`,
      distanceMeters: i,
      distanceRank: i,
      insideCap: i <= CAP,
      hasExactKnowledgeTag: false,
      isDisplacementProtected: false,
    };
  }

  it("emits one copyGen event and one excluded event when both are small", () => {
    const events = buildWalkCandidateFunnelLogEvents({
      ...baseDiagnostic,
      copyGenCandidateList: [copyGenRow(1)],
      excludedBeforeCopyGen: [excludedRow(1)],
    });
    expect(events).toHaveLength(2);
    expect(events[0].copyGenChunkIndex).toBe(0);
    expect(events[0].copyGenChunkCount).toBe(1);
    expect(events[0].excludedChunkCount).toBe(1);
    expect(events[0].requestCenter).toEqual(baseDiagnostic.requestCenter);
    expect(events[1].excludedChunkIndex).toBe(0);
    expect(events[1].excludedChunkCount).toBe(1);
    expect(events[1].copyGenChunkCount).toBe(1);
  });

  it("chunks copyGenCandidateList independently of excludedBeforeCopyGen, each event bounded by the 40-row design", () => {
    const copyGenCandidateList = Array.from({ length: 95 }, (_, i) =>
      copyGenRow(i + 1),
    );
    const excludedBeforeCopyGen = Array.from({ length: 50 }, (_, i) =>
      excludedRow(i),
    );
    const events = buildWalkCandidateFunnelLogEvents(
      { ...baseDiagnostic, copyGenCandidateList, excludedBeforeCopyGen },
      40,
    );
    // 95 copyGen rows at 40/chunk -> 3 chunks (40+40+15); 50 excluded rows -> 2 chunks (40+10)
    expect(events).toHaveLength(5);
    for (const event of events) {
      const rowCount =
        ((event.copyGenCandidateList as unknown[] | undefined)?.length ?? 0) +
        ((event.excludedBeforeCopyGen as unknown[] | undefined)?.length ?? 0);
      expect(rowCount).toBeLessThanOrEqual(40);
    }
  });

  it("fully reconstructs copyGenCandidateList across chunks, in order, with no omission or duplication", () => {
    const copyGenCandidateList = Array.from({ length: 95 }, (_, i) =>
      copyGenRow(i + 1),
    );
    const events = buildWalkCandidateFunnelLogEvents(
      { ...baseDiagnostic, copyGenCandidateList, excludedBeforeCopyGen: [] },
      40,
    );
    const copyGenEvents = events.filter(
      (e) => e.copyGenCandidateList !== undefined,
    );
    expect(copyGenEvents.map((e) => e.copyGenChunkIndex)).toEqual([0, 1, 2]);
    expect(copyGenEvents.every((e) => e.copyGenChunkCount === 3)).toBe(true);
    const reassembled = copyGenEvents.flatMap(
      (e) => e.copyGenCandidateList as unknown[],
    );
    expect(reassembled).toEqual(copyGenCandidateList);
  });

  it("fully reconstructs excludedBeforeCopyGen across chunks, in order, with no omission or duplication", () => {
    const excludedBeforeCopyGen = Array.from({ length: 180 }, (_, i) =>
      excludedRow(i),
    );
    const events = buildWalkCandidateFunnelLogEvents(
      { ...baseDiagnostic, copyGenCandidateList: [], excludedBeforeCopyGen },
      40,
    );
    const excludedEvents = events.filter(
      (e) => e.excludedBeforeCopyGen !== undefined,
    );
    expect(excludedEvents.map((e) => e.excludedChunkIndex)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(excludedEvents.every((e) => e.excludedChunkCount === 5)).toBe(true);
    const reassembled = excludedEvents.flatMap(
      (e) => e.excludedBeforeCopyGen as unknown[],
    );
    expect(reassembled).toEqual(excludedBeforeCopyGen);
  });

  it("repeats shared request context identically on every event regardless of which sequence it belongs to", () => {
    const copyGenCandidateList = Array.from({ length: 50 }, (_, i) =>
      copyGenRow(i + 1),
    );
    const excludedBeforeCopyGen = Array.from({ length: 50 }, (_, i) =>
      excludedRow(i),
    );
    const events = buildWalkCandidateFunnelLogEvents(
      { ...baseDiagnostic, copyGenCandidateList, excludedBeforeCopyGen },
      40,
    );
    for (const event of events) {
      expect(event.timestamp).toBe(baseDiagnostic.timestamp);
      expect(event.requestCenter).toEqual(baseDiagnostic.requestCenter);
      expect(event.requestedRadiusMeters).toBe(
        baseDiagnostic.requestedRadiusMeters,
      );
      expect(event.candidateCap).toBe(baseDiagnostic.candidateCap);
      expect(JSON.stringify(event.counts)).toBe(
        JSON.stringify(baseDiagnostic.counts),
      );
    }
  });
});
