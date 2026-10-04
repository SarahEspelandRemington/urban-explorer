/**
 * Exact/deterministic subtraction of admitted Wikipedia claim sentences from
 * raw Wikipedia content.
 *
 * Proof slice for the bounded-inspection findings in
 * experiments/wikipedia-claim-extraction-v0/ (Task F): a claim's
 * `supportingSpan` is the exact, untransformed source sentence, and none of
 * the live `wikipediaContent` paths (raw extract slice, A3 paragraph
 * selector, A3 primary-unit selector) reword or paraphrase text — they only
 * select/trim substrings of the same underlying article extract. That makes
 * exact string removal safe for a *complete* sentence, but not for a
 * truncated fragment (the pre-existing, out-of-scope sentence-splitter bug
 * that mis-splits on a mid-sentence abbreviation like "Stephen B." produces
 * exactly such fragments as a real `supportingSpan` value) — naively
 * removing a truncated fragment from text that does NOT share that same
 * truncation would leave a dangling orphaned remainder behind. This module
 * does not fix that splitter; it simply declines to touch any span that
 * doesn't look like a complete sentence.
 *
 * Deliberately NOT wired into any live route — offline/proof use only via
 * experiments/wikipedia-claim-extraction-v0/.
 */
import type { Claim } from "../../types";

const COMPLETE_SENTENCE_ENDING_RE = /[.!?]$/;

// A trailing single capital letter immediately before the final period
// ("...Stephen B.") is exactly the shape the shared sentence splitter's
// known, out-of-scope mid-abbreviation bug produces (it mis-reads a middle
// initial as a sentence end). That period is real, so the general
// complete-sentence check above cannot tell it apart from a true ending —
// this narrow, deterministic shape check is the only additional signal
// available without touching the splitter itself. Trade-off, accepted: a
// genuine sentence that happens to end in a bare single-letter token (e.g.
// "...rated Class A.") would also be skipped — a safe no-op, not a
// corruption, so it is the conservative side to err on.
const MIDDLE_INITIAL_TRUNCATION_RE = /\b[A-Z]\.$/;

/**
 * Removes each admitted claim's `supportingSpan` from `wikipediaContent`
 * when (and only when) it is both:
 *   - a complete sentence (trimmed text ends in `.`, `!`, or `?`), and
 *   - an exact, unmodified substring of `wikipediaContent`.
 *
 * Any span that fails either check is left untouched for that span — a safe
 * no-op, not an error. No fuzzy/semantic matching of any kind.
 *
 * If the same exact sentence string appears more than once in
 * `wikipediaContent`, ALL occurrences are removed (not just the first) —
 * since the sentence is already captured as a structured, admitted claim,
 * every verbatim occurrence of it in the raw text is equally redundant.
 * This is a deliberate, documented choice, not an oversight.
 *
 * Only the minimal whitespace irregularities directly caused by a removal
 * (a doubled space where a sentence used to sit between two others, or a
 * stray space left at the start of a line where a sentence opened a
 * paragraph) are cleaned up. No other rewriting, reordering, or
 * paraphrasing of surrounding content occurs.
 */
export function subtractAdmittedWikipediaSpans(
  wikipediaContent: string,
  admittedClaims: ReadonlyArray<Pick<Claim, "supportingSpan">>,
): string {
  let result = wikipediaContent;

  for (const claim of admittedClaims) {
    const span = claim.supportingSpan;
    if (!span) continue;
    const trimmed = span.trim();
    if (!COMPLETE_SENTENCE_ENDING_RE.test(trimmed)) continue; // skip truncated/fragment spans
    if (MIDDLE_INITIAL_TRUNCATION_RE.test(trimmed)) continue; // skip "...Stephen B."-shaped fragments
    if (!result.includes(span)) continue; // no-op: not an exact match

    result = result.split(span).join("");
  }

  return result
    .replace(/[ \t]{2,}/g, " ") // doubled space left where a mid-paragraph sentence was removed
    .replace(/\n[ \t]+/g, "\n") // stray leading space left where a paragraph-opening sentence was removed
    .replace(/[ \t]+\n/g, "\n") // stray trailing space left where a paragraph-closing sentence was removed
    .replace(/\n{3,}/g, "\n\n") // collapse any resulting run of blank lines
    .trim();
}
