# Step 6D2 — Dated Replay Amendment (observation-surface correction)

**Amendment version**: 6D2-1
**Frozen at**: 2026-10-15 (same day as the original Step 6D execution, prior
to any replay call)
**Baseline preregistration commit unchanged**: `ac0af0f` (`STEP_6D_PREREGISTRATION.md`)
**Original (invalidated-surface) results, preserved unchanged**: `STEP_6D_RESULTS.md`,
`step6dResultLog.json`, `step6d-artifacts/*` — not edited by this amendment.

This is a corrective amendment addressing a genuine observation-surface gap
discovered after the original Step 6D execution, not a reinterpretation of
any frozen rule and not a response to any observed NRHP-relevant outcome.
The gap was found and reported via an explicit inspection-only task (Step
6D1) that made no discover calls, no classification calls, and no code
changes.

## 0. Reproducibility audit of the committed preregistration (`ac0af0f`)

The four frozen areas and their bounding boxes are committed, exact, and
unambiguous (`STEP_6D_PREREGISTRATION.md`, Section 2):

| Area                                  | Frozen bbox (`minLat, maxLat, minLon, maxLon`) | Centroid (midpoint formula) |
| ------------------------------------- | ---------------------------------------------- | --------------------------- |
| Fairmount/Spring Garden, Philadelphia | `39.955, 39.975, -75.185, -75.150`             | `39.965, -75.1675`          |
| Midtown Manhattan, NYC                | `40.7515, 40.7675, -74.003, -73.988`           | `40.7595, -73.9955`         |
| Bethlehem, PA                         | `40.615, 40.635, -75.395, -75.365`             | `40.625, -75.380`           |
| Jim Thorpe, PA                        | `40.865, 40.885, -75.745, -75.715`             | `40.875, -75.730`           |

Centroids are a deterministic midpoint of each committed bbox — reconstructed
and verified arithmetically identical to the centroids actually used in the
original Step 6D execution.

