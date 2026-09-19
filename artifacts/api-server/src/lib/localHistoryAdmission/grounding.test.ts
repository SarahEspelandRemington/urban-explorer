import { describe, expect, it } from "vitest";
import { groundClaim } from "./grounding";
import type { Claim } from "./types";

function makeClaim(
  overrides: Partial<Claim> & {
    proposedIdentityType: Claim["proposedIdentityType"];
  },
): Claim {
  return {
    id: "c1",
    placeKey: "p1",
    sourceIds: [],
    supportingSpan: "quoted span",
    claimType: "use-history",
    claimText: "A generic claim.",
    ...overrides,
  };
}

describe("groundClaim", () => {
  it("current-osm-entity with address -> tier 5, high confidence", () => {
    const result = groundClaim(
      makeClaim({
        proposedIdentityType: "current-osm-entity",
        address: "123 Main St",
      }),
    );
    expect(result.tier).toBe(5);
    expect(result.confidence).toBe("high");
  });

  it("current-osm-entity without address -> tier 4, high confidence", () => {
    const result = groundClaim(
      makeClaim({ proposedIdentityType: "current-osm-entity" }),
    );
    expect(result.tier).toBe(4);
    expect(result.confidence).toBe("high");
  });

  it("unnamed-current-building with address -> tier 3, medium confidence", () => {
    const result = groundClaim(
      makeClaim({
        proposedIdentityType: "unnamed-current-building",
        address: "123 Main St",
      }),
    );
    expect(result.tier).toBe(3);
    expect(result.confidence).toBe("medium");
  });

  it("unnamed-current-building without address -> tier 3, low confidence", () => {
    const result = groundClaim(
      makeClaim({ proposedIdentityType: "unnamed-current-building" }),
    );
    expect(result.tier).toBe(3);
    expect(result.confidence).toBe("low");
  });

  it("current-building-former-use with address -> tier 2, medium confidence", () => {
    const result = groundClaim(
      makeClaim({
        proposedIdentityType: "current-building-former-use",
        address: "123 Main St",
      }),
    );
    expect(result.tier).toBe(2);
    expect(result.confidence).toBe("medium");
  });

  it("current-building-former-use without address -> tier 2, low confidence", () => {
    const result = groundClaim(
      makeClaim({ proposedIdentityType: "current-building-former-use" }),
    );
    expect(result.tier).toBe(2);
    expect(result.confidence).toBe("low");
  });

  it("former-site with address -> tier 1, medium confidence", () => {
    const result = groundClaim(
      makeClaim({
        proposedIdentityType: "former-site",
        address: "123 Main St",
      }),
    );
    expect(result.tier).toBe(1);
    expect(result.confidence).toBe("medium");
  });

  it("former-site without address -> tier 1, low confidence", () => {
    const result = groundClaim(
      makeClaim({ proposedIdentityType: "former-site" }),
    );
    expect(result.tier).toBe(1);
    expect(result.confidence).toBe("low");
  });

  it("unresolved -> tier 0, none confidence", () => {
    const result = groundClaim(
      makeClaim({ proposedIdentityType: "unresolved" }),
    );
    expect(result.tier).toBe(0);
    expect(result.confidence).toBe("none");
  });

  it("treats a whitespace-only address as no address", () => {
    const result = groundClaim(
      makeClaim({ proposedIdentityType: "current-osm-entity", address: "   " }),
    );
    expect(result.tier).toBe(4);
    expect(result.confidence).toBe("high");
  });
});
