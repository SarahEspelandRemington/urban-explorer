/**
 * MANDATORY regression test (implementation step 2, item 5): proves, against
 * the REAL, unmodified production `checks.ts` (`runChecks`,
 * `claimProvenanceProfile`, `resolveRootProvenance`) — not an experiments-tree
 * reimplementation — that two authorship-role-split synthetic Sources
 * produced by `buildSyntheticSourcesForPacket` for the SAME physical document
 * do NOT count as independent corroboration of the same underlying fact.
 *
 * Stop rule (per task instruction): if this test instead found that
 * production machinery DID treat the two role-split Sources as independent
 * corroboration, this file would report that finding and STOP — it would not
 * modify production corroboration logic, and would not work around the
 * result in experiments code. That did not happen: the real behavior proven
 * below is "no independent corroboration" / "block-auto-admit", so no such
 * stop was required.
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts. This file imports
 * real production modules by relative path, same precedent as
 * experiments/hybrid-discovery-v0.1/combinePabAndBaldwinPark.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  runChecks,
  claimProvenanceProfile,
} from "../../../artifacts/api-server/src/lib/localHistoryAdmission/checks";
import type {
  Claim,
  CheckContext,
} from "../../../artifacts/api-server/src/lib/localHistoryAdmission/types";
import { buildSyntheticSourcesForPacket } from "./documentSourceSplit";
import type { DocumentEvidencePacket } from "./documentEvidencePacket";
import { FROZEN_BORN_DIGITAL_PDF_ACQUISITION } from "./acquisitionMetadata";

function makePacket(): DocumentEvidencePacket {
  return {
    schemaVersion: 1,
    packetId: "pkt-1",
    documentTitle: "Synthetic Nomination",
    jurisdiction: "Test Jurisdiction",
    cardinality: "single-resource",
    resources: [{ resourceId: "res-a", resourceLabel: "Resource A" }],
    rootProvenanceId: "pkt-1-root",
    blocks: [
      {
        blockId: "b-staff",
        scope: "resource-entry",
        resourceRef: "res-a",
        authorshipRole: "commission-staff",
        text: "staff text",
        acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
      },
      {
        blockId: "b-preparer",
        scope: "resource-entry",
        resourceRef: "res-a",
        authorshipRole: "consultant-preparer",
        text: "preparer text",
        acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
      },
    ],
  };
}

describe("authorship-role-split synthetic Sources and real production corroboration", () => {
  const { rootSource, roleSources } =
    buildSyntheticSourcesForPacket(makePacket());
  const staffSource = roleSources["commission-staff"]!;
  const preparerSource = roleSources["consultant-preparer"]!;
  const sources = {
    [rootSource.id]: rootSource,
    [staffSource.id]: staffSource,
    [preparerSource.id]: preparerSource,
  };

  const SHARED_FACT_KEY = "oldest-continuously-operating-brewery-on-the-block";

  const claimViaStaff: Claim = {
    id: "claim-staff",
    placeKey: "res-a",
    address: "2301 Fairmount Avenue",
    proposedIdentityType: "current-osm-entity",
    sourceIds: [staffSource.id],
    supportingSpan:
      "This is the oldest continuously operating brewery site on the block.",
    claimType: "superlative",
    claimText:
      "The nomination's staff-authored section states this is the oldest continuously operating brewery site on the block.",
    corroborationKey: SHARED_FACT_KEY,
  };

  const claimViaPreparer: Claim = {
    id: "claim-preparer",
    placeKey: "res-a",
    address: "2301 Fairmount Avenue",
    proposedIdentityType: "current-osm-entity",
    sourceIds: [preparerSource.id],
    supportingSpan:
      "This is the oldest continuously operating brewery site on the block.",
    claimType: "superlative",
    claimText:
      "The nomination's consultant-preparer-authored section restates the same claim: oldest continuously operating brewery site on the block.",
    corroborationKey: SHARED_FACT_KEY,
  };

  const allClaims = [claimViaStaff, claimViaPreparer];

  it("both role Sources resolve their root provenance to the shared document root", () => {
    const staffProfile = claimProvenanceProfile([staffSource.id], sources);
    const preparerProfile = claimProvenanceProfile(
      [preparerSource.id],
      sources,
    );
    expect(staffProfile.roots.has(rootSource.id)).toBe(true);
    expect(preparerProfile.roots.has(rootSource.id)).toBe(true);
  });

  it("runChecks does NOT treat the staff-lane claim as independently corroborated by the preparer-lane claim of the same document", () => {
    const ctx: CheckContext = { claim: claimViaStaff, allClaims, sources };
    const results = runChecks(ctx);
    const corroborationResult = results.find(
      (r) => r.checkId === "superlative-exclusivity-corroboration",
    );
    expect(corroborationResult).toBeDefined();
    // REQUIRED result: not "pass" (which would mean independent
    // corroboration was found) — must be "block-auto-admit".
    expect(corroborationResult!.outcome).toBe("block-auto-admit");
  });

  it("runChecks does NOT treat the preparer-lane claim as independently corroborated by the staff-lane claim of the same document (symmetric)", () => {
    const ctx: CheckContext = { claim: claimViaPreparer, allClaims, sources };
    const results = runChecks(ctx);
    const corroborationResult = results.find(
      (r) => r.checkId === "superlative-exclusivity-corroboration",
    );
    expect(corroborationResult).toBeDefined();
    expect(corroborationResult!.outcome).toBe("block-auto-admit");
  });
});
