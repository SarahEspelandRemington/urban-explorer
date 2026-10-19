import { describe, it, expect } from "vitest";
import {
  computeWalkReservedSlotShadow,
  exactKnowledgeTags,
  type ReservedSlotShadowCandidate,
} from "../lib/walkReservedSlotShadow";

const CAP = 22;

function cand(
  rank: number,
  overrides: Partial<ReservedSlotShadowCandidate> = {},
): ReservedSlotShadowCandidate {
  return {
    osmId: `way/${rank}`,
    name: `Place ${rank}`,
    tags: { name: `Place ${rank}`, building: "yes", historic: "building" },
    isCuratedBareException: false,
    distanceMeters: rank * 10,
    ...overrides,
  };
}

/** `count` ordinary untagged candidates at ranks 1..count, shuffled so the function must sort. */
function pool(count: number): ReservedSlotShadowCandidate[] {
  const list = Array.from({ length: count }, (_, i) => cand(i + 1));
  return [
    ...list.filter((_, i) => i % 2 === 1),
    ...list.filter((_, i) => i % 2 === 0),
  ];
}

function withTag(
  list: ReservedSlotShadowCandidate[],
  rank: number,
  tags: Record<string, string>,
): ReservedSlotShadowCandidate[] {
  return list.map((c) =>
    c.osmId === `way/${rank}` ? { ...c, tags: { ...c.tags, ...tags } } : c,
  );
}

describe("exactKnowledgeTags", () => {
  it("accepts only the plain wikipedia/wikidata tags in valid form", () => {
    expect(exactKnowledgeTags({ wikipedia: "en:Betsy Ross House" })).toEqual([
      "wikipedia",
    ]);
    expect(exactKnowledgeTags({ wikidata: "Q4898326" })).toEqual(["wikidata"]);
    expect(exactKnowledgeTags({ wikipedia: "en:X", wikidata: "Q1" })).toEqual([
      "wikipedia",
      "wikidata",
    ]);
  });

  it("rejects look-alike, related-object and malformed tags", () => {
    expect(
      exactKnowledgeTags({
        "operator:wikidata": "Q668687",
        "operator:wikipedia": "en:United States Postal Service",
        "name:etymology:wikidata": "Q123",
        "name:etymology": "Jeremiah Elfreth",
        "brand:wikidata": "Q1",
        "subject:wikidata": "Q2",
      }),
    ).toEqual([]);
    expect(exactKnowledgeTags({ wikidata: "q123" })).toEqual([]);
    expect(exactKnowledgeTags({ wikidata: "Q123;Q456" })).toEqual([]);
    expect(exactKnowledgeTags({ wikipedia: "Betsy Ross House" })).toEqual([]);
    expect(exactKnowledgeTags({ wikipedia: "en:" })).toEqual([]);
  });
});

