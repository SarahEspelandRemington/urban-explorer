/**
 * Deterministic discovery quality classifier for Walk Mode.
 *
 * Assigns a discovery tier (1–4) to each place based on surface signals in
 * the narrative text. Runs synchronously with zero external calls — O(n)
 * string/regex operations only.
 *
 * Tier definitions (Streetlit Discovery Acceptance Model v1):
 *   1 — Hidden story: transformation language + specific year/decade, or
 *       social-movement vocabulary (≥2 civic terms). Strongest narration.
 *   2 — Visible curiosity: named architectural style with explanatory context
 *       and year, or clear adaptive-reuse narrative without a full hidden past.
 *   3 — Contextual discovery: neighbourhood-growth or infrastructure-corridor
 *       context patterns. Valuable but not deeply historical.
 *   4 — Metadata only: current-function description, no historical depth,
 *       placeholder language. Suppressed from Walk Mode auto-narration.
 *   undefined — Not classified; current narration behaviour is preserved.
 *
 * Evaluation order: T1 → T2 → T3 → T4 → undefined
 *   Positive signals (T1/T2/T3) always take priority over Tier-4 suppression.
 *   A place that matches both a streetcar-suburb pattern (T3) and a business
 *   description (T4) is classified Tier 3, never suppressed.
 *
 * Design invariants:
 *   - False negative (missing a tier bonus) is always safer than false
 *     positive (suppressing a real discovery). When uncertain, return
 *     `undefined`.
 *   - Civic vocabulary explicitly cancels Tier-4 suppression: civic stories
 *     often omit explicit dates yet contain genuine historical content.
 *   - applyDiscoveryTier() runs on every response path (fresh + cached),
 *     so pre-change cache entries are classified on the way out.
 */

export type DiscoveryTier = 1 | 2 | 3 | 4;

export interface DiscoveryTierResult {
  /** 1–4 quality tier, or undefined when classifier is not confident. */
  tier: DiscoveryTier | undefined;
  /**
   * Human-readable rule label (e.g. "hiddenPast", "metadataOnly").
   * Always present; "unclassified" when tier is undefined.
   */
  reason: string;
  /**
   * Populated only when tier === 4. Short slug explaining the specific
   * Tier-4 rule that fired. Surfaced in the Walk Mode debug overlay so
   * field testing reveals exactly why a place was suppressed.
   */
  rejectionReason?: string;
}

// ── Regex constants ──────────────────────────────────────────────────────────

/** Explicit year references (1500–2029) or written decades. */
const YEAR_RE =
  /\b(1[5-9]\d{2}|20[0-2]\d)\b|\bthe (eighteen|nineteen|twenty)[- ]?(hundreds?|twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties|aughts?)\b|\b\d{4}s\b/i;

/**
 * Transformation language: strong signal that a place had a prior, different
 * identity — the core of a "hidden past" discovery.
 */
const TRANSFORMATION_RE =
  /\b(formerly|once served( as)?|originally( built| used| served| designed)?|was converted|repurposed( into| from| as)?|adapted from|used to be|had been( a| the| an)?|turned into|later became|previously (used|served|housed|occupied|operated)|historic(ally)? (used|served|housed)|former(ly)? (a |an |the )?[a-z])\b/i;

/**
 * Civic and social-movement vocabulary.
 * — Any match cancels the Tier-4 noHistoricalDepth rule (T4-C).
 * — Two or more matches trigger Tier-1 socialMovement (T1-B).
 *
 * Multi-word phrases are listed first to prevent double-counting
 * (e.g. "civil rights" should not also increment from "rights").
 */
const CIVIC_TERMS: readonly string[] = [
  "labor movement",
  "labour movement",
  "civil rights",
  "community organizing",
  "tenant rights",
  "mutual aid",
  "working-class",
  "working class",
  "settlement house",
  "neighborhood association",
  "neighbourhood association",
  "labour",
  "labor",
  "union",
  "strike",
  "strikers",
  "tenants",
  "activist",
  "activism",
  "immigration",
  "immigrant",
  "immigrants",
  "suffrage",
  "suffragist",
  "protest",
  "protesters",
  "cooperative",
  "co-op",
  "workers",
  "reform",
];

