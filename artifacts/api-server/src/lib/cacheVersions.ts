// cache-versions:v19:
/**
 * Single source of truth for all LLM and OSM cache version strings.
 *
 * Rules:
 *  - When bumping a version, update the entry in LLM_CACHE_CURRENT_VERSIONS
 *    AND the matching literal in the discoverCacheKey assignment in
 *    routes/explore/index.ts (the literal there must stay in sync).
 *  - routes/explore/index.ts imports LLM_CACHE_CURRENT_VERSIONS for startup
 *    eviction of stale DB rows.
 *  - routes/health.ts imports CURRENT_CACHE_VERSIONS to report runtime state
 *    at /api/healthz.
 *
 * v5-v6: B2 registry reconciliation — corrected six stale registry values
 * (geocode, investigate, detail, narration, deep-narration, places-route) to
 * match their already-live runtime cache-key literals, and added support for
 * a prefix to declare multiple simultaneously-current versions (used by
 * quick/full, which have distinct legacy vs. osm-anchor versions). No
 * runtime cache-key literal changed; this file's own version bump is a
 * prompt-manifest bookkeeping requirement only (whole-file/self-tag
 * tracking), not a cache-behavior change.
 *
 * v6-v7: Green Room curated-local-history Pilot A — osm-anchor discover
 * cache-key literal bumped v76->v77 (formatForCopy gained curatedContent/
 * curatedClaimScope fields and the copy-gen system prompt gained rule 12;
 * see routes/explore/index.ts). Registry entries updated to match; v76 is
 * retired (no rows can carry it going forward) and is removed from the
 * quick/full entries below, same as any other single-version bump.
 *
 * v7-v8: Pilot A pre-production corrections — osm-anchor discover cache-key
 * literal bumped v77->v78 (formatForCopy now also sends curatedTrust; rule
 * 12 reworded to remove "higher-trust source material" framing, embed the
 * new CURATED_COPY_RULES tiers, and add an explicit precedence clause so
 * osm_bare's restrictions don't contradict claims inside curatedClaimScope;
 * see routes/explore/index.ts and lib/curatedLocalHistory.ts). Registry
 * entries updated to match; v77 is retired and removed from the quick/full
 * entries below.
 *
 * v8-v9: One-primary-unit narration — osm-anchor discover cache-key literal
 * bumped v78->v79 (new selectPrimaryUnit stage narrows A3-approved Wikipedia
 * evidence to a single sentence-level unit; formatForCopy gained
 * wikipediaUnitOnly and the copy-gen system prompt gained rule 11a; see
 * routes/explore/index.ts). Registry entries updated to match; v78 is
 * retired and removed from the quick/full entries below.
 *
 * v9-v10: A3 candidate-window widened 3->6 — osm-anchor discover cache-key
 * literal bumped v79->v80 (the closestEnriched slice in the Walk Mode
 * evidence-selector invocation now takes the 6 closest Wikipedia-enriched
 * candidates instead of 3; no other A3 logic, prompts, fallback behavior,
 * or response contract changed; see routes/explore/index.ts). Registry
 * entries updated to match; v79 is retired and removed from the quick/full
 * entries below.
 *
 * v10-v11: A3 candidate-window reverted 6->3 — osm-anchor discover cache-key
 * literal bumped v80->v81. The Aug. 31 field test showed the wider window
 * did not improve Walk Mode selection quality; this reverts the
 * closestEnriched slice back to the 3 closest Wikipedia-enriched candidates,
 * with no other A3 logic, prompts, fallback behavior, or response contract
 * change; see routes/explore/index.ts). Registry entries updated to match;
 * v80 is retired and removed from the quick/full entries below.
 *
 * v11-v12: Narration-time JIT A3 — selectEvidenceParagraphs/selectPrimaryUnit
 * hoisted from a discover-only closure to module scope in
 * routes/explore/index.ts so /explore/walk-narration-audio can reuse them
 * (relocation only, no prompt/model/call-parameter change); osm-anchor
 * discover cache-key literal bumped v81->v82 for the manifest hash change
 * from that relocation. Separately, the shared narration cache-key literal
 * (used by both /explore/walk-narration and /explore/walk-narration-audio)
 * bumped v20->v21: /walk-narration-audio's live-call branch can now feed the
 * narration LLM a JIT-enriched facts list, a real content-input change for
 * the same nominal key; /walk-narration's own literal moved in lockstep so
 * the two routes keep sharing one cache. v81 and v20 are retired.
 *
 * v12-v13: Evidence-floor fix — /explore/walk-narration now also runs
 * narration-time JIT A3 evidence resolution (previously audio-route only)
 * and both narration routes gained curated-before-Wikipedia evidence
 * ordering plus a deterministic pre-copy-gen evidence floor (see
 * runNarrationJitEvidence/resolveNarrationEvidence/evidenceFloorPasses in
 * routes/explore/index.ts). Shared narration cache-key literal bumped
 * v21->v22 in lockstep across both routes, a real content/gating-input
 * change for the same nominal key. v21 is retired.
 *
 * v13-v14: Wikidata → English Wikipedia fallback — /explore/place-detail now
 * resolves a Wikipedia article via a candidate's wikidata= entity's explicit
 * enwiki sitelink when wikipedia= is absent (fetchWikipediaSummaryForCandidate
 * in routes/explore/index.ts), so candidates that previously got no Wikipedia
 * enrichment in this prompt may now get real article content. detail cache-
 * key literal bumped v10->v11. v10 is retired. The discover route's
 * equivalent fallback (osm-anchor wikiMap prefetch) lives outside this
 * route's marked region and outside any manifest-tracked span, so it did not
 * require a version bump.
 *
 * v14-v15: Curated+Wikipedia narration bridge — for an osm candidate with
 * BOTH approved curated evidence and a usable wikipedia= tag, both narration
 * routes now attempt a bounded Wikipedia JIT lookup and, if a distinct unit
 * is retained, promote it to primaryStory and demote the discover-time
 * summary to supporting context (see attemptNarrationWikipediaBridge/
 * resolveNarrationEvidence/computeNarrationLeadAndSupport in
 * routes/explore/index.ts). Shared narration cache-key literal bumped
 * v22->v23 in lockstep across both routes, a real content/gating-input
 * change for the same nominal key. v22 is retired.
 *
 * v15-v16: Narration-lead priming rule — when a curated+Wikipedia bridge
 * primaryStory is present, both narration routes' system prompts now
 * include a conditional bullet (primaryStoryRule) instructing the writer to
 * build the narration around that one idea rather than enumerating it
 * alongside supporting facts as equal-weight items (observed at Film Center:
 * the lead idea was pushed to the end of a list behind architect/purpose
 * metadata). No evidence-acquisition, bridge-mechanics, or ranking change —
 * prompt text only. Shared narration cache-key literal bumped v23->v24 in
 * lockstep across both routes, a real prompt-content change for the same
 * nominal key. v23 is retired.
 *
 * v16-v17: Bounded one-call angle-generator experiment — for the curated+
 * Wikipedia narration bridge only, attemptNarrationWikipediaBridge now
 * replaces the one-sentence selectPrimaryUnit step with a single-call angle
 * generator (generateNarrationAngle/validateNarrationAngle) over bounded
 * sentence units, producing a centralQuestion/perspectiveShift/
 * sourceUnitIds angle that becomes primaryStory when it passes a mandatory
 * validator plus rejection-only relational guardrails. Single-tester live
 * experiment; ordinary no-curated Wikipedia JIT (selectPrimaryUnit) is
 * unchanged. Shared narration cache-key literal bumped v24->v25 in lockstep
 * across both routes, a real evidence-selection change for the same nominal
 * key. v24 is retired.
 *
 * v25-v26 (narration) / v14-v15 (deep-narration): Spatial-relation guard —
 * all three narration prompts (/walk-narration, /walk-narration-audio,
 * /deep-narration) previously offered unconstrained example openers using
 * "at the corner of," "across from," and "across the street from," with no
 * verified data backing those relationships (orientation.ts's computed
 * adjacency is discover-only and never reaches narration). Field failures:
 * Film Center Building narrated as "across the street from Hell's Kitchen"
 * (a neighborhood, not a point) and Saint Malachy's Church narrated as "at
 * the corner of 49th and 8th" (actual source data: "between Broadway and
 * Eighth Avenue," mid-block). Fix adds an identical SPATIAL-RELATION
 * CONSTRAINT bullet to all three prompts banning corner/across-from/next-to/
 * adjacent-to claims unless backed by verified anchor data, and removes the
 * three ungated example phrases ("Across from the park —", "Right at this
 * corner —", "corner of Fifth and Fifty-third") that licensed exactly this
 * failure mode. Neighborhood-membership ("in Hell's Kitchen") and
 * between/block framing ("between Broadway and Eighth Avenue") remain
 * available — they are not promoted to point relations. No change to
 * orientation.ts, geometry, discovery ranking, or evidence selection. Shared
 * narration cache-key literal bumped v25->v26 in lockstep across both
 * narration routes; deep-narration's own literal bumped v14->v15. v25 (short)
 * and v14 (deep) are retired.
 *
 * v26-v27 (narration): Angle validator subject-identity grounding exemption
 * — the one-call angle generator's proper-noun grounding check
 * (checkNarrationAngleGrounding/validateNarrationAngle in
 * routes/explore/index.ts) previously had no concept of the subject's own
 * trusted identity, so any angle that named the place itself (e.g. "Film
 * Center Building") was rejected as an ungrounded proper noun unless the
 * cited Wikipedia sentence units happened to restate that exact name — a
 * false rejection, not a real grounding gap, since the name is already
 * resolved/trusted via the request's own placeName. Fix adds
 * maskNarrationAngleSubjectIdentity, which masks out only an exact,
 * word-bounded occurrence of the complete canonical placeName (optional
 * leading "the", optional trailing possessive, case-insensitive; matches
 * the full name including any lowercase connector words already part of
 * it, e.g. "of"/"the" in a name like "Church of the Good Shepherd") before
 * the existing proper-noun token extraction runs — never a substring or
 * partial-name match, so a fragment of the subject's own name (e.g. "Roman
 * Catholic" out of "St. Malachy Roman Catholic Church") still requires
 * citation like any other proper noun, and every unrelated proper noun
 * (other landmarks, people, neighborhoods not supplied as anchor data)
 * remains fully subject to today's grounding rule. No alias system, fuzzy
 * matching, or substring authorization added. Deep-narration does not use
 * this validator and is unaffected. Shared narration cache-key literal
 * bumped v26->v27 in lockstep across both narration routes (walk-narration,
 * walk-narration-audio) to evict stale narrations cached under the old
 * false-rejection behavior; v26 (short) is retired. deep-narration's
 * literal is untouched.
 */

