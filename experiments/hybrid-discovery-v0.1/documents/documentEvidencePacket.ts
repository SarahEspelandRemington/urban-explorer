/**
 * Experimental sidecar type for representing preservation-document
 * evidence (e.g. a Philadelphia Register of Historic Places nomination)
 * before it reaches the shared Streetlit local-history admission pipeline.
 *
 * Offline/non-production, experimental — lives entirely under experiments/.
 * Does NOT change canonical production `Claim`, `Source`, or `ClaimType`
 * (artifacts/api-server/src/lib/localHistoryAdmission/types.ts). A
 * `DocumentEvidencePacket` is never admitted directly: its eligible blocks
 * are projected (see packetProjection.ts) into source-native text that is
 * then run through the real, unmodified production
 * `extractNarrativeClaims` / `runPipeline` / `evaluateDiscoveryWorthiness`
 * functions, after an authorship-role-aware synthetic-Source split (see
 * documentSourceSplit.ts).
 *
 * No Philadelphia-specific parsing lives here — this module is deliberately
 * city-agnostic. A future adapter (not built in this task) is responsible
 * for populating a packet from a real document; this file only defines the
 * shape it must produce.
 */
import type { AcquisitionRecord } from "./acquisitionMetadata";

/** How a document describes the scope of a given resource across its blocks. */
export type DocumentCardinality = "single-resource" | "multi-resource";

/**
 * What a block of document text is actually narrating.
 * - "resource-entry": narrates one specific named resource.
 * - "district-narrative": narrates the district/context as a whole, never
 *   auto-attached to an individual property.
 * - "document-level": narrates "the property" with no sub-resource split —
 *   only meaningful (and only property-eligible) for a single-resource packet.
 * - "undeterminable": the adapter could not classify this block's scope.
 *   Always ineligible — never silently treated as any of the above.
 */
export type DocumentScopeState =
  | "resource-entry"
  | "district-narrative"
  | "document-level"
  | "undeterminable";

/**
 * Who authored a block's content, reported by the adapter/packet as a bare
 * fact — never a trust judgment. Capability strength for each role is
 * decided entirely in shared experimental logic (authorshipCapability.ts),
 * never here and never in a city-specific adapter.
 *
 * Deliberately NOT used for cited historical assertions within a document's
 * own prose (e.g. a footnoted claim about an 1859 sale) — those are handled
 * via `references[]` / production `underlyingProvenanceOf` root-provenance
 * chains, not an authorship role. See the `references[]` doc below.
 */
export type AuthorshipRole =
  | "commission-staff"
  | "applicant"
  | "consultant-preparer"
  | "unknown";

export interface DocumentResource {
  /** Stable within this packet only — not a production/runtime identifier. */
  resourceId: string;
  /** Primary name as stated in the document. */
  resourceLabel: string;
  aliases?: string[];
  /** e.g. an OPA account number, a nomination/map-registry number — as stated, verbatim. */
  sourceNativeId?: string;
  locationEvidence?: {
    address?: string;
    /** e.g. a boundary description, as stated — not normalized. */
    description?: string;
  };
}

export interface DocumentBlock {
  /** Stable within this packet only. */
  blockId: string;
  page?: number;
  /**
   * Which resource this block is about. Required for `resource-entry`
   * scope in a `multi-resource` packet (see packetProjection.ts's
   * eligibility rule) — omitted for `district-narrative`/`document-level`/
   * `undeterminable` blocks, which are never resource-specific by scope.
   */
  resourceRef?: string;
  scope: DocumentScopeState;
  authorshipRole: AuthorshipRole;
  /** Heading/label as it appears in the source document, when available (e.g. "6. Description"). */
  sourceNativeHeading?: string;
  /** Verbatim block text. */
  text: string;
  /** Block-local only — never a whole-document offset. */
  charRange?: [number, number];
  sentenceIndex?: number;
  acquisition: AcquisitionRecord;
  /** Free-text note when this block's scope/role/content is ambiguous — never silently dropped. */
  ambiguityNote?: string;
}

/**
 * Exists in the sidecar schema now so a future adapter has somewhere to put
 * a document's own bibliography/footnote citations, but is deliberately
 * NOT wired into production `underlyingProvenanceOf` in this task. Real
 * reference handling (resolving a citation to its own root-provenance
 * chain) waits until an adapter actually encounters real documentary
 * references — doing it generically now, with no real reference shapes to
 * validate against, would be speculative.
 */
export interface DocumentReference {
  referenceId: string;
  /** As it appears in the document's own bibliography/footnote. */
  citationText: string;
}

export interface DocumentEvidencePacket {
  schemaVersion: 1;
  packetId: string;
  documentTitle: string;
  /** External document identifier, when the source assigns one (e.g. a nomination/accession number). */
  documentId?: string;
  documentUrl?: string;
  /** e.g. "Philadelphia Historical Commission". */
  jurisdiction: string;
  publicationDate?: string;

  cardinality: DocumentCardinality;
  /** Length 1 for a single-resource packet. */
  resources: DocumentResource[];
  blocks: DocumentBlock[];

  /**
   * The Source id every authorship-role synthetic Source this packet
   * produces (see documentSourceSplit.ts) will declare via
   * `underlyingProvenanceOf`, so all role-split Sources collapse to one
   * document-level root provenance chain rather than being treated as
   * independent corroboration. Not a Source itself.
   */
  rootProvenanceId: string;

  /** Present for a future adapter; unused/unwired in this task. */
  references?: DocumentReference[];

  /** Document-level ambiguity/missing-data flags — never silently discarded. */
  ambiguityFlags?: string[];
}
