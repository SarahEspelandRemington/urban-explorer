/**
 * Unit tests for the Philadelphia district-package adapter v1 (Step 5 —
 * district calibration).
 *
 * SYNTHETIC fixtures only — structurally faithful to the real confirmed
 * Southeast Spruce Hill extraction's per-parcel-field-survey dialect (same
 * field-label lines, same "Registry Number" field, same numbered-heading
 * convention reused from philadelphiaFormNominationAdapter.ts), but using
 * placeholder addresses/text rather than the real document's own prose —
 * this is purely a structural-mechanics test, never an evaluation of real
 * narrative content (see Step 5 task scope: structural calibration only).
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  buildPhiladelphiaDistrictPackagePacket,
  type PhiladelphiaDistrictPackageAdapterInput,
} from "./philadelphiaDistrictPackageAdapter";
import { projectPacketBlocks } from "./packetProjection";
import { FROZEN_BORN_DIGITAL_PDF_ACQUISITION } from "./acquisitionMetadata";

function baseInput(
  rawExtractedText: string,
): PhiladelphiaDistrictPackageAdapterInput {
  return {
    packetId: "pkt-district-test",
    documentTitle: "Test Historic District Nomination",
    jurisdiction: "Philadelphia Historical Commission",
    rootProvenanceId: "pkt-district-test-root",
    acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
    rawExtractedText,
  };
}

// Four-page synthetic fixture mirroring the real Southeast Spruce Hill
// extraction's structure exactly (numbered-heading narrative page, two
// distinct resource-entry pages, a heading-carry-forward continuation page
// with no heading of its own) — placeholder content only.
const FOUR_PAGE_FIXTURE = [
  "1. NAME OF HISTORIC DISTRICT (CURRENT/HISTORIC)\nTest Historic District",
  "Address            100 TEST ST\nProperty Name\nRegistry Number       TEST-001\nPhysical Notes\nSynthetic placeholder descriptive text for resource one.",
  "Address            200 TEST AVE\nProperty Name\nRegistry Number       TEST-002\nPhysical Notes\nSynthetic placeholder descriptive text for resource two.",
  "Continued synthetic narrative text with no heading of its own on this page.",
].join("\f");

describe("buildPhiladelphiaDistrictPackagePacket — multi-resource structure", () => {
  it("produces a multi-resource packet with stable, distinct packet-local resource IDs", () => {
    const packet = buildPhiladelphiaDistrictPackagePacket(
      baseInput(FOUR_PAGE_FIXTURE),
    );
    expect(packet.cardinality).toBe("multi-resource");
    expect(packet.resources).toHaveLength(2);
    expect(packet.resources[0]).toMatchObject({
      resourceId: "pkt-district-test-resource-1",
      resourceLabel: "100 TEST ST",
      sourceNativeId: "TEST-001",
      locationEvidence: { address: "100 TEST ST" },
    });
    expect(packet.resources[1]).toMatchObject({
      resourceId: "pkt-district-test-resource-2",
      resourceLabel: "200 TEST AVE",
      sourceNativeId: "TEST-002",
      locationEvidence: { address: "200 TEST AVE" },
    });
  });

  it("assigns resourceRef only on resource-entry blocks, each pointing to its own resource, never cross-attributed", () => {
    const packet = buildPhiladelphiaDistrictPackagePacket(
      baseInput(FOUR_PAGE_FIXTURE),
    );
    const resourceEntryBlocks = packet.blocks.filter(
      (b) => b.scope === "resource-entry",
    );
    expect(resourceEntryBlocks).toHaveLength(2);
    expect(resourceEntryBlocks[0]!.resourceRef).toBe(
      "pkt-district-test-resource-1",
    );
    expect(resourceEntryBlocks[1]!.resourceRef).toBe(
      "pkt-district-test-resource-2",
    );
    const resourceRefEvidence =
      resourceEntryBlocks[0]!.assignmentEvidence?.find(
        (e) => e.assigns === "resourceRef",
      );
    expect(resourceRefEvidence?.structuralCueType).toBe(
      "address-field-label-line",
    );
    expect(resourceRefEvidence?.verbatimText).toBe(
      "Address            100 TEST ST",
    );
  });

  it("district-narrative blocks never carry a resourceRef, including a heading-carry-forward continuation page with no heading of its own", () => {
    const packet = buildPhiladelphiaDistrictPackagePacket(
      baseInput(FOUR_PAGE_FIXTURE),
    );
    const narrativeBlocks = packet.blocks.filter(
      (b) => b.scope === "district-narrative",
    );
    expect(narrativeBlocks).toHaveLength(2);
    for (const b of narrativeBlocks) {
      expect(b.resourceRef).toBeUndefined();
    }
    expect(narrativeBlocks[0]!.sourceNativeHeading).toBe(
      "1. NAME OF HISTORIC DISTRICT (CURRENT/HISTORIC)",
    );
    // The continuation page has no heading of its own but carries the same
    // active heading forward (document-wide state, same convention as the
    // individual-form adapter).
    expect(narrativeBlocks[1]!.sourceNativeHeading).toBe(
      "1. NAME OF HISTORIC DISTRICT (CURRENT/HISTORIC)",
    );
    const carryForwardEvidence = narrativeBlocks[1]!.assignmentEvidence?.find(
      (e) => e.assigns === "scope",
    );
    expect(carryForwardEvidence?.structuralCueType).toBe(
      "heading-carry-forward",
    );
  });

  it("always fails closed to authorshipRole unknown with a recorded basis", () => {
    const packet = buildPhiladelphiaDistrictPackagePacket(
      baseInput(FOUR_PAGE_FIXTURE),
    );
    for (const block of packet.blocks) {
      expect(block.authorshipRole).toBe("unknown");
      const authorshipEvidence = block.assignmentEvidence?.find(
        (e) => e.assigns === "authorshipRole",
      );
      expect(authorshipEvidence?.structuralCueType).toBe(
        "no-attribution-found",
      );
    }
  });

  it("never detects a stated-status checkbox (not present in this document family)", () => {
    const packet = buildPhiladelphiaDistrictPackagePacket(
      baseInput(FOUR_PAGE_FIXTURE),
    );
    expect(packet.statedStatus).toBeUndefined();
  });
});

describe("buildPhiladelphiaDistrictPackagePacket — undeterminable fallback (synthetic, not observed in the real Southeast Spruce Hill extraction itself)", () => {
  it("fails closed to undeterminable scope when a page has neither an Address field-label line nor any heading, and no heading has yet been seen", () => {
    const NO_HEADING_YET_FIXTURE =
      "Some stray front-matter content with no Address field and no numbered heading anywhere on this page.\f1. NAME OF HISTORIC DISTRICT\nmore text";
    const packet = buildPhiladelphiaDistrictPackagePacket(
      baseInput(NO_HEADING_YET_FIXTURE),
    );
    expect(packet.blocks[0]!.scope).toBe("undeterminable");
    expect(packet.blocks[0]!.resourceRef).toBeUndefined();
    const scopeEvidence = packet.blocks[0]!.assignmentEvidence?.find(
      (e) => e.assigns === "scope",
    );
    expect(scopeEvidence?.structuralCueType).toBe(
      "no-address-no-heading-fallback",
    );
    expect(packet.blocks[1]!.scope).toBe("district-narrative");
    expect(packet.ambiguityFlags).toBeDefined();
    expect(
      packet.ambiguityFlags!.some((f) => f.includes("undeterminable")),
    ).toBe(true);
  });
});

describe("buildPhiladelphiaDistrictPackagePacket — shared structural projection (real adapter output, shared generic projection module)", () => {
  it("projects resource-entry blocks only to their own matching resourceRef, holds district-narrative out, and never silently drops a block", () => {
    const packet = buildPhiladelphiaDistrictPackagePacket(
      baseInput(FOUR_PAGE_FIXTURE),
    );
    const { eligibleBlocks, scopeExcluded } = projectPacketBlocks(packet);

    // No block is silently dropped: every block is accounted for as either
    // eligible or scope-excluded-as-context.
    expect(eligibleBlocks.length + scopeExcluded.length).toBe(
      packet.blocks.length,
    );

    expect(eligibleBlocks).toHaveLength(2);
    const eligibleByResource = new Map(
      eligibleBlocks.map((e) => [e.resourceId, e.block]),
    );
    expect(
      eligibleByResource.get("pkt-district-test-resource-1")?.text,
    ).toContain("resource one");
    expect(
      eligibleByResource.get("pkt-district-test-resource-2")?.text,
    ).toContain("resource two");

    expect(scopeExcluded).toHaveLength(2);
    for (const { block } of scopeExcluded) {
      expect(block.scope).toBe("district-narrative");
    }
  });
});