/**
 * Authoritative list of every (prefix, currentVersion) pair that is live.
 * On startup, any DB rows whose cache_key begins with a known prefix but
 * carries a version segment that matches none of the currentVersion(s) are
 * deleted so they can never be warmed back into memory.
 *
 * A prefix's currentVersion is normally a single string. Some prefixes
 * intentionally have more than one version live at once (e.g. "quick"/"full"
 * carry distinct versions for the legacy vs. osm-anchored discover code
 * paths in routes/explore/index.ts) — for those, pass an array of every
 * currently-live version so startup eviction preserves rows matching any of
 * them.
 */
export const LLM_CACHE_CURRENT_VERSIONS: ReadonlyArray<
  [prefix: string, currentVersion: string | ReadonlyArray<string>]
> = [
  ["quick", ["v63", "v82"]], // discover — quick mode (legacy v63, osm-anchor v82)
  ["full", ["v63", "v82"]], // discover — full mode (legacy v63, osm-anchor v82)
  ["suggest", "v12"], // location suggestions
  ["geocode", "v4"], // geocode
  ["revgeo", "v12"], // reverse geocode
  ["nbhd", "v2"], // neighbourhood label reverse-geocode (formerly named revgeo-nbhd, version 1)
  ["suggest404", "v5"], // address-not-found suggestions
  ["investigate", "v8"], // address investigation
  ["detail", "v11"], // place detail
  ["timeline", "v2"], // place timeline
  ["narration", "v27"], // walk narration (short)
  ["deep-narration", "v15"], // deep walk narration
  ["places-route", "v28"], // places along route
];

/**
 * OSM proximity cache version.
 * Must match the prefix used in osmSuggestionsBucketKey() in
 * routes/explore/index.ts.
 */
export const OSM_CACHE_VERSION = "v43";

/**
 * Flat record of all current cache versions keyed by namespace.
 * Used by /api/healthz to report the running cache state. Prefixes with
 * multiple simultaneously-live versions are joined with "|" since the
 * healthz response schema is Record<string, string>.
 */
export const CURRENT_CACHE_VERSIONS: Record<string, string> = {
  ...Object.fromEntries(
    LLM_CACHE_CURRENT_VERSIONS.map(([prefix, currentVersion]) => [
      prefix,
      Array.isArray(currentVersion) ? currentVersion.join("|") : currentVersion,
    ]),
  ),
  osm: OSM_CACHE_VERSION,
};