**Gap, reported precisely rather than silently resolved:** the preregistration
itself (`ac0af0f`) commits only the bboxes. It explicitly defers the exact
`/explore/discover` request parameters — radius, `mode`, `osmAnchor` — to
execution time ("Production call parameters, to be recorded at execution
(not run now)"). These three values are therefore **not present in the
git-committed preregistration text**. They exist only in the original Step
6D execution's own (uncommitted, but unedited and still-present on disk)
result artifacts: `STEP_6D_RESULTS.md` Section 2 and
`step6dResultLog.json`'s `discoverCalls[].requestBody`. This is not an
invented or reconstructed value — it is the literal, hashed, already-recorded
request body from the original run:

| Area                    | Radius requested | Radius applied (server max clamp) | `mode`   | `osmAnchor` |
| ----------------------- | ---------------- | --------------------------------- | -------- | ----------- |
| Fairmount/Spring Garden | 1000             | 1000                              | `"full"` | `true`      |
| Midtown Manhattan       | 1000             | 1000                              | `"full"` | `true`      |
| Bethlehem, PA           | 1000             | 1000                              | `"full"` | `true`      |
| Jim Thorpe, PA          | 1000             | 1000                              | `"full"` | `true`      |

**Conclusion: the four area requests are fully and deterministically
reproducible** — bbox/centroid from the committed preregistration directly;
radius/mode/osmAnchor from the original, unedited, already-hashed Step 6D
run artifacts. No value needed for exact replay is invented, guessed, or
ambiguous. This is not a blocking gap; it is a provenance distinction
(preregistration vs. execution-record) disclosed for completeness.

## 1. Cause

The original Step 6D discover calls omitted `walkMode: true`. Non-Walk
Explore responses pass through `filterExploreTier4`
(`artifacts/api-server/src/lib/productionFilter.ts:201-203`), which
unconditionally removes every `discoveryTier === 4` place before
serialization — a pre-existing, intentional product rule ("Tier-4
suppression remains Explore-only"; see
`artifacts/urban-explorer/docs/discovery-ranking-rubric.md` —
"Suppress from auto-surface"), confirmed at the exact call site in
`artifacts/api-server/src/routes/explore/index.ts:4727-4729`:

```ts
const anchorResponsePlaces = walkMode
  ? anchorGenericFiltered
  : filterExploreTier4(anchorGenericFiltered);
```

As a result, the original Step 6D experiment could not observe the Tier-4
(`placeholderFallback`/`metadataOnly`) population it was designed to
measure — that population was filtered out of the HTTP response before the
client (this experiment) ever saw it. This was discovered and confirmed
through code inspection only (Step 6D1), not through any new discover call.

## 2. Disposition of the original Step 6D results

The original artifacts (`STEP_6D_RESULTS.md`, `step6dResultLog.json`,
`step6d-artifacts/*`) are preserved exactly as produced and are **not
edited by this amendment**. Their characterization is corrected here, not in
place:

- Status: **observation-surface-invalid / not evaluable.**
- The original "0 Tier-4 candidates in all four areas" result was an
  artifact of using the non-Walk-Mode observation surface, which
  unconditionally strips Tier-4 places before serialization.
- It must **not** be cited as evidence that the underlying candidate pools
  contained zero thin candidates. Whether they did is unknown from the
  original run.
- It changes no NPS-relevant conclusion in either direction — the original
  run produced no usable signal on joinability or individual-NRHP share, not
  a disconfirming or confirming one.

## 3. Frozen-before-outcomes statement

The following were frozen in `STEP_6D_PREREGISTRATION.md` (commit `ac0af0f`)
**before** anyone observed any Walk-mode-surfaced candidate pool, corrected
or otherwise, and remain unchanged by this amendment:

- the four areas and their bboxes;
- the thin-candidate predicate;
- the joinability thresholds (`<20%` / `20–50%` / `>50%`);
- the individual-NRHP-share thresholds (`<5%` / `5–15%` / `>15%`);
- the interpretation table's decision mapping.

This amendment changes only the observation surface and the identifier-bridge
acquisition method (Section 4 below); it adds no new outcome-contingent
rule.

## 4. Exact replay changes (and nothing else)

Relative to the original, frozen Step 6D design, the replay changes exactly
two things:

1. **Observation surface**: identical discover calls (same bbox-derived
   centroid, same radius, same `mode: "full"`, same `osmAnchor: true`), with
   `walkMode: true` added to the request body. This causes
   `filterExploreTier4` to be skipped for this response
   (`index.ts:4727-4729`), so Tier-4 places remain present with
   `discoveryTier`, `discoveryRejectionReason`, `name`, `latitude`/
   `longitude`, `osmId`, and `osmTags` (the existing 12-key `HINT_TAGS`
   subset, unchanged, not widened).
2. **Identifier-bridge acquisition**: Bridge 2 (Wikidata QID → P649) is
   unchanged from the original preregistration's frozen lookup protocol.
   Bridge 1 (OSM `ref:nrhp`) is now acquired via a **read-only Overpass
   lookup keyed by the response's `osmId`** (Section 5 below), because
   `ref:nrhp` is confirmed absent from `HINT_TAGS` and from every other
   field in the production response contract, regardless of `walkMode`
   (`index.ts:4480-4484`, `4509-4510` — `HINT_TAGS` trimming runs
   unconditionally).

No other experimental rule — predicate, classes, precedence, metrics,
thresholds, interpretation table, probe gate — changes.

## 5. Frozen Overpass bridge procedure (read-only, experiments-only)

Predeclared exactly, to be followed verbatim if and when replay is
separately authorized:

- **Input**: the set of `osmId` values (format `"<type>/<numericId>"`, e.g.
  `way/265875648`, taken verbatim from stored `walkMode:true` discover
  responses — no other source of IDs.
- **Endpoint**: `https://overpass-api.de/api/interpreter` (fixed; matches the
  primary production Overpass instance already in use elsewhere in this
  repo's experiments — no alternate/mirror instance substitution).
- **Query shape**: one batched query per area, constructed as:
  ```
  [out:json][timeout:25];
  (
    node(id:<node ids...>);
    way(id:<way ids...>);
    relation(id:<relation ids...>);
  );
  out tags;
  ```
  Split by OSM element type (`node`/`way`/`relation`) as parsed from each
  `osmId`'s `<type>` prefix; `out tags;` requests tags only — no geometry,
  no recursion, no `out body`/`out geom`.
- **Batching**: one query per frozen area (four areas → four Overpass
  requests total, matching the original four discover calls 1:1) — not one
  query per element.
- **User-Agent**: a descriptive, identifying string (e.g.
  `Streetlit-Research/step6d2 (contact: <project contact>)`) — no generic or
  spoofed browser UA.
- **Rate limit**: maximum 1 request/second (trivially satisfied at 4 total
  requests).
- **Request cap**: 4 requests total (one per area) — no retries, no
  pagination, no repeat calls, mirroring the original discover-call
  discipline.
- **Raw response storage**: each area's raw Overpass JSON response saved
  verbatim, SHA-256-hashed, alongside the query timestamp (ISO 8601, UTC) at
  which the request was made.
- **No production server internals used and no production code modified** —
  Overpass is queried directly and independently, exactly as in prior
  Step-6-series experiments (e.g. Step 6B/6C NYC portability work).

## 6. OSM drift check (Overpass is a re-fetch, not a cache read)

Because the Overpass call happens after, and independently of, the stored
`walkMode:true` discover response, the two may disagree (OSM data can change
between the discover call and the Overpass re-fetch). For every re-fetched
element:

- Compare Overpass's returned `wikidata` tag value against the stored
  discover response's `osmTags.wikidata` value for the same `osmId`.
- **If they differ**: mark that element `stale/drifted`, report it
  explicitly, and **do not silently reconcile** — the element's bridge
  evidence for that run is flagged, not corrected or merged.
- The replay must be run close in time to the original discover calls to
  minimize (not eliminate) this drift window. "Close in time" is not
  separately quantified here; it is a qualitative execution discipline, not
  a numeric gate.

## 7. `ref:nrhp` handling (frozen, deterministic, no repair)

- Value must be digits only (regex equivalent: `^0*\d+$`).
- A leading zero is allowed (e.g. `"0012345"` is valid and is normalized by
  stripping leading zeros for comparison purposes only — the raw value is
  still stored unmodified).
- Any non-digit character anywhere in the value → classify as `ambiguous`.
- Multiple distinct `ref:nrhp` values on the same element (e.g. a
  semicolon-separated list) → classify as `ambiguous`.
- **No repair, no normalization beyond leading-zero stripping for
  comparison, and no inference from names, labels, infoboxes, or any other
  non-tag source.**

Bridge evidence is kept in three mutually exclusive buckets per element:

- **OSM-only**: valid `ref:nrhp` present, no valid Wikidata P649 resolved.
- **Wikidata-only**: valid Wikidata P649 resolved (per the original,
  unchanged preregistration's Wikidata lookup protocol), no valid OSM
  `ref:nrhp`.
- **Both**: both present and valid.

**OSM-vs-Wikidata conflict rule**: if both a valid OSM `ref:nrhp` and a valid
Wikidata P649 value are present but numerically disagree (after leading-zero
normalization) → classify as `ambiguous`, not reconciled, not averaged, not
preferentially trusted toward either source.

## 8. What remains frozen, unchanged from `STEP_6D_PREREGISTRATION.md` (`ac0af0f`)

- The four areas (bboxes as committed).
- No seeds are used anywhere in this design (none existed in the original
  preregistration either — noted for completeness, not a change).
- The thin-candidate predicate, verbatim.
- The six candidate classes and their precedence order, verbatim.
- The Wikidata lookup endpoint, batching, User-Agent, rate limit, request
  cap, redirect/merge handling, and rank/qualifier rules, verbatim.
- The joinability thresholds (`<20%` / `20–50%` / `>50%`).
- The individual-NRHP-share thresholds (`<5%` / `5–15%` / `>15%`).
- The interpretation table's decision mapping.
- The text-layer-probe gate (deferred, unchanged trigger condition).

## 9. Additional reporting requirements for the replay

Beyond the original Step 6D's 12 required metrics per area/overall, the
replay report must additionally include:

- Tier distribution (counts of Tier None/1/2/3/4) per area, computed from
  the `walkMode:true` response — not just the thin-predicate subset.
- The `filtered_for_quality` vs. `no_candidates` diagnostic
  (`computeEmptyReason`) for any area returning zero places, same as the
  original run's Jim Thorpe entry.
- An explicit statement that the measured frame is **"thin candidates among
  Walk-mode survivors,"** not all upstream OSM candidates — because
  `filterGenericCommercial` and the earlier pipeline filters (denylist,
  residential filter, commercial-use filter, radius filter,
  denied-places/interpretive-overlay filter) still apply unconditionally
  before serialization, regardless of `walkMode`. `walkMode:true` only
  bypasses `filterExploreTier4`; it does not bypass any other filter stage.

## 10. Execution status

**No execution has occurred under this amendment.** No discover call, no
Overpass call, no Wikidata call, no classification, and no NRHP PDF fetch
has been made. No production code has been modified. No `HINT_TAGS`
widening has occurred. This document is preparation only.
