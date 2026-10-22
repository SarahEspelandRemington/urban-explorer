/**
 * copyGenRequestBuilder.ts
 *
 * Pure, I/O-free extraction of the /explore/discover osm-anchor copy-
 * generation request construction from routes/explore/index.ts (Task M).
 *
 * Owns: system-prompt assembly (trust-tier + curated-rule interpolation),
 * per-candidate payload shaping, production request parameters (model,
 * token limit, response format), response parsing, and result-integrity
 * validation (re-exported from copyResultIntegrity.ts).
 *
 * Imports no env/config/logger/DB/HTTP-request/OpenAI-client code. Model
 * invocation, timeout/abort handling, retries, logging, and cache access
 * remain in the route. Production output bytes/semantics are preserved
 * exactly — see copyGenRequestBuilder.test.ts for fixture-based parity
 * proof against the pre-extraction inline construction.
 *
 * Whole-file prompt-manifest protection (see the self-tag version comment
 * below): this file now owns the production copy-gen system prompt and
 * candidate payload shaping that used to live inside routes/explore/
 * index.ts's own @prompt-region discover marked spans (formatForCopy, the
 * copy-gen chat-completion call construction, and the max-completion-tokens
 * constant). Those spans were removed from the route along with the code
 * they wrapped; this file's self-tag is what now gives this same content
 * prompt-manifest coverage, consistent with the protection that existed
 * before extraction.
 */
import { computeOsmTrustLevel, OSM_COPY_RULES } from "./osmTrustLevel";
import {
  getApprovedCuratedEntry,
  CURATED_COPY_RULES,
} from "./curatedLocalHistory";
import type { WikipediaSummary } from "./wikipediaEnrichment";
import { validateCopyResultIds } from "./copyResultIntegrity";

export { validateCopyResultIds };

// copy-gen-request-builder:v1:

export const WIKIPEDIA_GROUNDING_ENVELOPE_CHARS = 1_000;
export const COPY_GEN_MAX_COMPLETION_TOKENS = 3000;
export const COPY_GEN_MODEL = "gpt-4.1-mini";

export const HINT_TAGS = [
  "historic",
  "description",
  "heritage:description",
  "start_date",
  "wikidata",
  "wikipedia",
  "operator",
  "denomination",
  "alt_name",
  "architect",
  "building:material",
  "building:levels",
] as const;

export function buildOsmAddr(tags: Record<string, string>): string {
  const num = tags["addr:housenumber"] ?? "";
  const street = tags["addr:street"] ?? "";
  if (num && street) return `${num} ${street}`.trim();
  if (street) return street;
  return "";
}

export function sanitizeOSMText(raw: string, maxLen = 80): string {
  return raw
    .replace(/[\n\r\t]/g, " ")
    .replace(
      /[^\x20-\x7E\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/g,
      "",
    )
    .trim()
    .slice(0, maxLen);
}

export interface CopyGenCandidateInput {
  osmId: string;
  name: string;
  type: string;
  tags: Record<string, string>;
}

export function formatCandidateForCopyGen(
  p: CopyGenCandidateInput,
  wikiSummary?: WikipediaSummary | null,
  enhancedWikipediaContent?: string,
  isPrimaryUnit?: boolean,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: p.osmId,
    name: p.name,
    type: p.type,
    trustLevel: computeOsmTrustLevel(p.tags),
  };
  const addr = buildOsmAddr(p.tags);
  if (addr) obj.address = addr;
  for (const key of HINT_TAGS) {
    const val = p.tags[key];
    if (val) obj[key] = sanitizeOSMText(val, 120);
  }
  // Evidence-selector output (Option A, Walk Mode field test) takes
  // priority when present for this candidate — verbatim, selected
  // paragraphs rather than a blind truncation. Falls through to the
  // original first-1,000-char behavior otherwise, unchanged.
  if (enhancedWikipediaContent) {
    obj.wikipediaContent = enhancedWikipediaContent;
    if (isPrimaryUnit) obj.wikipediaUnitOnly = true;
  } else if (wikiSummary?.extract) {
    // Inject the first WIKIPEDIA_GROUNDING_ENVELOPE_CHARS chars of the
    // Wikipedia extract when available. The copy LLM uses this as factual
    // grounding (rule 11 in the system prompt). 1,000 chars is enough to
    // capture full named sections (e.g. "History and architecture") that
    // carry story-bearing content such as family history, notable events,
    // or contextual narrative — content the REST /page/summary/
    // lead-paragraph never included.
    obj.wikipediaContent = wikiSummary.extract.slice(
      0,
      WIKIPEDIA_GROUNDING_ENVELOPE_CHARS,
    );
  }
  // Curated local-history evidence, sibling to wikipediaContent — never
  // merged into it. Human-selected/vetted text, bypasses the A3 selector
  // entirely (rule 12 in the system prompt governs how the two fields
  // interact).
  const curatedEntry = getApprovedCuratedEntry(p.osmId);
  if (curatedEntry) {
    obj.curatedContent = curatedEntry.evidence.text;
    obj.curatedClaimScope = curatedEntry.evidence.claimScope;
    obj.curatedTrust = curatedEntry.evidence.curatedTrust;
  }
  return obj;
}

export type CopyResult = {
  id: string;
  summary: string;
  facts: string[];
  tags?: string[];
  yearBuilt?: string;
  confidence?: string;
};

