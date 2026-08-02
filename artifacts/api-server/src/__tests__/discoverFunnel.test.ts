import { describe, it, expect } from "vitest";
import {
  computeTierDistribution,
  findLastEliminatingStage,
} from "../lib/discoverFunnel";

describe("computeTierDistribution", () => {
  it("counts places into tier1-4 and unclassified buckets", () => {
    const dist = computeTierDistribution([
      { discoveryTier: 1 },
      { discoveryTier: 2 },
      { discoveryTier: 2 },
      { discoveryTier: 3 },
      { discoveryTier: 4 },
      { discoveryTier: 4 },
      { discoveryTier: 4 },
      {},
    ]);
    expect(dist).toEqual({
      tier1: 1,
      tier2: 2,
      tier3: 1,
      tier4: 3,
      unclassified: 1,
    });
  });

  it("returns all zeros for an empty array", () => {
    expect(computeTierDistribution([])).toEqual({
      tier1: 0,
      tier2: 0,
      tier3: 0,
      tier4: 0,
      unclassified: 0,
    });
  });

  it("treats an out-of-range tier value as unclassified", () => {
    const dist = computeTierDistribution([{ discoveryTier: 99 } as any]);
    expect(dist.unclassified).toBe(1);
  });
});

describe("findLastEliminatingStage", () => {
  it("returns undefined when the final count is nonzero", () => {
    const stages = [
      { name: "raw", count: 10 },
      { name: "denylist", count: 8 },
      { name: "final", count: 3 },
    ];
    expect(findLastEliminatingStage(stages)).toBeUndefined();
  });

  it("identifies the single stage that reduced a nonzero count to zero", () => {
    const stages = [
      { name: "raw", count: 10 },
      { name: "denylist", count: 8 },
      { name: "commercialUseFilter", count: 0 },
      { name: "radiusFilter", count: 0 },
    ];
    expect(findLastEliminatingStage(stages)).toBe("commercialUseFilter");
  });

  it("returns undefined when the pool was already zero at the first stage", () => {
    const stages = [
      { name: "raw", count: 0 },
      { name: "denylist", count: 0 },
    ];
    expect(findLastEliminatingStage(stages)).toBeUndefined();
  });

  it("does not blame a later stage once the count is already zero", () => {
    const stages = [
      { name: "raw", count: 5 },
      { name: "denylist", count: 0 },
      { name: "residentialFilter", count: 0 },
    ];
    expect(findLastEliminatingStage(stages)).toBe("denylist");
  });
});
