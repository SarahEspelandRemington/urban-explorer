import { describe, expect, it } from "vitest";
import {
  applyDiscoveryWorthinessGate,
  evaluateDiscoveryWorthiness,
} from "./worthiness";
import { generateArtifact } from "./artifact";
import { projectRuntimeCompat } from "./projector";
import type { Claim, ClaimType, Source } from "./types";

function makeSource(overrides: Partial<Source> & { id: string }): Source {
  return {
    title: overrides.id,
    sourceClass: "local-public-history-narrative",
    capabilities: [],
    ...overrides,
  };
}
function makeClaim(
  overrides: Partial<Claim> & {
    id: string;
    placeKey: string;
    sourceIds: string[];
  },
): Claim {
  return {
    proposedIdentityType: "current-osm-entity",
    address: "123 Main St",
    supportingSpan: "quoted span",
    claimType: "use-history",
    claimText:
      "A generic, sufficiently long claim text for editorial specificity checks.",
    productionSubjectId: `prod-${overrides.placeKey}`,
    ...overrides,
  };
}

describe("evaluateDiscoveryWorthiness", () => {
  it("rejects a bare identity + register-status stub", () => {
    const result = evaluateDiscoveryWorthiness(["identity", "register-status"]);
    expect(result.projectableForDiscovery).toBe(false);
    expect(result.worthinessReasons.join(" ")).toContain("identity");
  });

  it("rejects identity + register-status + a single supporting fact (e.g. a bare client name)", () => {
    const result = evaluateDiscoveryWorthiness([
      "identity",
      "register-status",
      "relationship",
    ]);
    expect(result.projectableForDiscovery).toBe(false);
    expect(result.worthinessReasons.join(" ")).toContain("relationship");
  });

  it("passes when 2+ supporting claim types combine into a capsule design/ownership history, even with no dedicated story claim type", () => {
    const result = evaluateDiscoveryWorthiness([
      "identity",
      "construction-date",
      "architect",
    ]);
    expect(result.projectableForDiscovery).toBe(true);
    expect(result.worthinessReasons.join(" ")).toContain("construction-date");
    expect(result.worthinessReasons.join(" ")).toContain("architect");
  });

  it("passes when any single story-bearing claim type is present, regardless of what else is present", () => {
    const result = evaluateDiscoveryWorthiness([
      "identity",
      "register-status",
      "event",
    ]);
    expect(result.projectableForDiscovery).toBe(true);
    expect(result.worthinessReasons.join(" ")).toContain("event");
  });

  it("passes a rich, multi-type composition (Fifth Baptist Church-style)", () => {
    const claimTypes: ClaimType[] = [
      "identity",
      "construction-date",
      "architect",
      "register-status",
      "event",
      "relationship",
      "demolition",
    ];
    const result = evaluateDiscoveryWorthiness(claimTypes);
    expect(result.projectableForDiscovery).toBe(true);
  });

  it("is a pure function of claimTypes — order and duplicates do not affect the outcome", () => {
    const a = evaluateDiscoveryWorthiness(["architect", "construction-date"]);
    const b = evaluateDiscoveryWorthiness([
      "construction-date",
      "architect",
      "construction-date",
      "architect",
    ]);
    expect(a.projectableForDiscovery).toBe(true);
    expect(b.projectableForDiscovery).toBe(true);
  });
});

describe("applyDiscoveryWorthinessGate", () => {
  it("rejects a register-status-only subject and keeps a use-history subject from the same projection", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "register-status", strength: "high" }],
      }),
      s2: makeSource({
        id: "s2",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claims: Claim[] = [
      makeClaim({
        id: "stub1",
        placeKey: "p1",
        sourceIds: ["s1"],
        claimType: "register-status",
      }),
      makeClaim({
        id: "story1",
        placeKey: "p2",
        sourceIds: ["s2"],
        claimType: "use-history",
      }),
    ];
    const artifact = generateArtifact(claims, sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    const gated = applyDiscoveryWorthinessGate(projection, artifact);

    expect(Object.keys(gated.entries)).toEqual(["prod-p2"]);
    expect(gated.rejectedForWorthiness).toEqual(["prod-p1"]);
    expect(gated.worthinessBySubject["prod-p1"].projectableForDiscovery).toBe(
      false,
    );
    expect(gated.worthinessBySubject["prod-p2"].projectableForDiscovery).toBe(
      true,
    );
  });

  it("carries nonProjectableClaimIds through unchanged from the input projection", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({
      id: "unresolved1",
      placeKey: "pab-record-12",
      productionSubjectId: undefined,
      sourceIds: ["s1"],
    });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    const gated = applyDiscoveryWorthinessGate(projection, artifact);
    expect(gated.nonProjectableClaimIds).toEqual(["unresolved1"]);
  });

  it("does not mutate the passed-through entry for a subject that clears the gate", () => {
    const sources: Record<string, Source> = {
      s1: makeSource({
        id: "s1",
        capabilities: [{ claimType: "use-history", strength: "high" }],
      }),
    };
    const claim = makeClaim({ id: "c1", placeKey: "p1", sourceIds: ["s1"] });
    const artifact = generateArtifact([claim], sources, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const projection = projectRuntimeCompat(artifact);
    const gated = applyDiscoveryWorthinessGate(projection, artifact);
    expect(gated.entries["prod-p1"]).toEqual(projection.entries["prod-p1"]);
  });
});
