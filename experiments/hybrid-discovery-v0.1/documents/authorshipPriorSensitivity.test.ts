/**
 * Tests the authorship-prior sensitivity-counter diagnostic
 * (implementation step 3A). Uses minimal synthetic Claim/Source fixtures —
 * calls the real production `decideClaim` (via assessAuthorshipPriorSensitivity`),
 * never a parallel admission system.
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts.
 */
import { describe, expect, it } from "vitest";
import { assessAuthorshipPriorSensitivity } from "./authorshipPriorSensitivity";
import type {
  Claim,
  GroundingResult,
  Source,
} from "../../../artifacts/api-server/src/lib/localHistoryAdmission/types";
import { decideClaim } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/decide";

function baseClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "claim-1",
    placeKey: "place-1",
    address: "123 Test Street",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["src-1"],
    supportingSpan: "Test span.",
    claimType: "institutional-founding",
    claimText: "Test claim text.",
    ...overrides,
  };
}

function baseSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "src-1",
    title: "Test Source",
    sourceClass: "government-preservation-record",
    capabilities: [{ claimType: "institutional-founding", strength: "medium" }],
    ...overrides,
  };
}

const passingGrounding: GroundingResult = {
  tier: 5,
  confidence: "high",
  reason: "test grounding",
};

describe("assessAuthorshipPriorSensitivity", () => {
  it("identifies a trust-only HOLD->AUTO-ADMIT change: medium capability AUTO-ADMITs, counterfactual low capability HOLDs", () => {
    const claim = baseClaim();
    const source = baseSource();
    const sources = { [source.id]: source };
    const checks = [
      { checkId: "test-check", outcome: "pass" as const, reason: "ok" },
    ];

    const actual = decideClaim(claim, checks, passingGrounding, sources);
    expect(actual.decision).toBe("AUTO-ADMIT");

    const result = assessAuthorshipPriorSensitivity(
      claim,
      checks,
      passingGrounding,
      sources,
      actual,
      source.id,
    );

    expect(result.actualDecision).toBe("AUTO-ADMIT");
    expect(result.counterfactualLowCapabilityDecision).toBe("HOLD");
    expect(result.counterfactualLowCapabilityFactualTrust).toBe("low");
    expect(result.wouldFlipHoldToAutoAdmitFromTrustAlone).toBe(true);
  });

  it("does not report a flip when a non-trust check already blocks the claim (trust was never the deciding factor)", () => {
    const claim = baseClaim();
    const source = baseSource();
    const sources = { [source.id]: source };
    const checks = [
      {
        checkId: "test-check",
        outcome: "block-auto-admit" as const,
        reason: "blocked",
      },
    ];

    const actual = decideClaim(claim, checks, passingGrounding, sources);
    expect(actual.decision).toBe("HOLD");

    const result = assessAuthorshipPriorSensitivity(
      claim,
      checks,
      passingGrounding,
      sources,
      actual,
      source.id,
    );

    expect(result.allNonTrustChecksPassed).toBe(false);
    expect(result.wouldFlipHoldToAutoAdmitFromTrustAlone).toBe(false);
  });

  it("does not report a flip when the claim already HOLDs at the actual (non-counterfactual) capability", () => {
    const claim = baseClaim({ claimType: "construction-date" });
    const source = baseSource({
      capabilities: [{ claimType: "construction-date", strength: "low" }],
    });
    const sources = { [source.id]: source };
    const checks = [
      { checkId: "test-check", outcome: "pass" as const, reason: "ok" },
    ];

    const actual = decideClaim(claim, checks, passingGrounding, sources);
    expect(actual.decision).toBe("HOLD");

    const result = assessAuthorshipPriorSensitivity(
      claim,
      checks,
      passingGrounding,
      sources,
      actual,
      source.id,
    );

    expect(result.wouldFlipHoldToAutoAdmitFromTrustAlone).toBe(false);
  });
});
