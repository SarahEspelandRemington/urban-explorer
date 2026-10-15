# Step 6D — NPS Identifier-Bridge Ceiling Test — Results

Preregistration: `STEP_6D_PREREGISTRATION.md` (committed `ac0af0f`, unchanged throughout execution).

## 0. Preconditions (confirmed before any execution)

- HEAD was exactly `ac0af0f` at the start of execution.
- Tracked working tree was clean (no staged/unstaged diffs on any tracked file).
- `git diff HEAD -- experiments/hybrid-discovery-v0.1/documents/STEP_6D_PREREGISTRATION.md` was empty — the preregistration had no diff from HEAD.
- Only previously-known, unrelated untracked artifacts were present (`brand/`, `docs/`, prior Step 6A/6B experiment files) — no new discover/classification artifacts existed yet.

All four preconditions passed. Execution proceeded.

## 1. Production / runtime identity

- Render service `srv-d95t19rtqb8s73f926s0`, confirmed live deploy via `render deploys list`.
- Live deployed commit: `f467483c76d4714fd8d0d8d3924a521a81ac7330` (deploy `dep-db425gmq1p3s73eo7ctg`, status `live`).
- Production base URL: `https://urban-explorer-ihsy.onrender.com`.

## 2. Request-parameter adaptation (disclosed, not a frozen-rule violation)

The preregistration framed frozen areas as bounding boxes. The real `/explore/discover` contract (`DiscoverPlacesBody`) is a **point + radius** API, not a bbox-query API, and the server hard-clamps `radius` to a maximum of 1000m regardless of the requested value (`Math.max(50, Math.min(1000, requestedRadius))`).