describe("computeWalkReservedSlotShadow", () => {
  it("is a no-op when the candidate count is at or below the cap", () => {
    const list = withTag(pool(22), 22, { wikidata: "Q1" });
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.capApplies).toBe(false);
    expect(r.reservedSlotsUsed).toBe(0);
    expect(r.promoted).toEqual([]);
    expect(r.displaced).toEqual([]);
    expect(r.hypotheticalSelectionIds).toHaveLength(22);
  });

  it("is a no-op when no eligible tagged candidate is below the cutoff", () => {
    const list = withTag(pool(26), 5, { wikipedia: "en:Inside" });
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.capApplies).toBe(true);
    expect(r.reservedSlotsUsed).toBe(0);
    expect(r.eligibleBelowCutoff).toBe(0);
    expect(r.hypotheticalSelectionIds).toEqual(
      Array.from({ length: 22 }, (_, i) => `way/${i + 1}`),
    );
  });

  it("promotes tagged ranks 23+ in distance order, displacing the farthest ordinary candidates", () => {
    let list = pool(30);
    list = withTag(list, 27, { wikidata: "Q27" });
    list = withTag(list, 24, { wikipedia: "en:Twenty Four" });
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.reservedSlotsUsed).toBe(2);
    expect(
      r.promoted.map((p) => [p.osmId, p.distanceRank, p.qualifyingTags]),
    ).toEqual([
      ["way/24", 24, ["wikipedia"]],
      ["way/27", 27, ["wikidata"]],
    ]);
    expect(r.displaced.map((d) => [d.osmId, d.distanceRank])).toEqual([
      ["way/22", 22],
      ["way/21", 21],
    ]);
  });

  it("promotes at most 3 candidates", () => {
    let list = pool(30);
    for (const rank of [23, 24, 25, 26, 28])
      list = withTag(list, rank, { wikidata: `Q${rank}` });
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.eligibleBelowCutoff).toBe(5);
    expect(r.reservedSlotsUsed).toBe(3);
    expect(r.promoted.map((p) => p.distanceRank)).toEqual([23, 24, 25]);
    expect(r.displaced.map((d) => d.distanceRank)).toEqual([22, 21, 20]);
  });

  it("never displaces Streetlit-owned, approvedRescue or curated bare-exception candidates", () => {
    let list = pool(26).map((c) => {
      if (c.osmId === "way/22")
        return { ...c, candidateOrigin: "streetlit" as const };
      if (c.osmId === "way/21")
        return { ...c, candidateOrigin: "approvedRescue" as const };
      if (c.osmId === "way/20") return { ...c, isCuratedBareException: true };
      return c;
    });
    list = withTag(list, 23, { wikidata: "Q23" });
    list = withTag(list, 24, { wikidata: "Q24" });
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.displaced.map((d) => d.osmId)).toEqual(["way/19", "way/18"]);
    for (const protectedId of ["way/22", "way/21", "way/20"]) {
      expect(r.hypotheticalSelectionIds).toContain(protectedId);
    }
  });

  it("stops promoting when nothing displaceable remains", () => {
    let list: ReservedSlotShadowCandidate[] = pool(24).map((c) => ({
      ...c,
      candidateOrigin: "streetlit" as const,
    }));
    list = list.map((c) =>
      c.osmId === "way/3" ? { ...c, candidateOrigin: undefined } : c,
    );
    list = withTag(list, 23, { wikidata: "Q23" });
    list = withTag(list, 24, { wikidata: "Q24" });
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.reservedSlotsUsed).toBe(1);
    expect(r.displaced.map((d) => d.osmId)).toEqual(["way/3"]);
  });

  it("does not let look-alike tags qualify a below-cutoff candidate", () => {
    let list = pool(26);
    list = withTag(list, 23, { "operator:wikidata": "Q668687" });
    list = withTag(list, 24, {
      "name:etymology": "Someone",
      "name:etymology:wikidata": "Q9",
    });
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.reservedSlotsUsed).toBe(0);
    expect(r.eligibleBelowCutoff).toBe(0);
  });

  it("leaves in-22 tagged candidates in place, without consuming N or being displaced", () => {
    let list = pool(30);
    for (const rank of [20, 21, 22])
      list = withTag(list, rank, { wikidata: `Q${rank}` });
    for (const rank of [23, 24, 25])
      list = withTag(list, rank, { wikidata: `Q${rank}` });
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.reservedSlotsUsed).toBe(3);
    expect(r.promoted.map((p) => p.distanceRank)).toEqual([23, 24, 25]);
    expect(r.displaced.map((d) => d.distanceRank)).toEqual([19, 18, 17]);
    for (const id of ["way/20", "way/21", "way/22"]) {
      expect(r.hypotheticalSelectionIds).toContain(id);
    }
  });

  it("keeps the hypothetical set at exactly the cap and does not mutate its input", () => {
    let list = pool(40);
    for (const rank of [30, 35, 39])
      list = withTag(list, rank, { wikipedia: `en:P${rank}` });
    const before = JSON.stringify(list);
    const r = computeWalkReservedSlotShadow(list, CAP);
    expect(r.hypotheticalSelectionIds).toHaveLength(22);
    expect(new Set(r.hypotheticalSelectionIds).size).toBe(22);
    expect(JSON.stringify(list)).toBe(before);
  });
});
