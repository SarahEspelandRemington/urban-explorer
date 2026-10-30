// cache-versions:v26:
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
 *
 * v19-v21: Bergdoll selector fix — the discover-time evidence-selector
 * invocation (Walk Mode, up to the 3 closest Wikipedia-enriched candidates)
 * previously always ran selectPrimaryUnit to narrow selectEvidenceParagraphs's
 * whole, possibly multi-paragraph output down to a single sentence-level
 * unit before it reached copy generation, discarding adjacent sentences in
 * the same already-selected paragraph (found via a real case: Bergdoll-
 * Kemble Mansion's draft-dodger/1920-arrest sentences sat in the same
 * paragraph as the one sentence that survived, but were silently dropped).
 * Fix (RC ruling): still runs selectPrimaryUnit, but only to locate which
 * single Stage-1 paragraph contains the chosen sentence (via the new
 * exported locateSelectorParagraph in wikipediaEnrichment.ts) — never the
 * full multi-paragraph concatenation, and never crossing a paragraph
 * boundary. That one paragraph passes to copy generation whole if it is
 * within the new discover-time grounding envelope
 * (WIKIPEDIA_GROUNDING_ENVELOPE_CHARS, 1,000 chars — the same envelope the
 * ordinary non-selector Wikipedia truncation fallback now shares via that
 * one constant), or windowed down to that envelope via
 * buildContiguousEvidenceWindow (wikipediaEnrichment.ts) if it exceeds it.
 * No prompt text, selector criteria, candidate-window size, or ranking
 * changed; attemptNarrationWikipediaBridge's and runNarrationJitEvidence's
 * own independent selectPrimaryUnit calls are untouched. osm-anchor discover
 * cache-key literal bumped v82->v83->v84: v83 for the real content-length
 * change to the Wikipedia grounding reaching copy generation for a fixed
 * cache key; v84 for formatForCopy's fallback literal becoming a reference
 * to the new shared WIKIPEDIA_GROUNDING_ENVELOPE_CHARS constant inside the
 * same marked discover span (no behavior change, but the hash-guard is
 * span-text-based with no such exception). v82 and v83 are both retired.
 * This file's own self-tag bumped v19->v20->v21 in lockstep (prompt-manifest
 * bookkeeping only, not a cache-behavior change).
 *
 * v21-v22: Task M pure-module extraction — system-prompt assembly, per-
 * candidate payload shaping (formatForCopy -> formatCandidateForCopyGen),
 * request parameters, response parsing, and result-integrity validation were
 * mechanically relocated out of the @prompt-region discover marked span in
 * routes/explore/index.ts into a new pure module, lib/copyGenRequestBuilder.ts
 * (no prompt wording, payload shape, request parameters, or parsing/
 * validation logic changed; verified via fixture-based byte-equivalence
 * parity tests against the original inline logic). The marked span's text
 * itself changed (the relocated code is gone from the span, replaced by an
 * import + function call), so the span-text-based hash-guard requires a
 * bump despite no behavior change — same precedent as v83->v84 above.
 * osm-anchor discover cache-key literal bumped v84->v85. v84 is retired.
 * This file's own self-tag bumped v21->v22 in lockstep (prompt-manifest
 * bookkeeping only, not a cache-behavior change).
 *
 * v27-v28 (narration): Production break/fix — OpenAI deprecated
 * `gpt-4.1-nano` (every live writer call started returning HTTP 404
 * model_not_found). Both narration writer call sites
 * (/explore/walk-narration, /explore/walk-narration-audio) now use
 * `gpt-6-luna` instead — verified request/response-shape compatible
 * (plain chat.completions.create, same max_completion_tokens/messages
 * shape, same choices[0].message.content response shape) before switching.
 * No prompt, token-limit, schema, or selection/acceptance-logic change.
 * Shared narration cache-key literal bumped v27->v28 in lockstep across
 * both narration routes to evict stale narrations cached under the
 * retired model, so a consistent model generates all new narrations;
 * v27 (short) is retired. deep-narration and the discover-time evidence
 * selector/copy-gen models are untouched. This file's own self-tag
 * bumped v22->v23 in lockstep (prompt-manifest bookkeeping only).
 *
 * v28-v29 (narration): `gpt-6-luna` proved incompatible with the writer's
 * existing 256-token contract — it is a reasoning model whose hidden
 * reasoning tokens count against max_completion_tokens, and against the
 * real production system prompt it consistently spent all 256 tokens on
 * reasoning and returned empty content (confirmed 3/3 live attempts, then
 * reproduced 3/3 directly against OpenAI with the exact unabridged prompt
 * — finish_reason "length", reasoning_tokens: 256, content ""). Both
 * narration writer call sites now use `gpt-4.1-mini` instead — verified
 * non-reasoning (reasoning_tokens: 0) and producing non-empty content
 * comfortably within the existing 256-token budget against the exact real
 * prompt (3/3). No prompt, token-limit, schema, or selection/acceptance-
 * logic change. Shared narration cache-key literal bumped v28->v29 in
 * lockstep across both narration routes; v28 never had any successfully
 * cached entries (every call under it failed with empty content, so
 * nothing was ever written to the cache under that version), but the
 * version is still bumped because the marked prompt-region's content
 * changed — this file's prompt-manifest convention requires a new version
 * token for any such change, independent of whether the prior version was
 * ever actually cached. This file's own self-tag bumped v23->v24 in
 * lockstep (prompt-manifest bookkeeping only).
 *
 * v85-v86 (discover): First post-A-vs-B-experiment evidence-access
 * improvement. The Story-Centric vs. Fact-Centric experiment
 * (tools/prompt-eval/experiments/story-vs-fact) showed A-style synthesis
 * produces materially better discoveries with rich/full Wikipedia
 * evidence, and all six recorded A-winning story cores traced to full-
 * article content the production path could never have delivered, since it
 * windowed even a selector-approved paragraph down to a 1,000-char
 * fragment. Raised WIKIPEDIA_GROUNDING_ENVELOPE_CHARS 1,000->4,000, used by
 * (1) the selector path's own single-paragraph grounding window, which was
 * already confined to Walk Mode requests (inside the pre-existing
 * `if (walkMode && wikiMap.size > 0)` block), and (2) the non-selector
 * Wikipedia fallback truncation in copyGenRequestBuilder.ts for rank-4+
 * enriched candidates. (2) was corrected during review (2026-10-29) to also
 * be Walk-Mode-only: buildCopyGenRequest/formatCandidateForCopyGen are
 * invoked unconditionally for every osm-anchor discover request, so an
 * unqualified constant bump would have silently broadened the raised
 * envelope to non-Walk-Mode discover traffic too. formatCandidateForCopyGen
 * now takes an explicit wikipediaFallbackCap parameter defaulting to the
 * original, unchanged WIKIPEDIA_GROUNDING_ENVELOPE_CHARS_LEGACY = 1,000;
 * the route passes the raised WIKIPEDIA_GROUNDING_ENVELOPE_CHARS only when
 * walkMode is true. Non-Walk-Mode discover requests get byte-identical
 * fallback behavior to before this change. Also added a new, discover-only
 * DISCOVER_EVIDENCE_SELECTOR_OUTPUT_CAP = 8,000 (selectEvidenceParagraphs
 * now takes an optional outputCap parameter; narration call sites
 * (runNarrationJitEvidence, attemptNarrationWikipediaBridge) pass none and
 * keep using the original, unchanged EVIDENCE_SELECTOR_OUTPUT_CAP = 2,500 -
 * narration-time evidence selection is byte-identical to before this
 * change). EVIDENCE_SELECTOR_SYSTEM_PROMPT's own internal packing-budget
 * figure is now parameterized by the caller's outputCap for the same
 * reason (a selector told to target ~2,500 chars would keep self-limiting
 * regardless of a larger hard cap) - no evidence-value criterion,
 * selection-discipline rule, or output shape changed, only the numeric
 * budget. Both values empirically calibrated against the five frozen
 * validation subjects' real Wikipedia paragraphs (largest single paragraph
 * measured 2,867 chars across all five), so 4,000 chars delivers the
 * selector's chosen paragraph whole (zero windowing) for all five, while
 * 8,000 chars comfortably admits more than one substantial paragraph
 * without being an unbounded raw-extract passthrough. No selector call-
 * count change, no ranking/trust/grounding-rule change, no new LLM calls --
 * but Stage 1's packed-text OUTPUT (and therefore Stage 2's input) can grow
 * materially: measured against the five real validation subjects' actual
 * paragraph pools, an upper-bound "selector retains every candidate
 * paragraph" packing run grows from ~9,900 combined chars under the old
 * 2,500 cap to ~24,400 combined chars under the new 8,000 cap (roughly
 * 2,500 -> 6,100 tokens at ~4 chars/token) -- a real, bounded, non-zero
 * latency/cost increase concentrated in Stage 2's own call, not a new call.
 * See lib/copyGenRequestBuilder.ts's own v2->v3 self-tag changelog comment
 * and routes/explore/index.ts's wiki-evidence-selector v1->v2 self-tag for
 * the implementation-level detail. osm-anchor discover cache-key literal
 * bumped v85->v86 (real content-length change reaching copy generation for
 * a fixed cache key - same precedent as v82->v83 and v83->v84 above); v85
 * is retired. This file's own self-tag bumped v24->v25->v26 in lockstep
 * (prompt-manifest bookkeeping only, not a cache-behavior change). v26
 * (2026-10-29) is a documentation-only correction of the v85-v86 entry
 * above to reflect the Walk-Mode-scope fix and measured cost/latency
 * impact from the review pass described there — no runtime behavior
 * changed by this self-tag bump itself.
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
  ["quick", ["v63", "v86"]], // discover — quick mode (legacy v63, osm-anchor v86)
  ["full", ["v63", "v86"]], // discover — full mode (legacy v63, osm-anchor v86)
  ["suggest", "v12"], // location suggestions
  ["geocode", "v4"], // geocode
  ["revgeo", "v12"], // reverse geocode
  ["nbhd", "v2"], // neighbourhood label reverse-geocode (formerly named revgeo-nbhd, version 1)
  ["suggest404", "v5"], // address-not-found suggestions
  ["investigate", "v8"], // address investigation
  ["detail", "v11"], // place detail
  ["timeline", "v2"], // place timeline
  ["narration", "v29"], // walk narration (short)
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