Adaptation used for all four calls (centroid of the frozen bbox, server's maximum radius, `osmAnchor: true` per preregistration Bridge-1 reasoning, `mode: "full"`):

| Area                                  | Centroid (lat, lon) | Radius requested | Radius applied (server clamp) |
| ------------------------------------- | ------------------- | ---------------- | ----------------------------- |
| Fairmount/Spring Garden, Philadelphia | 39.965, -75.1675    | 1000             | 1000                          |
| Midtown Manhattan, NYC                | 40.7595, -73.9955   | 1000             | 1000                          |
| Bethlehem, PA                         | 40.625, -75.380     | 1000             | 1000                          |
| Jim Thorpe, PA                        | 40.875, -75.730     | 1000             | 1000                          |

This is a transparent adaptation of request mechanics only — it does not change the frozen thin-candidate predicate, the frozen bridge order, or the frozen classification precedence.

## 3. Exact four discover calls

All four: `POST https://urban-explorer-ihsy.onrender.com/api/explore/discover`, body `{"latitude": <centroid lat>, "longitude": <centroid lon>, "radius": 1000, "mode": "full", "osmAnchor": true}`.

| Area                    | HTTP status | Response bytes | SHA-256                                                            | Raw file                                   |
| ----------------------- | ----------- | -------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Fairmount/Spring Garden | 200         | 19059          | `1a2b8b6072c5a1291913248f5094740e3998ab9b72d151f5bd82701f93c96e4a` | `step6d-artifacts/discover_fairmount.json` |
| Midtown Manhattan       | 200         | 8305           | `6bee92520ad6695bd82c784e57167dd3d216d83a5698c8a669dc75746a58f248` | `step6d-artifacts/discover_midtown.json`   |
| Bethlehem, PA           | 200         | 3899           | `374a0070956d1357ceeb689967b145feab8924b5d1e02614934a10bb441d3028` | `step6d-artifacts/discover_bethlehem.json` |
| Jim Thorpe, PA          | 200         | 218            | `a26870a29cdf5cc14b4e4ece72367447d3d4d276c618b867c522f80331b9b93d` | `step6d-artifacts/discover_jimthorpe.json` |

Exactly one call per area, per preregistration Section 13 ("exactly one production discover call per frozen area").

## 4. Headline finding: zero thin candidates in all four areas

Applying the frozen thin predicate exactly —

```ts
discoveryTier === 4 &&
  (discoveryRejectionReason === "placeholderFallback" ||
    discoveryRejectionReason === "metadataOnly");
```

— against all 34 places returned across the three non-empty areas (Jim Thorpe returned zero places, `emptyReason: "filtered_for_quality"`):

**Zero places, in any area, classified as Tier 4.** No place in the entire execution carries a `discoveryRejectionReason` field at all (confirmed: `applyDiscoveryTier` only sets that field when `result.tier === 4`, and deletes/omits it otherwise — consistent with its total absence here).

Observed tier distribution across the 34 returned places:

| Area                    | Places returned | Tier `None` (omitted) | Tier 1 | Tier 4 (thin) |
| ----------------------- | --------------- | --------------------- | ------ | ------------- |
| Fairmount/Spring Garden | 20              | 14                    | 6      | 0             |
| Midtown Manhattan       | 10              | 8                     | 2      | 0             |
| Bethlehem, PA           | 4               | 3                     | 1      | 0             |
| Jim Thorpe, PA          | 0               | —                     | —      | 0             |
| **Total**               | **34**          | **25**                | **9**  | **0**         |

This is a genuine, surprising empirical result, not an error: per the preregistration's "exactly one production discover call per frozen area" and "do not alter rules mid-run" constraints, no retry, radius change, or predicate change was made upon seeing this. The thin-candidate pool this ceiling test was designed to bridge is **empty** for these four areas at this production commit, under `osmAnchor` mode, at max radius.

## 5. Per-area required metrics (12 items each)

Because thin-candidate count = 0 in every area, all ratio metrics are **mathematically undefined (0/0)**, not low/zero-valued percentages. They are reported as "undefined (0/0)" rather than forced into a bucket.

| Metric                                                            | Fairmount                                     | Midtown         | Bethlehem       | Jim Thorpe      |
| ----------------------------------------------------------------- | --------------------------------------------- | --------------- | --------------- | --------------- |
| 1. Total discover candidates                                      | 20                                            | 10              | 4               | 0               |
| 2. Thin-candidate count                                           | 0                                             | 0               | 0               | 0               |
| 3. Bridgeable count                                               | 0                                             | 0               | 0               | 0               |
| 4. Joinability (bridgeable / thin)                                | undefined (0/0)                               | undefined (0/0) | undefined (0/0) | undefined (0/0) |
| 5. Individual-NRHP share among all thin                           | undefined (0/0)                               | undefined (0/0) | undefined (0/0) | undefined (0/0) |
| 6. Individual-NRHP share among bridgeable thin                    | undefined (0/0)                               | undefined (0/0) | undefined (0/0) | undefined (0/0) |
| 7. Class split                                                    | N/A — no thin candidates to classify          | N/A             | N/A             | N/A             |
| 8. Join-method split (OSM only / Wikidata only / both)            | N/A                                           | N/A             | N/A             | N/A             |
| 9. Wikipedia baseline (A/B/C/D/U) for bridged individual listings | N/A — zero bridged individual listings        | N/A             | N/A             | N/A             |
| 10. Share of bridged individual listings that are baseline C      | N/A                                           | N/A             | N/A             | N/A             |
| 11. Share of all OSM candidates carrying `ref:nrhp`               | not observable (see Section 7, Gap 1)         | not observable  | not observable  | not observable  |
| 12. Share of thin OSM candidates carrying `ref:nrhp`              | N/A (zero thin) and not observable regardless | N/A             | N/A             | N/A             |

Per preregistration requirement: metric 5 (individual-NRHP share among all thin) is a **lower bound**, because candidates outside the frozen radius/quality-filter funnel are never observed. This caveat is stated even though the realized value is the degenerate 0/0 case.

Supplementary, non-frozen diagnostic (raw OSM candidate funnel, included as context beyond the required metric set): `osmCandidateCount` at r150/r300/r500 vs. final emitted `places.length`:

| Area       | r150 | r300 | r500 | emitted places             |
| ---------- | ---- | ---- | ---- | -------------------------- |
| Fairmount  | 7    | 21   | 56   | 20                         |
| Midtown    | 8    | 24   | 66   | 10                         |
| Bethlehem  | 0    | 18   | 57   | 4                          |
| Jim Thorpe | 1    | 5    | 8    | 0 (`filtered_for_quality`) |

This shows substantial funnel loss between raw Overpass candidates and final quality-filtered output — a plausible contributor to why so few candidates even reached Tier 1, let alone Tier 4, but this is observational, not a frozen metric.

## 6. Overall (pooled across all 4 areas) metrics

| Metric                                                   | Value           |
| -------------------------------------------------------- | --------------- |
| Total discover candidates                                | 34              |
| Thin-candidate count                                     | 0               |
| Bridgeable count                                         | 0               |
| Joinability                                              | undefined (0/0) |
| Individual-NRHP share among all thin (lower bound)       | undefined (0/0) |
| Individual-NRHP share among bridgeable thin              | undefined (0/0) |
| Class split                                              | N/A             |
| Join-method split                                        | N/A             |
| Wikipedia baseline of bridged individual listings        | N/A             |
| Share of bridged individual listings that are baseline C | N/A             |
| Share of all OSM candidates carrying `ref:nrhp`          | not observable  |
| Share of thin OSM candidates carrying `ref:nrhp`         | N/A             |

## 7. Two independently-confirmed bridge-mechanism gaps (disclosed, moot for this run but structurally real)

**Gap 1 — OSM `ref:nrhp` unobservable from the production HTTP response.** `HINT_TAGS` (the fixed 12-key OSM tag allowlist controlling the `osmTags` response field) does not include `ref:nrhp`, and grepping the entire route file confirms no alternate raw/full/debug tag field is ever serialized to HTTP clients. Reading `ref:nrhp` would require either widening `HINT_TAGS` (explicitly forbidden by the preregistration) or querying Overpass independently (not a frozen mechanism). This means Bridge 1 (OSM `ref:nrhp`) is **not actually executable** against the production API as currently specified, independent of whether thin candidates exist. This gap was moot for this specific execution (zero thin candidates to bridge), but it is a structural blocker for any future run that does find thin candidates.

**Gap 2 — Wikipedia baseline B/C/D subclassification requires out-of-scope claim extraction.** Per `PILOT_PREREGISTRATION.md`'s frozen Wikipedia-baseline taxonomy, distinguishing B (resolvable, not materially useful) from C (resolvable, useful current baseline) from D (rich content the shared extractor misses) requires inspecting article content quality — which falls under "extract claims," explicitly out of scope for Step 6D (Section 12: no claim extraction). Only A (no resolvable article) vs. "resolved" is deterministically computable without extraction. This gap was also moot here (zero bridged individual listings to classify).

Both gaps were independently re-confirmed during this execution and are reported for completeness, not invoked to justify any result (no bridging was attempted or needed).

## 8. Frozen interpretation table applied

The preregistered table defines buckets for joinability (`<20%` / `20–50%` / `>50%`) and individual-NRHP share (`<5%` / `5–15%` / `>15%`), with a decision mapping (no-go / proceed / inconclusive / report-only).

**This execution does not produce a value that fits any bucket.** Joinability is 0/0 — mathematically undefined, not "low" — because there were zero thin candidates to attempt bridging, not thin candidates that failed to bridge. This is a distinct degenerate case from "low joinability," and forcing it into the `<20%` bucket would misrepresent the result (it would imply bridging was attempted and mostly failed, when in fact there was nothing to bridge). Per instruction, the interpretation table is applied honestly rather than modified after seeing results: **the table does not apply to a zero-candidate-pool outcome, and no go/no-go/inconclusive/report-only decision is produced.**

The only honest statement the frozen rules support: within these four specific frozen areas, at this production commit, under `osmAnchor` mode at max radius, **the thin-candidate population this ceiling test exists to measure was not observed at all.**

## 9. Text-layer probe gate

**Not reached.** The gate requires a "proceed" interpretation result, which was not produced (Section 8). No NRHP nomination PDFs were fetched or authorized in this task.

## 10. Request counts / rate-limit cap status

- Discover calls: 4 (exactly one per frozen area, as required).
- Wikidata requests: **0 of 20** cap used — no bridging was attempted because zero thin candidates existed to bridge.

## 11. Artifacts

- `experiments/hybrid-discovery-v0.1/documents/step6d-artifacts/discover_fairmount.json`
- `experiments/hybrid-discovery-v0.1/documents/step6d-artifacts/discover_midtown.json`
- `experiments/hybrid-discovery-v0.1/documents/step6d-artifacts/discover_bethlehem.json`
- `experiments/hybrid-discovery-v0.1/documents/step6d-artifacts/discover_jimthorpe.json`
- `experiments/hybrid-discovery-v0.1/documents/step6d-artifacts/hashes.txt`
- `experiments/hybrid-discovery-v0.1/documents/STEP_6D_RESULTS.md` (this file)
- `experiments/hybrid-discovery-v0.1/documents/step6dResultLog.json` (machine-readable twin)

No Wikidata raw-response artifacts exist — none were needed.

## 12. Confirmations

- `STEP_6D_PREREGISTRATION.md` was not modified during execution.
- No production code was changed.
- No commit or push was made.
