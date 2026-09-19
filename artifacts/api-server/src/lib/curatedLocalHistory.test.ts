import { describe, expect, it } from "vitest";
import {
  CURATED_LOCAL_HISTORY,
  GENERATED_LOCAL_HISTORY,
  getApprovedCuratedEntry,
} from "./curatedLocalHistory";

describe("getApprovedCuratedEntry — generated + hand-maintained merge precedence", () => {
  it("returns a hand-maintained entry for a subjectId only present in CURATED_LOCAL_HISTORY", () => {
    const subjectId = Object.keys(CURATED_LOCAL_HISTORY)[0];
    expect(subjectId).toBeDefined();
    expect(GENERATED_LOCAL_HISTORY[subjectId]).toBeUndefined();
    const entry = getApprovedCuratedEntry(subjectId);
    expect(entry).toBe(CURATED_LOCAL_HISTORY[subjectId]);
  });

  it("falls through to a generated entry when no hand-maintained entry exists for that subjectId", () => {
    const subjectId = Object.keys(GENERATED_LOCAL_HISTORY)[0];
    expect(subjectId).toBeDefined();
    expect(CURATED_LOCAL_HISTORY[subjectId]).toBeUndefined();
    const entry = getApprovedCuratedEntry(subjectId);
    expect(entry).toBe(GENERATED_LOCAL_HISTORY[subjectId]);
    expect(entry?.evidence.admissionMethod).toBe("automated");
  });

  it("every generated entry is reachable through getApprovedCuratedEntry()", () => {
    for (const subjectId of Object.keys(GENERATED_LOCAL_HISTORY)) {
      const entry = getApprovedCuratedEntry(subjectId);
      expect(entry).toBe(GENERATED_LOCAL_HISTORY[subjectId]);
    }
  });

  it("a hand-maintained entry wins over a generated entry sharing the same subjectId", () => {
    const subjectId = "test/collision-subject";
    const handMaintained = CURATED_LOCAL_HISTORY[subjectId];
    const generated = GENERATED_LOCAL_HISTORY[subjectId];
    expect(handMaintained).toBeUndefined();
    expect(generated).toBeUndefined();

    // Construct the collision directly against the registries, mirroring
    // getApprovedCuratedEntry's own precedence logic, since no real
    // collision exists in the current data set.
    (
      CURATED_LOCAL_HISTORY as Record<
        string,
        (typeof CURATED_LOCAL_HISTORY)[string]
      >
    )[subjectId] = {
      source: {
        title: "hand-maintained source",
        sourceType: "test",
        usageNote: "test",
      },
      evidence: {
        subjectId,
        text: "hand-maintained text",
        claimScope: "test",
        verificationStatus: "approved",
        verificationConfidence: "high",
        curatedTrust: "high",
        lastVerifiedDate: "2026-01-01",
      },
    };
    (
      GENERATED_LOCAL_HISTORY as Record<
        string,
        (typeof GENERATED_LOCAL_HISTORY)[string]
      >
    )[subjectId] = {
      source: {
        title: "generated source",
        sourceType: "test",
        usageNote: "test",
      },
      evidence: {
        subjectId,
        text: "generated text",
        claimScope: "test",
        verificationStatus: "approved",
        verificationConfidence: "high",
        curatedTrust: "high",
        lastVerifiedDate: "2026-01-01",
        admissionMethod: "automated",
      },
    };

    try {
      const entry = getApprovedCuratedEntry(subjectId);
      expect(entry?.evidence.text).toBe("hand-maintained text");
    } finally {
      delete (CURATED_LOCAL_HISTORY as Record<string, unknown>)[subjectId];
      delete (GENERATED_LOCAL_HISTORY as Record<string, unknown>)[subjectId];
    }
  });

  it("subjects covered by an existing hand-curated identity remain unreachable through GENERATED_LOCAL_HISTORY", () => {
    // Subjects that were part of the 13-candidate combined-proof set and
    // cleared claim-level admission, but remain deliberately excluded from
    // GENERATED_LOCAL_HISTORY for reasons unrelated to claim quality:
    // way/1314403624 (La Milagrosa) sits on STALE_OSM_IDS and is covered by
    // a hand-curated entry; way/250706038 (Stetson House) carries no OSM
    // name tag and is also covered by a hand-curated entry.
    const excludedSubjectIds = ["way/1314403624", "way/250706038"];
    for (const subjectId of excludedSubjectIds) {
      expect(GENERATED_LOCAL_HISTORY[subjectId]).toBeUndefined();
      expect(getApprovedCuratedEntry(subjectId)).toBeUndefined();
    }
  });

  it("returns undefined for an arbitrary unregistered subjectId", () => {
    expect(getApprovedCuratedEntry("way/000000000")).toBeUndefined();
  });
});
