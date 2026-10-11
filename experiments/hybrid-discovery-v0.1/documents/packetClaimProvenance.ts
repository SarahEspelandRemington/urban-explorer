/**
 * Experiments-only block-local claim provenance/back-mapping for a
 * `DocumentEvidencePacket`.
 *
 * A claim produced by running one block's text through the real production
 * `extractNarrativeClaims` already carries that block's exact sentence as
 * `claim.supportingSpan`. This module records WHERE within the packet that
 * span came from (packet id, blockId, page, block-local charRange, block
 * sentence index) by locating the span strictly within the single
 * already-known originating block — never via a whole-document substring
 * search. This distinction matters whenever the same verbatim sentence
 * appears in more than one block (see packetPipeline.e2e.test.ts): a
 * whole-document search would resolve every occurrence to whichever
 * occurrence comes first in document order, silently misattributing every
 * later occurrence to the wrong block.
 *
 * Offline/non-production, experimental.
 */
import type { Claim } from "../../../artifacts/api-server/src/lib/localHistoryAdmission/types";
import type {
  DocumentBlock,
  DocumentEvidencePacket,
} from "./documentEvidencePacket";

export interface ClaimProvenanceRecord {
  packetId: string;
  blockId: string;
  page?: number;
  /** Start/end offset of claim.supportingSpan within this block's OWN text only — never a whole-document offset. Undefined if the span could not be located in this block (never silently assumed). */
  charRange?: [number, number];
  sentenceIndex?: number;
}

/**
 * Resolves a claim's provenance within the single already-known block it
 * was extracted from. `block` must be the exact block whose text was passed
 * to `extractNarrativeClaims` to produce `claim` — this function never
 * searches any other block or the packet as a whole.
 */
export function recordClaimProvenance(
  claim: Claim,
  block: DocumentBlock,
  packet: DocumentEvidencePacket,
): ClaimProvenanceRecord {
  const localIndex = block.text.indexOf(claim.supportingSpan);
  const charRange: [number, number] | undefined =
    localIndex === -1
      ? undefined
      : [localIndex, localIndex + claim.supportingSpan.length];
  return {
    packetId: packet.packetId,
    blockId: block.blockId,
    page: block.page,
    charRange,
    sentenceIndex: block.sentenceIndex,
  };
}
