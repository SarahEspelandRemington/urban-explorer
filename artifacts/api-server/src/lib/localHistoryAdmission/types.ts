/**
 * Vocabulary for the Streetlit local-history admission engine.
 *
 * Promoted (faithful port) from experiments/hybrid-discovery-v0.1/types.ts for
 * production offline batch-tool use. This module is NOT wired into the
 * runtime request path — it is used only by an offline generator that
 * produces a checked-in artifact + compatibility projection consumed
 * separately by curatedLocalHistory.ts (that wiring is a later step, not
 * done by this module).
 */

/** Source class: a category of provenance, not a trust score. */
export type SourceClass =
  | "government-preservation-record"
  | "built-environment-cultural-database"
  | "local-public-history-narrative"
  | "institutional-history-archive"
  | "marker-plaque-structured-dataset"
  | "wikipedia-wikidata"
  | "osm"
  // Deliberately NOT one of the seven approved families — any claim whose
  // source resolves to this is rejected outright by the admissibility check,
  // regardless of how confident the claim text sounds.
  | "inadmissible-generic-web";

export type ClaimType =
  | "identity"
  | "construction-date"
  | "architect"
  | "register-status"
  | "use-history"
  | "biographical"
  | "institutional-founding"
  | "event"
  | "superlative"
  | "legend-tradition"
  | "statistic"
  | "demolition"
  | "relationship";

/**
 * Per-claim-type strength for a given source. A source may be strong for
 * one claim type and weak/absent for another — this replaces a single
 * global trust score.
 */
export interface SourceCapability {
  claimType: ClaimType;
  strength: "high" | "medium" | "low" | "none";
  notes?: string;
}

export interface Source {
  id: string;
  title: string;
  url?: string;
  sourceClass: SourceClass;
  publicationDate?: string;
  capabilities: SourceCapability[];
  /**
   * IDs of sources this source itself draws from, when known/stated. Used
   * to trace corroboration back to a root provenance chain rather than
   * counting repeated pages within the same chain as independent.
   */
  underlyingProvenanceOf?: string[];
  /**
   * True only for an AI/search-engine-generated synthesis of results (not a
   * primary or republished source itself). Such "sources" may only ever
   * have surfaced a lead for discovery — they can never be the resolved
   * evidentiary source for an admitted claim.
   */
  isSynthesizedSearchOutput?: boolean;
  /**
   * When a claim's citation chain was checked and found NOT to actually
   * support the claim (e.g. resolves to an unrelated building/document),
   * record that here rather than silently dropping the source. This models
   * the real 1822 Spring Garden case.
   */
  provenanceVerificationNote?: string;
  provenanceVerified?: boolean;
}

export type EpistemicMarker =
  | "hedged"
  | "legend-or-tradition"
  | "rumor-explicitly-denied"
  | "author-uncertainty"
  | "self-corrected-primary-source"
  | "superlative"
  | "disputed-across-sources"
  | "unresolved-cross-source-conflict";

export type ProposedIdentityType =
  | "current-osm-entity"
  | "unnamed-current-building"
  | "current-building-former-use"
  | "former-site"
  | "unresolved";

export interface Claim {
  id: string;
  placeKey: string;
  address?: string;
  proposedIdentityType: ProposedIdentityType;
  sourceIds: string[]; // one or more sources supporting this exact claim
  supportingSpan: string; // exact/near-exact quoted text
  claimType: ClaimType;
  claimText: string;
  relatedEntities?: string[];
  dateRange?: { start?: string; end?: string; asOf?: string; precise: boolean };
  epistemicMarkers?: EpistemicMarker[];
  locationHints?: string;
  /**
   * If true, the source itself explicitly states this claim (e.g. a rumor)
   * is false/incorrect — the claim text captures the rumor for the record,
   * but must never be admitted as fact.
   */
  sourceRefutesThisClaim?: boolean;
  /**
   * Explicit key shared by claims asserting the same underlying fact from
   * different sources, used for provenance-aware corroboration matching.
   * Deliberately explicit rather than fuzzy text matching.
   */
  corroborationKey?: string;
  /**
   * How this claim was found. "direct-source-text" means the claim was read
   * straight off an admissible source's own page. "discovery-lead-traced-to-source"
   * means a non-evidentiary lead (e.g. a real-estate listing or search
   * snippet) pointed at this fact, but the claim itself still resolves to
   * and is sourced from an admissible source, not the lead.
   */
  extractionMethod?: "direct-source-text" | "discovery-lead-traced-to-source";
  /**
   * The exact runtime identity Streetlit would use for this claim in
   * production — an OSM element id (`"${type}/${id}"`) or an explicitly
   * registered StreetlitPlace id. This is NEVER derived from placeKey,
   * address similarity, place name, or fuzzy proximity — only from a
   * deterministic grounding match or an explicit human-established
   * StreetlitPlace link. placeKey remains the internal claim/cross-source
   * join key and must not be substituted here. A claim without this field
   * is non-projectable to any runtime surface.
   */
  productionSubjectId?: string;
}

export interface CheckResult {
  checkId: string;
  outcome: "pass" | "block-auto-admit" | "fail";
  reason: string;
}

export interface CheckContext {
  claim: Claim;
  allClaims: Claim[];
  sources: Record<string, Source>;
}

export type ClaimCheck = (ctx: CheckContext) => CheckResult;

export type GroundingTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface GroundingResult {
  tier: GroundingTier;
  confidence: "high" | "medium" | "low" | "none";
  matchedIdentity?: string;
  reason: string;
}

export type EditorialQuality = "high" | "medium" | "low" | "n/a";

export type Decision = "AUTO-ADMIT" | "HOLD" | "SUPPRESS";

export interface DecisionResult {
  decision: Decision;
  factualTrust: "high" | "medium" | "low";
  identityConfidence: "high" | "medium" | "low" | "none";
  editorialQuality: EditorialQuality;
  reasons: string[];
}

export interface ClaimOutcome {
  claim: Claim;
  checks: CheckResult[];
  grounding: GroundingResult;
  decision: DecisionResult;
}
