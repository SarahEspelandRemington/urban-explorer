/**
 * Regression tests for the Hybrid Discovery v1 claim-id-uniqueness bug fix
 * (see narrativeExtractor.ts's placeKeyIdToken). Offline/non-production,
 * experimental — see ../README.md.
 *
 * NOTE ON TEST-RUNNER SCOPE: this file lives under experiments/
 * hybrid-discovery-v0.1/ and is not currently scanned by the committed CI
 * test path (artifacts/api-server/src only) — same disclosed limitation as
 * pab/pabGrounding.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  extractBaldwinParkClaims,
  type BaldwinParkExtractionInput,
} from "./baldwinParkExtractor";
import type { BaldwinParkPage } from "./baldwinParkAdapter";

const PAGE: BaldwinParkPage = {
  url: "https://example.invalid/test-page",
  slug: "test-page",
  title: "Test Page",
  plainText: "1901 Spring Garden Street was built in 1875.",
};

function baseInput(placeKey: string): BaldwinParkExtractionInput {
  return {
    page: PAGE,
    placeKey,
    address: "1901 Spring Garden St",
    title: "Test Building",
    proposedIdentityType: "current-osm-entity",
  };
}

describe("extractBaldwinParkClaims — claim id uniqueness across distinct placeKeys", () => {
  it("produces distinct claim ids for the same source page matched to two distinct placeKeys", () => {
    const claimsA = extractBaldwinParkClaims(baseInput("pab-record-75513"));
    const claimsB = extractBaldwinParkClaims(baseInput("pab-record-1179406"));
    expect(claimsA).toHaveLength(1);
    expect(claimsB).toHaveLength(1);
    expect(claimsA[0].id).not.toBe(claimsB[0].id);
  });

  it("preserves stable source provenance and supporting-span identity across the two placeKeys", () => {
    const claimsA = extractBaldwinParkClaims(baseInput("pab-record-75513"));
    const claimsB = extractBaldwinParkClaims(baseInput("pab-record-1179406"));
    expect(claimsA[0].sourceIds).toEqual(claimsB[0].sourceIds);
    expect(claimsA[0].supportingSpan).toBe(claimsB[0].supportingSpan);
    expect(claimsA[0].claimText).toBe(claimsB[0].claimText);
    expect(claimsA[0].claimType).toBe(claimsB[0].claimType);
    expect(claimsA[0].dateRange).toEqual(claimsB[0].dateRange);
  });

  it("each claim's id embeds its own target placeKey", () => {
    const claimsA = extractBaldwinParkClaims(baseInput("pab-record-75513"));
    const claimsB = extractBaldwinParkClaims(baseInput("pab-record-1179406"));
    expect(claimsA[0].id).toContain("pab-record-75513");
    expect(claimsB[0].id).toContain("pab-record-1179406");
  });

  it("ordinary single-place extraction is unaffected: claim shape/content unchanged by the fix", () => {
    const claims = extractBaldwinParkClaims(baseInput("pab-record-1900"));
    expect(claims).toHaveLength(1);
    const claim = claims[0];
    expect(claim.placeKey).toBe("pab-record-1900");
    expect(claim.claimType).toBe("construction-date");
    expect(claim.dateRange).toEqual({ start: "1875-01-01", precise: true });
    expect(claim.sourceIds).toEqual(["bp-test-page"]);
    expect(claim.id).toBe(
      "bp-test-page-pab-record-1900-p0s0-construction-date",
    );
  });
});