export function buildCopyGenSystemPrompt(): string {
  const copyResponseShapeHint = `Respond in JSON: {"results":[{"id":"...","summary":"One sentence.","facts":["...","..."],"tags":["3-5 relevant tags"],"yearBuilt":"1920s or omit","confidence":"high|medium|low"}]}`;

  return `You are a hyper-local urban historian writing brief copy for real places sourced from OpenStreetMap.

MANDATORY RULES:
1. Return exactly the same number of results as candidates provided.
2. The "id" in each result MUST exactly match the "id" in the corresponding candidate. Do NOT change, reorder, add, or remove any place.
3. Do NOT modify the name, latitude, longitude, or address of any place.
4. Do NOT invent a place that was not in the candidates list.
5–8. COPY RULES — apply based on the "trustLevel" field on each candidate:

${OSM_COPY_RULES.osm_enriched}

${OSM_COPY_RULES.osm_standard}

${OSM_COPY_RULES.osm_bare}

Flag any claim not directly supported by the candidate's tags with "Reportedly" or "According to local accounts."
9. NEVER write raw GPS coordinates in any text field.
10. DISPLAY TAGS — the "tags" array must contain only short, human-readable descriptor phrases a general audience would understand (e.g. "historic mansion", "place of worship", "Victorian building", "art deco", "immigrant heritage"). NEVER put raw database identifiers, Wikidata IDs (e.g. Q4891444), Wikipedia slugs, OSM field names (wikidata, wikipedia, building:levels, denomination, operator), key:value pairs, or any technical metadata in tags. Tags are user-visible copy, not metadata echo.
11. WIKIPEDIA CONTENT — when a candidate includes a "wikipediaContent" field, use it as factual grounding for the summary and facts. Write from it directly: you may quote or paraphrase. Do not invent claims beyond what it states. Do not mention Wikipedia or the article by name in the copy — just write good historical prose informed by the content. Standalone attribution facts — "designed by architect X", "built in year Y", "listed on the National Register", "in a Beaux Arts style" — are NOT sufficient on their own for a discovery-worthy summary. Only use them to anchor a broader story: explain why the architect matters, what else they built, who commissioned the building and why, or what notable events occurred here. If the Wikipedia content contains only architectural metadata with no narrative context (no notable people, no events, no transformation over time), reflect that in a lower-confidence summary rather than dressing up dry facts as a compelling discovery.
11a. SINGLE-UNIT WIKIPEDIA CONTENT — when a candidate's "wikipediaContent" is accompanied by "wikipediaUnitOnly": true, that field contains exactly one complete, already-selected source unit, not an excerpt of a larger passage. Write the summary and facts using ONLY what that unit states. Do not import facts from outside it, add causes, motives, or consequences it doesn't state, or infer a relationship to other information about the place. Do not construct a narrative arc beyond what the unit itself supports. Facts may restate or lightly rephrase the unit, but must not introduce anything beyond it — an empty facts array is acceptable rather than padding with unrelated OSM tag data.
12. CURATED LOCAL-HISTORY CONTENT — when a candidate includes a "curatedContent" field, curatedContent contains human-vetted evidence whose permitted claim strength is governed by "curatedTrust" and limited to the scope declared in "curatedClaimScope", independently of the candidate's OSM "trustLevel". Apply the rule below matching the candidate's curatedTrust value:

${CURATED_COPY_RULES.high}
${CURATED_COPY_RULES.medium}
${CURATED_COPY_RULES.low}

This rule 12 permission is independent of, and takes precedence over, the trustLevel-based restrictions in rules 5-8 (including the osm_bare restriction against dates, founding claims, and former-use claims) for claims that fall inside curatedClaimScope specifically. Rules 5-8 continue to govern any claim NOT grounded in curatedContent, including for osm_bare candidates — they do not forbid the specific claims inside curatedClaimScope that curatedContent supports. Outside the declared curatedClaimScope, "wikipediaContent" (if present) may still supplement with additional grounded, non-conflicting context. If "wikipediaContent" directly conflicts with a claim inside curatedClaimScope, follow curatedContent and omit the conflicting Wikipedia detail entirely — do not blend the two versions, average them, or present both as equally valid. As with rule 11, do not mention "curated," "verified," Wikipedia, or any source by name — write unified historical prose.

${copyResponseShapeHint}`;
}

export interface CopyGenRequestParams {
  candidates: CopyGenCandidateInput[];
  wikiMap: Map<string, WikipediaSummary | null | undefined>;
  selectorEnhancedWikiContent: Map<string, string>;
  selectorSingleUnitOsmIds: Set<string>;
  locationHint: string;
}

export interface CopyGenChatRequest {
  model: string;
  max_completion_tokens: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: { type: "json_object" };
}

export function buildCopyGenRequest(
  params: CopyGenRequestParams,
): CopyGenChatRequest {
  const {
    candidates,
    wikiMap,
    selectorEnhancedWikiContent,
    selectorSingleUnitOsmIds,
    locationHint,
  } = params;
  return {
    model: COPY_GEN_MODEL,
    max_completion_tokens: COPY_GEN_MAX_COMPLETION_TOKENS,
    messages: [
      {
        role: "system",
        content: buildCopyGenSystemPrompt(),
      },
      {
        role: "user",
        content: `Write historical copy for these real nearby places from OpenStreetMap near ${locationHint}:\n${JSON.stringify(candidates.map((c) => formatCandidateForCopyGen(c, wikiMap.get(c.osmId), selectorEnhancedWikiContent.get(c.osmId), selectorSingleUnitOsmIds.has(c.osmId))))}`,
      },
    ],
    response_format: { type: "json_object" },
  };
}

export function parseCopyGenResponseContent(
  rawContent: string | undefined | null,
): CopyResult[] {
  if (!rawContent) return [];
  const copyData = JSON.parse(rawContent) as { results?: unknown[] };
  if (Array.isArray(copyData?.results)) {
    return copyData.results as CopyResult[];
  }
  return [];
}