/** Named architectural styles that anchor a Tier-2 classification. */
const ARCH_STYLE_RE =
  /\b(art deco|beaux.?arts?|romanesque|modernist|brutalist|gothic( revival)?|italianate|federal style|prairie style|mission style|craftsman|victorian|colonial revival|greek revival|queen anne|tudor revival|georgian|neo.?classical|chicago school|international style|stripped classical|art nouveau)\b/i;

/** Explanatory context phrases combined with a style name → Tier 2. */
const ARCH_CONTEXT_RE =
  /\b(reflects|characteristic of|example of|influenced by|represents|emblematic of|typical of|reveals|demonstrates|illustrates|designed (in|to|for)|an example|rare example|fine example)\b/i;

/** Adaptive-reuse markers. */
const ADAPTIVE_REUSE_RE =
  /\b(converted|adaptive reuse|adaptively reused|repurposed into|transformed (into|from)|rehabilitation|rehabilitated)\b/i;

/** Named prior building types that confirm adaptive reuse is substantive. */
const PRIOR_USE_RE =
  /\b(warehouse|factory|mill|bank|church|chapel|school|hospital|hotel|stable|brewery|distillery|armory|armour|fire station|post office|rail(road|way) (depot|station)|power (plant|station)|slaughterhouse|bathhouse|theater|theatre)\b/i;

/** Neighbourhood-growth context patterns → Tier 3. */
const NEIGHBORHOOD_CONTEXT_RE =
  /\b(streetcar suburb|street car suburb|streetcar line|trolley (suburb|era)|commuter suburb|postwar (development|expansion|growth)|urban renewal|urban redevelopment|development pattern|grew to serve|established to serve|grew with the neigh?bou?rhood|platted|subdivided|rapid growth)\b/i;

/** Infrastructure-corridor context patterns + year → Tier 3. */
const INFRASTRUCTURE_CONTEXT_RE =
  /\b(grid plan|boulevard|transit corridor|rail(road|way) corridor|canal route|industrial corridor|port district|industrial district|manufacturing district)\b/i;

/**
 * Generic business/category lead sentence in the summary.
 * Tests the summary only, not the full corpus, because we are specifically
 * detecting a placeholder-style opening sentence.
 */
const T4_GENERIC_LEAD_RE =
  /^(this (is|was) an?|[a-z]{2,30} (is|was) an?|it (is|was) an?)\b.{0,80}(bank|school|office|church|restaurant|store|shop|pharmacy|hotel|hospital|clinic|gym|park|library|government|federal|municipal|business|company)\b/i;

/** Current-function verbs with a contemporary object (no historical framing). */
const T4_FUNCTION_RE =
  /\b(provides? (financial|banking|medical|educational|legal|government|retail|administrative)|offers? (financial|banking|retail|professional|legal|administrative)|serves (local|the|nearby|area|community) (students|residents|customers|clients|patients)|houses (offices|government|federal|municipal|administrative) (offices|services|agencies))\b/i;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify a single place's discovery tier from its narrative content.
 * Pure function — no side effects, no async, no external calls.
 *
 * Evaluation order: T1 → T2 → T3 → T4 → undefined
 * Positive-tier signals always take priority over Tier-4 suppression.
 */
