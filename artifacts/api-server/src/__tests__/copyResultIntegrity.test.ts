import { describe, it, expect } from "vitest";
import { validateCopyResultIds } from "../lib/copyResultIntegrity";

describe("validateCopyResultIds", () => {
  it("accepts an exact one-to-one ID set", () => {
    const result = validateCopyResultIds(["A", "B", "C"], ["A", "B", "C"]);
    expect(result.valid).toBe(true);
    expect(result.expectedCount).toBe(3);
    expect(result.returnedCount).toBe(3);
    expect(result.missingCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
    expect(result.unexpectedCount).toBe(0);
  });

  it("rejects a batch missing one ID", () => {
    const result = validateCopyResultIds(["A", "B", "C"], ["A", "B"]);
    expect(result.valid).toBe(false);
    expect(result.missingCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
    expect(result.unexpectedCount).toBe(0);
  });

  it("rejects a batch with a duplicate ID at equal total count", () => {
    // A returned twice, B returned once, C missing entirely — same total
    // count as expected, but not a valid bijection.
    const result = validateCopyResultIds(["A", "B", "C"], ["A", "A", "B"]);
    expect(result.valid).toBe(false);
    expect(result.expectedCount).toBe(3);
    expect(result.returnedCount).toBe(3);
    expect(result.duplicateCount).toBe(1);
    expect(result.missingCount).toBe(1);
  });

  it("rejects a batch with an unexpected ID", () => {
    const result = validateCopyResultIds(["A", "B", "C"], ["A", "B", "X"]);
    expect(result.valid).toBe(false);
    expect(result.unexpectedCount).toBe(1);
    expect(result.missingCount).toBe(1);
  });

  it("rejects a batch with correct count but wrong ID set", () => {
    const result = validateCopyResultIds(["A", "B", "C"], ["A", "X", "Y"]);
    expect(result.valid).toBe(false);
    expect(result.missingCount).toBe(2);
    expect(result.unexpectedCount).toBe(2);
  });

  it("accepts a shuffled result order", () => {
    const result = validateCopyResultIds(["A", "B", "C"], ["C", "A", "B"]);
    expect(result.valid).toBe(true);
  });

  it("rejects the Paché/Kane-shaped case: one candidate's ID omitted, batch shorter by one", () => {
    // Paché is returned once (its prose was contaminated with Kane's story,
    // but the validator only inspects IDs). Kane's ID never appears at all.
    // The returned array is exactly one shorter than the candidate array —
    // matching the real 25-vs-24 production shape, not a duplicate.
    const candidateIds = ["pache", "kane", "other1", "other2"];
    const resultIds = ["pache", "other1", "other2"];
    const result = validateCopyResultIds(candidateIds, resultIds);
    expect(result.valid).toBe(false);
    expect(result.expectedCount).toBe(4);
    expect(result.returnedCount).toBe(3);
    expect(result.missingCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
    expect(result.unexpectedCount).toBe(0);
  });
});
