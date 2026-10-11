/**
 * Experiments-only tests for the authorship-role synthetic Source split
 * itself (shape/wiring). The real production-corroboration consequence of
 * this split is covered separately, against the real production checks.ts,
 * in sourceCorroboration.production.test.ts.
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts.
 */
import { describe, expect, it } from "vitest";
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

describe("buildSyntheticSourcesForPacket", () => {
  it("creates one synthetic Source per distinct authorship role actually present", () => {
    const { roleSources } = buildSyntheticSourcesForPacket(makePacket());
    expect(Object.keys(roleSources).sort()).toEqual(
      ["commission-staff", "consultant-preparer"].sort(),
    );
  });

  it("every role Source and the root Source keep sourceClass government-preservation-record", () => {
    const { rootSource, roleSources } =
      buildSyntheticSourcesForPacket(makePacket());
    expect(rootSource.sourceClass).toBe("government-preservation-record");
    for (const source of Object.values(roleSources)) {
      expect(source!.sourceClass).toBe("government-preservation-record");
    }
  });

  it("every role Source declares underlyingProvenanceOf pointing at the shared document root", () => {
    const { rootSource, roleSources } =
      buildSyntheticSourcesForPacket(makePacket());
    for (const source of Object.values(roleSources)) {
      expect(source!.underlyingProvenanceOf).toEqual([rootSource.id]);
    }
  });

  it("the root Source itself declares no underlyingProvenanceOf", () => {
    const { rootSource } = buildSyntheticSourcesForPacket(makePacket());
    expect(rootSource.underlyingProvenanceOf).toBeUndefined();
  });
});
