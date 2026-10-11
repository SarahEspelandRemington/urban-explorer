/**
 * Experiments-only tests for packetClaimProvenance's block-local
 * back-mapping, including the identical-sentence-in-two-blocks
 * disambiguation that a whole-document substring search would get wrong.
 *
 * NOTE ON TEST-RUNNER SCOPE: see packetProjection.test.ts.
 */
import { describe, expect, it } from "vitest";
import { recordClaimProvenance } from "./packetClaimProvenance";
import type {
  DocumentBlock,
  DocumentEvidencePacket,
} from "./documentEvidencePacket";
import type { Claim } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/types";
import { FROZEN_BORN_DIGITAL_PDF_ACQUISITION } from "./acquisitionMetadata";

const DUPLICATE_SENTENCE = "The Rothacker Brewery was built in 1859.";

function makeBlock(blockId: string, text: string, page: number): DocumentBlock {
  return {
    blockId,
    page,
    scope: "resource-entry",
    resourceRef: "res-a",
    authorshipRole: "commission-staff",
    text,
    acquisition: FROZEN_BORN_DIGITAL_PDF_ACQUISITION,
  };
}

function makePacket(blocks: DocumentBlock[]): DocumentEvidencePacket {
  return {
    schemaVersion: 1,
    packetId: "pkt-1",
    documentTitle: "Synthetic Nomination",
    jurisdiction: "Test Jurisdiction",
    cardinality: "single-resource",
    resources: [{ resourceId: "res-a", resourceLabel: "Resource A" }],
    rootProvenanceId: "pkt-1-root",
    blocks,
  };
}

function makeClaim(id: string, supportingSpan: string): Claim {
  return {
    id,
    placeKey: "res-a",
    proposedIdentityType: "current-osm-entity",
    sourceIds: ["src-1"],
    supportingSpan,
    claimType: "construction-date",
    claimText: supportingSpan,
  };
}

describe("recordClaimProvenance", () => {
  it("resolves a claim's charRange within its own block when the span is present", () => {
    const block = makeBlock("block-a", "Intro text. " + DUPLICATE_SENTENCE, 3);
    const packet = makePacket([block]);
    const claim = makeClaim("c1", DUPLICATE_SENTENCE);
    const record = recordClaimProvenance(claim, block, packet);
    expect(record.blockId).toBe("block-a");
    expect(record.page).toBe(3);
    expect(record.charRange).toEqual([
      "Intro text. ".length,
      "Intro text. ".length + DUPLICATE_SENTENCE.length,
    ]);
  });

  it("returns undefined charRange, never a false-positive guess, when the span is not actually in the given block", () => {
    const block = makeBlock("block-a", "Unrelated text only.", 1);
    const packet = makePacket([block]);
    const claim = makeClaim("c1", DUPLICATE_SENTENCE);
    const record = recordClaimProvenance(claim, block, packet);
    expect(record.charRange).toBeUndefined();
    expect(record.blockId).toBe("block-a");
  });

  it("correctly disambiguates an identical verbatim sentence appearing in two different blocks, by block-local lookup only", () => {
    const blockA = makeBlock("block-a", DUPLICATE_SENTENCE, 1);
    const blockB = makeBlock("block-b", DUPLICATE_SENTENCE, 7);
    const packet = makePacket([blockA, blockB]);
    const claimFromA = makeClaim("c-a", DUPLICATE_SENTENCE);
    const claimFromB = makeClaim("c-b", DUPLICATE_SENTENCE);

    const recordA = recordClaimProvenance(claimFromA, blockA, packet);
    const recordB = recordClaimProvenance(claimFromB, blockB, packet);

    expect(recordA.blockId).toBe("block-a");
    expect(recordA.page).toBe(1);
    expect(recordB.blockId).toBe("block-b");
    expect(recordB.page).toBe(7);

    // Contrast: a naive whole-document search would find only the FIRST
    // occurrence and misattribute both claims to it.
    const wholeDocument = blockA.text + "\n\n" + blockB.text;
    const naiveIndex = wholeDocument.indexOf(DUPLICATE_SENTENCE);
    expect(naiveIndex).toBe(0); // always resolves to block A's offset...
    // ...which would be WRONG for claimFromB, whose real block-local
    // provenance (proven above) is block B, not block A.
    expect(recordB.blockId).not.toBe("block-a");
  });
});
