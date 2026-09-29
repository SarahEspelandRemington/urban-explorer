/**
 * Regression tests for the LPC Date_Combo construction-date claim fix (NYC
 * Phase 3, 2026-09-20). Offline/non-production, experimental — see
 * ../README.md.
 *
 * NOTE ON TEST-RUNNER SCOPE: this file lives under experiments/
 * hybrid-discovery-v0.1/ and is not currently scanned by the committed CI
 * test path (artifacts/api-server/src only) — same disclosed limitation as
 * pab/pabGrounding.test.ts / combinePabAndBaldwinPark.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  buildLpcSource,
  extractClaimsFromLpcRecord,
  interpretLpcRecord,
  type LpcAdapterFieldMapLike,
} from "./lpcClaimExtractor";
import type { LpcRetrievalRecord } from "./lpcAdapter";
import type { Claim, Source } from "../types";
import { generateArtifact } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/artifact";

const FIELDS: LpcAdapterFieldMapLike = {
  archBuild: "arch_build",
  ownDevel: "own_devel",
  altDate1: "alt_date_1",
  altArch1: "alt_arch_1",
  altDate2: "alt_date_2",
  altArch2: "alt_arch_2",
  useOrig: "use_orig",
  useOther: "use_other",
  buildType: "build_type",
  lmOrig: "lm_orig",
  lmNew: "lm_new",
  histDist: "hist_dist",
  dateCombo: "date_combo",
  circa: "circa",
  notes: "notes",
};

function makeRecord(raw: Record<string, unknown>): LpcRetrievalRecord {
  return {
    lpcRowId: "row-test",
    url: "https://example.invalid/lpc-row-test",
    address: "135 West 36th Street",
    borough: "Manhattan",
    bin: "1234567",
    bbl: undefined,
    buildName: undefined,
    lmOrig: undefined,
    lmNew: "Fashion Tower",
    histDist: undefined,
    raw,
  };
}

describe("LPC Date_Combo -> structured construction-date claim", () => {
  it("emits a separate construction-date claim with a parsed dateRange alongside the architect claim", () => {
    const record = makeRecord({
      arch_build: "Emery Roth",
      date_combo: "1924 - 1926",
      lm_new: "Fashion Tower",
    });
    const interpreted = interpretLpcRecord(record, FIELDS);
    expect(interpreted.classification).toBe("claim-bearing");

    const claims = extractClaimsFromLpcRecord(record, interpreted);
    const constructionClaim = claims.find(
      (c) => c.claimType === "construction-date",
    );
    const architectClaim = claims.find((c) => c.claimType === "architect");

    expect(constructionClaim).toBeDefined();
    expect(constructionClaim!.dateRange).toEqual({
      start: "1924-01-01",
      end: "1926-01-01",
      precise: true,
    });
    expect(constructionClaim!.id).toBe("lpc-row-test-construction-date");

    // Architect claim carries only the architect/builder attribution — the
    // Date_Combo fact lives exclusively in the construction-date claim now.
    expect(architectClaim).toBeDefined();
    expect(architectClaim!.dateRange).toBeUndefined();
    expect(architectClaim!.claimText).not.toContain("1924");
    expect(architectClaim!.claimText).not.toContain("dated");
  });

  it("parses a single-year Date_Combo value (no range) with start only", () => {
    const record = makeRecord({
      arch_build: "Someone",
      date_combo: "1930",
    });
    const interpreted = interpretLpcRecord(record, FIELDS);
    const claims = extractClaimsFromLpcRecord(record, interpreted);
    const constructionClaim = claims.find(
      (c) => c.claimType === "construction-date",
    );
    expect(constructionClaim!.dateRange).toEqual({
      start: "1930-01-01",
      end: undefined,
      precise: true,
    });
  });

  it('emits no construction-date claim when Date_Combo is absent, "Not determined", or the undocumented "0" sentinel', () => {
    for (const dateCombo of [undefined, "Not determined", "0"]) {
      const record = makeRecord({
        arch_build: "Someone",
        ...(dateCombo !== undefined ? { date_combo: dateCombo } : {}),
      });
      const interpreted = interpretLpcRecord(record, FIELDS);
      const claims = extractClaimsFromLpcRecord(record, interpreted);
      expect(claims.some((c) => c.claimType === "construction-date")).toBe(
        false,
      );
    }
  });

  it("declares a high-strength construction-date source capability only when Date_Combo is present", () => {
    const withDate = makeRecord({ arch_build: "X", date_combo: "1924 - 1926" });
    const withoutDate = makeRecord({ arch_build: "X" });
    const interpretedWith = interpretLpcRecord(withDate, FIELDS);
    const interpretedWithout = interpretLpcRecord(withoutDate, FIELDS);

    const sourceWith = buildLpcSource(withDate, interpretedWith);
    const sourceWithout = buildLpcSource(withoutDate, interpretedWithout);

    expect(
      sourceWith.capabilities.some(
        (c) => c.claimType === "construction-date" && c.strength === "high",
      ),
    ).toBe(true);
    expect(
      sourceWithout.capabilities.some(
        (c) => c.claimType === "construction-date",
      ),
    ).toBe(false);
  });

  it("does not let a HOLDed construction-date fact leak into the AUTO-ADMIT architect claim's text", () => {
    const record = makeRecord({
      arch_build: "Emery Roth",
      date_combo: "1924 - 1926",
      lm_new: "Fashion Tower",
    });
    const interpreted = interpretLpcRecord(record, FIELDS);
    const lpcClaims = extractClaimsFromLpcRecord(record, interpreted).map(
      (c) => ({ ...c, proposedIdentityType: "current-osm-entity" as const }),
    );
    const lpcSource = buildLpcSource(record, interpreted);

    // A second, conflicting construction-date claim for the same place (as a
    // different source would contribute) forces temporal-consistency to HOLD
    // both construction-date claims via checks.ts — unchanged, not modified
    // here.
    const conflictingClaim: Claim = {
      id: "other-source-construction-date",
      placeKey: lpcClaims[0].placeKey,
      address: record.address,
      proposedIdentityType: "current-osm-entity",
      sourceIds: ["other-source"],
      supportingSpan: "span",
      claimType: "construction-date",
      claimText: "Another source states a construction date of 1922.",
      dateRange: { start: "1922-01-01", precise: true },
      extractionMethod: "direct-source-text",
    };
    const otherSource: Source = {
      id: "other-source",
      title: "Other test source",
      sourceClass: "local-public-history-narrative",
      capabilities: [{ claimType: "construction-date", strength: "medium" }],
    };

    const artifact = generateArtifact([...lpcClaims, conflictingClaim], {
      [lpcSource.id]: lpcSource,
      "other-source": otherSource,
    });

    const constructionOutcome = artifact.claims.find(
      (r) => r.claimId === "lpc-row-test-construction-date",
    )!;
    const architectOutcome = artifact.claims.find(
      (r) => r.claimId === "lpc-row-test-architect",
    )!;

    // The construction-date claim is correctly HELD by the unmodified
    // temporal-consistency check...
    expect(constructionOutcome.decision.decision).toBe("HOLD");
    // ...but the architect claim (a separate, AUTO-ADMIT claim) never carried
    // the date in its own text, so nothing leaks through it regardless of the
    // construction-date claim's decision.
    expect(architectOutcome.decision.decision).toBe("AUTO-ADMIT");
    expect(architectOutcome.claim.claimText).not.toContain("1924");
    expect(architectOutcome.claim.claimText).not.toContain("1926");
    expect(architectOutcome.claim.claimText).not.toContain("dated");
  });
});
