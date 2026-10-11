/**
 * Focused tests for packetProjection's scope-eligibility rules. Synthetic
 * fixtures only — experiments-only reimplementation test, not exercising
 * any production module.
 *
 * NOTE ON TEST-RUNNER SCOPE: this file lives under experiments/
 * hybrid-discovery-v0.1/documents/ and is not currently scanned by the
 * committed CI test path (artifacts/api-server/src only) — same disclosed
 * limitation as combinePabAndBaldwinPark.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateBlockScopeEligibility,
  projectPacketBlocks,
} from "./packetProjection";
import type {
  DocumentBlock,
  DocumentEvidencePacket,
} from "./documentEvidencePacket";
import { FROZEN_BORN_DIGITAL_PDF_ACQUISITION } from "./acquisitionMetadata";

function makeBlock(
  overrides: Partial<DocumentBlock> & { blockId: string },
): DocumentBlock {
  return {
    scope: "resource-entry",
    authorshipRole: "commission-staff",
    text: "placeholder text",
    acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
    ...overrides,
  };
}

function makePacket(
  overrides: Partial<DocumentEvidencePacket> & { blocks: DocumentBlock[] },
): DocumentEvidencePacket {
  return {
    schemaVersion: 1,
    packetId: "test-packet",
    documentTitle: "Test Nomination",
    jurisdiction: "Test Jurisdiction",
    cardinality: "single-resource",
    resources: [{ resourceId: "res-a", resourceLabel: "Resource A" }],
    rootProvenanceId: "test-packet-root",
    ...overrides,
  };
}

describe("evaluateBlockScopeEligibility", () => {
  it("single-resource document-level block is eligible, attributed to the sole resource", () => {
    const block = makeBlock({ blockId: "b1", scope: "document-level" });
    const packet = makePacket({ blocks: [block] });
    const result = evaluateBlockScopeEligibility(block, packet);
    expect(result.eligible).toBe(true);
    expect(result.resourceId).toBe("res-a");
  });

  it("multi-resource resource-entry block with a matching resourceRef is eligible and attributed to that resource", () => {
    const block = makeBlock({
      blockId: "b1",
      scope: "resource-entry",
      resourceRef: "res-b",
    });
    const packet = makePacket({
      cardinality: "multi-resource",
      resources: [
        { resourceId: "res-a", resourceLabel: "Resource A" },
        { resourceId: "res-b", resourceLabel: "Resource B" },
      ],
      blocks: [block],
    });
    const result = evaluateBlockScopeEligibility(block, packet);
    expect(result.eligible).toBe(true);
    expect(result.resourceId).toBe("res-b");
  });

  it("multi-resource resource-entry block with a missing resourceRef is ineligible", () => {
    const block = makeBlock({ blockId: "b1", scope: "resource-entry" });
    const packet = makePacket({
      cardinality: "multi-resource",
      resources: [
        { resourceId: "res-a", resourceLabel: "Resource A" },
        { resourceId: "res-b", resourceLabel: "Resource B" },
      ],
      blocks: [block],
    });
    const result = evaluateBlockScopeEligibility(block, packet);
    expect(result.eligible).toBe(false);
  });

  it("multi-resource resource-entry block with a resourceRef that matches no declared resource is ineligible", () => {
    const block = makeBlock({
      blockId: "b1",
      scope: "resource-entry",
      resourceRef: "res-does-not-exist",
    });
    const packet = makePacket({
      cardinality: "multi-resource",
      resources: [
        { resourceId: "res-a", resourceLabel: "Resource A" },
        { resourceId: "res-b", resourceLabel: "Resource B" },
      ],
      blocks: [block],
    });
    const result = evaluateBlockScopeEligibility(block, packet);
    expect(result.eligible).toBe(false);
  });

  it("district-narrative scope is always ineligible, even with a resourceRef set", () => {
    const block = makeBlock({
      blockId: "b1",
      scope: "district-narrative",
      resourceRef: "res-a",
    });
    const packet = makePacket({ blocks: [block] });
    const result = evaluateBlockScopeEligibility(block, packet);
    expect(result.eligible).toBe(false);
  });

  it("document-level scope is ineligible in a multi-resource packet", () => {
    const block = makeBlock({ blockId: "b1", scope: "document-level" });
    const packet = makePacket({
      cardinality: "multi-resource",
      resources: [
        { resourceId: "res-a", resourceLabel: "Resource A" },
        { resourceId: "res-b", resourceLabel: "Resource B" },
      ],
      blocks: [block],
    });
    const result = evaluateBlockScopeEligibility(block, packet);
    expect(result.eligible).toBe(false);
  });

  it("undeterminable scope is always ineligible", () => {
    const block = makeBlock({ blockId: "b1", scope: "undeterminable" });
    const packet = makePacket({ blocks: [block] });
    const result = evaluateBlockScopeEligibility(block, packet);
    expect(result.eligible).toBe(false);
  });
});

describe("projectPacketBlocks", () => {
  it("partitions a packet's blocks into eligible and scope-excluded, never dropping either", () => {
    const eligible = makeBlock({
      blockId: "eligible-1",
      scope: "document-level",
    });
    const excluded = makeBlock({
      blockId: "excluded-1",
      scope: "district-narrative",
    });
    const packet = makePacket({ blocks: [eligible, excluded] });
    const { eligibleBlocks, scopeExcluded } = projectPacketBlocks(packet);
    expect(eligibleBlocks.map((e) => e.block.blockId)).toEqual(["eligible-1"]);
    expect(scopeExcluded.map((e) => e.block.blockId)).toEqual(["excluded-1"]);
  });
});