export function classifyDiscoveryTier(place: {
  name?: string;
  summary?: string;
  facts?: string[];
  category?: string;
}): DiscoveryTierResult {
  const summaryRaw = place.summary ?? "";
  const facts = Array.isArray(place.facts) ? place.facts.join(" ") : "";
  const corpus = `${place.name ?? ""} ${summaryRaw} ${facts}`.toLowerCase();
  const summaryLower = summaryRaw.toLowerCase();

  const wordCount =
    corpus.trim() === "" ? 0 : corpus.trim().split(/\s+/).length;

  const hasYear = YEAR_RE.test(corpus);
  const hasTransformation = TRANSFORMATION_RE.test(corpus);

  // Count civic vocabulary matches.
  // Multi-word phrases listed first to avoid double-counting fragments.
  let civicCount = 0;
  for (const term of CIVIC_TERMS) {
    if (corpus.includes(term)) civicCount++;
  }
  const hasCivic = civicCount >= 1;

  // ── Tier 1 checks ─────────────────────────────────────────────────────────
  // Evaluated first: if ANY Tier-1 signal is found, the place is never
  // suppressed regardless of how generic the rest of the text is.

  // T1-A: Transformation language + specific year/decade → hidden past story.
  if (hasTransformation && hasYear) {
    return { tier: 1, reason: "hiddenPast" };
  }

  // T1-B: Two or more civic vocabulary terms → social movement story.
  if (civicCount >= 2) {
    return { tier: 1, reason: "socialMovement" };
  }

  // ── Tier 2 checks ─────────────────────────────────────────────────────────

  // T2-A: Named architectural style + year + explanatory framing.
  if (ARCH_STYLE_RE.test(corpus) && hasYear && ARCH_CONTEXT_RE.test(corpus)) {
    return { tier: 2, reason: "architecturalDetail" };
  }

  // T2-B: Adaptive reuse with a named prior building type (no full
  // transformation+year required — the prior-use match alone is sufficient).
  if (ADAPTIVE_REUSE_RE.test(corpus) && PRIOR_USE_RE.test(corpus)) {
    return { tier: 2, reason: "adaptiveReuse" };
  }

  // ── Tier 3 checks ─────────────────────────────────────────────────────────

  // T3-A: Neighbourhood-growth / streetcar-suburb context patterns.
  if (NEIGHBORHOOD_CONTEXT_RE.test(corpus)) {
    return { tier: 3, reason: "neighborhoodContext" };
  }

  // T3-B: Infrastructure / corridor context + year.
  if (INFRASTRUCTURE_CONTEXT_RE.test(corpus) && hasYear) {
    return { tier: 3, reason: "infrastructureContext" };
  }

  // ── Tier 4 checks ─────────────────────────────────────────────────────────
  // Only reached when no T1/T2/T3 positive signal was found.
  // Conservative: only fire when confident all signals point to low quality.

  // T4-A: Short corpus with no historical anchor of any kind.
  if (wordCount <= 60 && !hasYear && !hasTransformation && !hasCivic) {
    return {
      tier: 4,
      reason: "classifiedTier4",
      rejectionReason: "metadataOnly",
    };
  }

  // T4-B: Summary opens with a generic business/category statement and the
  // full corpus has no historical depth. The summary is checked specifically
  // (not the full corpus) to catch placeholder opening sentences embedded in
  // otherwise longer descriptions.
  if (
    (T4_GENERIC_LEAD_RE.test(summaryLower) ||
      T4_FUNCTION_RE.test(summaryLower)) &&
    !hasYear &&
    !hasTransformation &&
    !hasCivic
  ) {
    return {
      tier: 4,
      reason: "classifiedTier4",
      rejectionReason: "genericBusinessDescription",
    };
  }

  // T4-C: Longer text that still has no historical depth.
  // Civic vocabulary explicitly cancels this check because civic stories
  // often express genuine historical content without explicit year references.
  if (wordCount >= 40 && !hasYear && !hasTransformation && !hasCivic) {
    return {
      tier: 4,
      reason: "classifiedTier4",
      rejectionReason: "noHistoricalDepth",
    };
  }

  // No confident classification — preserve current narration behaviour.
  return { tier: undefined, reason: "unclassified" };
}

/**
 * Apply discovery tier classification to an array of places in-place.
 * Sets `place.discoveryTier` and (for Tier 4) `place.discoveryRejectionReason`.
 *
 * Designed to run on EVERY response path — fresh LLM generation AND every
 * cache hit — so that pre-change cached entries are classified on the way
 * out and Tier-4 suppression takes effect immediately without a cache bump.
 */
export function applyDiscoveryTier(places: any[]): void {
  for (const p of places) {
    const result = classifyDiscoveryTier(p);
    if (result.tier !== undefined) {
      p.discoveryTier = result.tier;
    } else {
      delete p.discoveryTier;
    }
    if (result.tier === 4 && result.rejectionReason) {
      p.discoveryRejectionReason = result.rejectionReason;
    } else {
      delete p.discoveryRejectionReason;
    }
  }
}
