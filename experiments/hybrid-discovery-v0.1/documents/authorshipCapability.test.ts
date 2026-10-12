/**
 * Tests the authorship-role capability mapping's structure, and the
 * implementation-step-3A pre-registered pilot prior (see
 * AUTHORSHIP_TRUST_PRIOR_FREEZE.md): "unknown" is no longer globally
 * lowest — narrative claim types get the same "medium" posture as
 * applicant/consultant-preparer narrative prose, while structured-
 * designation/core-fact claim types remain fail-closed "low" for unknown
 * authorship. Deliberately does NOT lock in commission-staff's specific
 * values, which remain provisional pending Sarah's separate review.
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_CLAIM_TYPES,
  capabilitiesForAuthorshipRole,
} from "./authorshipCapability";

/** Claim types NOT covered by the medium narrative posture — structured
 * designation ("register-status") and core-fact types ("construction-date",
 * "architect", "identity") — which must remain fail-closed for unknown
 * authorship. */
const NON_NARRATIVE_CLAIM_TYPES = [
  "register-status",
  "construction-date",
  "architect",
  "identity",
] as const;
const NARRATIVE_CLAIM_TYPES = ALL_CLAIM_TYPES.filter(
  (t) => !NON_NARRATIVE_CLAIM_TYPES.includes(t as never),
);

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

  it("unknown authorship is no longer globally lowest: narrative claim types get the same medium posture as applicant/consultant-preparer narrative prose", () => {
    const result = capabilitiesForAuthorshipRole("unknown", [
      ...NARRATIVE_CLAIM_TYPES,
    ]);
    expect(result.every((c) => c.strength === "medium")).toBe(true);
  });

  it("unknown authorship remains fail-closed low for claim types deliberately not covered by the medium narrative posture", () => {
    const result = capabilitiesForAuthorshipRole("unknown", [
      ...NON_NARRATIVE_CLAIM_TYPES,
    ]);
    expect(result.every((c) => c.strength === "low")).toBe(true);
  });

  it("applicant narrative claims receive the same medium capability as the pre-registered pilot prior", () => {
    const result = capabilitiesForAuthorshipRole("applicant", [
      ...NARRATIVE_CLAIM_TYPES,
    ]);
    expect(result.every((c) => c.strength === "medium")).toBe(true);
  });

  it("accepts a narrowed claim-type list rather than always requiring the full set", () => {
    const result = capabilitiesForAuthorshipRole("applicant", [
      "construction-date",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].claimType).toBe("construction-date");
  });
});
