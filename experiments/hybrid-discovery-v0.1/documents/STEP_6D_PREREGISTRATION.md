# Step 6D Preregistration — NRHP Identifier-Bridge Ceiling Test

**Status:** Preregistration only. No production discover calls have been
made. No candidate has been classified. No NRHP PDF has been fetched. This
document freezes the question, areas, predicate, bridge mechanisms, lookup
protocol, candidate classes, metrics, and decision thresholds before any
execution.

**Relationship to Step 6D0:** Step 6D0 (inspection-only) established that (1)
the thin-candidate predicate is exactly expressible from the existing
production response schema with no proxy; (2) OSM `ref:nrhp` exists in raw
internal data but is excluded from the externally-surfaced `osmTags` field;
(3) Wikidata property **P649** ("NRHP reference number") is the correct,
verified property; (4) NPGallery's Advanced Search form has no address query
field — address-based NPS lookup does not exist as a deterministic official
mechanism. This preregistration builds directly on those findings and does
not re-open them.

---

## 1. Purpose and evidentiary limit

Frozen question:

> Among mechanically thin Walk candidates in frozen walked-area frames, how
> many can Streetlit deterministically connect to NRHP through currently
> available OSM/Wikidata identity bridges, and what does that imply for
> whether an individual-NRHP adapter is worth building first?

This is an **identifier-bridge ceiling test**, not an NRHP-prevalence
estimate. It measures what the _existing_ OSM/Wikidata tagging ecosystem
already makes reachable without new acquisition machinery — it does not
estimate how many thin candidates are _actually_ NRHP-listed in the real
world (tagging coverage is known to be incomplete; see Section 8's
lower-bound statement).

---

## 2. Frozen areas and bounding boxes

Bounding boxes below are frozen now, before any production call, from
general named-place geography (cross streets / known historic-district
boundaries), consistent with this pilot's established practice of freezing
corridors by named boundaries rather than by ad hoc geocoding at execution
time.

| Area                                        | Bounding box (`minLat`, `maxLat`, `minLon`, `maxLon`) | Note                                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fairmount / Spring Garden, Philadelphia, PA | `39.955, 39.975, -75.185, -75.150`                    | Girard Ave (north) to Spring Garden St/Vine St corridor (south), Fairmount Park/Art Museum (west) to ~Broad St (east)                                               |
| Midtown Manhattan, New York City            | `40.7515, 40.7675, -74.003, -73.988`                  | W38th–W53rd / 8th–10th Ave corridor, reusing the exact bbox already frozen for the Step-6-series NYC LPC Phase 1 proof, for continuity with prior portability work. |
| Bethlehem, PA                               | `40.615, 40.635, -75.395, -75.365`                    | Historic downtown / Moravian Bethlehem district area                                                                                                                |
| Jim Thorpe, PA                              | `40.865, 40.885, -75.745, -75.715`                    | Historic downtown (former Mauch Chunk)                                                                                                                              |

**Production call parameters, to be recorded at execution (not run now):**
for each area, exactly **one** `/explore/discover` call, with: production
commit SHA at call time, exact request parameters (bbox, any other query
params used), the raw JSON response saved verbatim, and a SHA-256 hash of
the raw response. Four calls total across the whole study (one per area) —
no retries, no pagination, no repeat calls.

---

## 3. Thin-candidate predicate (frozen)

```ts
discoveryTier === 4 &&
  (discoveryRejectionReason === "placeholderFallback" ||
    discoveryRejectionReason === "metadataOnly");
```

Applied as-is to each area's saved raw response. No other field combination
is used to define "thin." Confirmed in Step 6D0 to require no proxy.

---

## 4. Allowed identity bridges (fixed order, no others)

