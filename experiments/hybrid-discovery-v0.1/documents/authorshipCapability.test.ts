/**
 * Tests the authorship-role capability mapping's structure and its
 * "unknown" fail-closed behavior only. Deliberately does NOT assert
 * specific staff/applicant/consultant-preparer strength values — those are
 * provisional placeholders pending Sarah's review before pilot execution.
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_CLAIM_TYPES,
  capabilitiesForAuthorshipRole,
} from "./authorshipCapability";

describe("capabilitiesForAuthorshipRole", () => {
  it("returns exactly one capability entry per claim type", () => {
    const result = capabilitiesForAuthorshipRole("commission-staff");
    expect(result).toHaveLength(ALL_CLAIM_TYPES.length);
    expect(result.map((c) => c.claimType).sort()).toEqual(
      [...ALL_CLAIM_TYPES].sort(),
    );
  });

  it("is deterministic for a given role (same input -> same output), without asserting what the values are", () => {
    const first = capabilitiesForAuthorshipRole("consultant-preparer");
    const second = capabilitiesForAuthorshipRole("consultant-preparer");
    expect(first).toEqual(second);
  });

  it("unknown authorship fails closed: every claim type gets the lowest permitted strength", () => {
    const result = capabilitiesForAuthorshipRole("unknown");
    expect(result.every((c) => c.strength === "low")).toBe(true);
    expect(
      result.some((c) => c.strength === "high" || c.strength === "medium"),
    ).toBe(false);
  });

  it("accepts a narrowed claim-type list rather than always requiring the full set", () => {
    const result = capabilitiesForAuthorshipRole("applicant", [
      "construction-date",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].claimType).toBe("construction-date");
  });
});