1. **Raw internal OSM `ref:nrhp`** — read directly from the raw Overpass
   element tags already captured in the production response's underlying
   data (not the externally-surfaced `osmTags` field, which excludes it per
   Step 6D0 finding #2). Reading this field does **not** constitute widening
   `HINT_TAGS` — it is read once, offline, from the already-fetched raw tag
   dictionary, for this experiment's own classification only; no production
   code path is touched.
2. **Wikidata QID → P649** — only attempted via the candidate's `wikidata`
   OSM tag value (already surfaced in the production `osmTags` field via the
   existing `HINT_TAGS` allowlist). Looked up via the separate
   experiments-only script described in Section 5.

**Explicitly disallowed, for this study, under all circumstances:**

- NPGallery name search
- NPGallery address search
- Wikipedia infobox reading
- fuzzy/approximate string matching of any kind
- general web search

---

## 5. Wikidata lookup protocol (experiments-only script)

Frozen before any lookup is run:

- **Primary endpoint:** official MediaWiki Action API `wbgetentities`,
  `https://www.wikidata.org/w/api.php?action=wbgetentities&ids={QID1}|{QID2}|...&format=json&props=claims|sitelinks`
  — supports batched QID requests (MediaWiki's standard multi-ID limit for
  this action applies; batches are capped at **50 QIDs per request**).
- **Fallback/verification endpoint:** `https://www.wikidata.org/wiki/Special:EntityData/{QID}.json`
  (single-entity form, already used and verified live in Step 6D0) — used
  only if a batch response for a given QID is unparseable, not as a routine
  path.
- **User-Agent:** `Streetlit-pilot-research/1.0 (offline experiment)` —
  same descriptive string already used without incident in Step 6D0.
- **Rate limit:** 1 request/second maximum, enforced by the script.
- **Request cap:** **20 requests total** for the Wikidata lookup stage
  across all four areas combined (at 50 QIDs/request this covers up to
  1,000 distinct QIDs, far more than any single walked-area frame is
  expected to produce). If the cap would be exceeded, lookup stops for the
  remaining un-checked QIDs; those candidates are recorded as
  `bridge-check-incomplete` in the diagnostic log and are **not** merged
  into `no-bridge` (which means "no identity anchor existed to check," a
  different condition from "checking was capped out").
- **Raw-response storage + hash:** every raw JSON response (batch or
  fallback) is saved to a file under
  `experiments/hybrid-discovery-v0.1/documents/` and SHA-256 hashed,
  identically to the production discover response handling in Section 2.
- **Merged/redirected QID handling:** `wbgetentities` resolves redirects
  server-side; if a response's `redirects` field shows a requested QID was
  merged into a different entity, the resolved target QID and the fact of
  the redirect are both recorded — the merge target's data is used, nothing
  is treated as missing solely because of a redirect.
- **Missing-entity handling:** a response entry with `"missing": ""` (QID
  deleted/never existed) is recorded as missing and is treated, for
  classification purposes, identically to "no current P649 claim found" —
  it does not count as `ambiguous` or any bridged class.

**Current-claim filtering (applies to every P649 claim read):**

A P649 claim counts as a _current_ NRHP listing only if:

- its `rank` is not `"deprecated"`, **and**
- it carries no end-time-type qualifier (e.g. `P582`) indicating the
  listing is no longer current.

A claim failing either condition is excluded before any comparison or
classification step — it is treated as if the claim were absent.

---

## 6. OSM / Wikidata conflict rule

If a candidate has **both** a raw OSM `ref:nrhp` value and at least one
current Wikidata P649 claim (Section 5), normalize both to digits-only
(stripping leading zeros/whitespace) and compare:

- **Match** → proceed to class determination using either value (they agree).
- **Mismatch** → class = `ambiguous`, regardless of what resource-type
  information is otherwise available. This rule takes precedence over all
  other class assignments.

---

## 7. Candidate classes (exact precedence, applied top-down, first match wins)

1. **`ambiguous`** — OSM `ref:nrhp` and current Wikidata P649 are both
   present and disagree after normalization (Section 6).
2. **`individual-listing-bridged`** — a current, non-conflicting NRHP bridge
   resolves (via `ref:nrhp` and/or current P649), **and** the resolving
   source explicitly and by name states the resource type as an individual
   listing (e.g. an explicit Wikidata statement or explicit OSM tag value —
   never inferred from description text, images, or category membership).
3. **`district-associated-bridged`** — same as above, but the source
   explicitly states the resource type as a district / contributing
   property. Never inferred from geography or proximity to other listed
   resources.
4. **`unlabeled-bridged`** — a current, non-conflicting NRHP bridge resolves,
   but no explicit resource-type statement is found on the resolving source.
5. **`checked-no-NRHP-claim`** — the candidate carries a `wikidata` QID, the
   entity was successfully fetched, and it has no current P649 claim
   (Section 5's filtering applied), and no OSM `ref:nrhp` is present either.
   A genuine negative result from an executed check.
6. **`no-bridge`** — the candidate carries neither an OSM `ref:nrhp` tag nor
   a `wikidata` tag at all. No identity anchor exists to check in the first
   place; distinct from class 5.

---

## 8. Required metrics (per area, and overall)

1. thin-candidate count
2. bridgeable count (classes 2–4 and `ambiguous`, i.e. everything except
   `checked-no-NRHP-claim` and `no-bridge`)
3. joinability = bridgeable / thin
4. observed individual-NRHP share among **all** thin candidates
   (`individual-listing-bridged` / thin-candidate count)
5. observed individual-NRHP share among **bridgeable** candidates
   (`individual-listing-bridged` / bridgeable count)
6. class split (count + % for all six classes)
7. join-method split among bridged classes: OSM only / Wikidata only / both
   (an `ambiguous` candidate is always "both," by definition of Section 6)
8. Wikipedia baseline A/B/C/D/U for every `individual-listing-bridged`
   candidate (reusing this pilot's existing Wikipedia-baseline taxonomy;
   no new baseline category is introduced)
9. share of `individual-listing-bridged` candidates that are baseline C
10. share of **all** OSM candidates (not just thin ones) carrying
    `ref:nrhp`
11. share of **thin** OSM candidates carrying `ref:nrhp`

**Explicitly stated, verbatim, regardless of outcome:**

> Observed NRHP share among all thin candidates is a lower bound, because
> bridge coverage (OSM `ref:nrhp` tagging completeness and Wikidata `wikidata`
> tagging + P649 claim completeness) is incomplete. A candidate in
> `no-bridge` or `checked-no-NRHP-claim` may still be NRHP-listed in reality;
> this study cannot establish that, only what is deterministically reachable
> today.

---

## 9. Interpretation table (exact thresholds, frozen)

**Joinability thresholds:**

- **High joinability:** `> 50%`
- **Middle joinability:** `20%–50%` (inclusive of both bounds)
- **Low joinability:** `< 20%`

**Individual-NRHP share thresholds** (applied to the bridgeable-candidate
share, metric 5) — this is a distinct scale from joinability, not the same
cut points:

- **Low share:** `< 5%`
- **Mid share:** `5%–15%` (inclusive of both bounds)
- **High share:** `> 15%`

**Decision mapping:**

- **High joinability (`>50%`) + low individual share (`<5%`)** → meaningful
  no-go on building an individual-NRHP adapter first.
- **High joinability (`>50%`) + mid or high individual share (`≥5%`)** →
  proceed (individual-NRHP adapter justified).
- **Low joinability (`<20%`)** → inconclusive about NRHP prevalence, because
  identifier linkage is insufficient. Interpreted as an identity-linkage
  limitation (today's OSM/Wikidata tagging doesn't reach far enough to
  measure this), **not** a no-go on the NRHP source family itself.
- **Middle joinability (`20%–50%`)** → report class split and shares without
  a go/no-go decision based on share alone. Additionally report
  **redundancy**: if most `individual-listing-bridged` candidates are
  Wikipedia baseline C, this indicates NPS access is likely reaching places
  that are already well-documented elsewhere, implying lower marginal
  product gain from building the adapter even where joinability/share look
  favorable.

---

## 10. Text-layer probe gate (deferred — not run in this task)

Runs **only if** Step 6D clears the frozen proceed condition in Section 9.

If triggered in a later task:

- a seeded subset of **at most 8** `individual-listing-bridged` candidates
- **one GET per document**
- a frozen request cap (= the subset size: at most 8 requests)
- a frozen document-size cap (to be set at execution time, before any
  fetch, consistent with this pilot's existing PDF-acquisition caps)
- 1 request/second maximum
- extraction via `pdftotext -layout` only
- record: content type, byte size, page count, character count
- **do not read prose** — character/page counts only, no narrative content
  inspection

**Scan-only gate:** if `≥ 50%` of the probed subset is scan-only (no usable
text layer), classify the overall result as **`acquisition-dominated`** and
do not interpret any downstream product-gain threshold from Section 9 — an
acquisition-cost problem (OCR/scanning) would dominate any prevalence or
redundancy finding at that point.

---

## 11. Request/rate limits summary

- Production discover: **4 requests total** (one per area), official
  production API only.
- Wikidata: **20 requests total** (Section 5), 1 req/sec, official
  `wikidata.org` endpoints only, descriptive User-Agent.
- Text-layer probe (deferred, not part of this task): at most 8 requests,
  1 req/sec, gated behind Section 9's proceed condition.
- No NPGallery requests of any kind in this study (Section 4 disallows
  name/address search as acquisition mechanisms; no other NPGallery need is
  in scope here, unlike Step 6D0's reconnaissance-only AdvancedSearch check).
- No general web search as an acquisition or verification mechanism at any
  point.

---

## 12. Out of scope

Do not, at any point in this study:

- make any production code change, including widening `HINT_TAGS`;
- implement adapter code;
- read NRHP PDF narrative/prose content;
- run OCR;
- extract claims;
- infer district-contributing status from geography or proximity;
- use NPGallery name or address search;
- use fuzzy/approximate matching;
- commit or push.

---

## 13. Hypothesis guardrail

Explicitly recorded, to be restated verbatim in any future execution
report regardless of outcome:

> This is a ceiling test of identifier-bridge reachability using today's
> OSM/Wikidata tagging, not a measurement of true NRHP prevalence among thin
> candidates. A low result reflects a linkage/tagging-coverage limitation
> and must not be read as evidence that few thin candidates are actually
> NRHP-listed.

---

## 14. Execution notes (binding on the future execution task, not acted on now)

- Do not alter any rule in this document mid-run once execution begins.
- Do not run any production discover call, Wikidata lookup, or text-layer
  probe under this preregistration until a separate execution task
  explicitly authorizes it.
- Log any new-rule type that execution would have needed, diagnostically
  only, without adding the rule — consistent with this pilot's established
  logging discipline (Step 6B/6C).
