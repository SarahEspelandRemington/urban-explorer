# Step 6C Results — Cross-System Acquisition-Shape Mapping

**Baseline preregistration commit:** `55598bc5e200663f9e6c03d3beedc1a76bdba7b8`
**Run date:** 2026-10-15
**Machine-readable artifact:** `step6cResultLog.json`

This execution ran exactly as frozen in `STEP_6C_PREREGISTRATION.md`, including
the Section 2A system-discovery boundary (max 9 systems, NPS counted once) and
the Section 9 request/rate limits (40-request session cap, 1 req/sec/host, no
anti-bot/access-control bypass).

---

## 1. Systems inspected (9 identified, 6 fully determined, 3 undetermined)

| #   | Jurisdiction     | Level   | System                                     | Status                                          |
| --- | ---------------- | ------- | ------------------------------------------ | ----------------------------------------------- |
| 1   | NYC              | Local   | LPC (Landmarks Preservation Commission)    | Determined — **fit**                            |
| 2   | NYC              | State   | NY SHPO / CRIS                             | Determined — **fit** (request-only/login-gated) |
| 3   | Chicago          | Local   | City of Chicago Individual Landmarks       | Determined — **fit**                            |
| 4   | Chicago          | State   | Illinois Historic Preservation Division    | Determined — **fit**                            |
| 5   | Omaha/Nebraska   | Local   | City of Omaha Landmarks Commission         | **Undetermined** — blocked (403)                |
| 6   | Omaha/Nebraska   | State   | History Nebraska (Nebraska SHPO)           | **Undetermined** — blocked (anti-bot)           |
| 7   | Las Vegas/Nevada | Local   | City of Las Vegas Historic Preservation    | **Undetermined** — session cap reached          |
| 8   | Las Vegas/Nevada | State   | Nevada SHPO — State and National Registers | Determined — **fit**                            |
| 9   | (shared)         | Federal | NPS NRHP / NPGallery                       | Determined — **fit**                            |

---

## 2. Per-system detail

### 2.1 NYC Local — LPC

**Attribute table**

| Attribute            | Value                                        | Evidence               | Surface                                              |
| -------------------- | -------------------------------------------- | ---------------------- | ---------------------------------------------------- |
| Link mechanism       | exact-ID lookup                              | Observed               | `s-media.nyc.gov` deterministic URL from `lp_number` |
| Match evidence       | native/source ID (`lp_number`)               | Observed               | `ncre-qhxs` dataset                                  |
| Coverage             | complete                                     | Documented             | dataset description                                  |
| Extra steps          | deterministic only                           | Observed               | numeric-suffix URL construction                      |
| Document form        | PDF (scan/born-digital not content-verified) | Observed (format only) | HEAD response                                        |
| Document granularity | one resource                                 | Observed               | `lm_type=Individual Landmark`                        |

**Worked record:** `lp_number=LP-01710` ("Midtown Theater") →
`https://s-media.nyc.gov/agencies/lpc/lp/1710.pdf` → HTTP 200, real PDF
(6.6 MB).

**Contract result:** Fit. **Cost:** one deterministic lookup.

### 2.2 NY State — SHPO / CRIS

CRIS is Documented by SHPO's own page as its "online cultural resources data
management and GIS tool" with "more than 1.5 million pages of scanned paper
records." Direct inspection reached a legal-disclaimer gate followed by an
SSO sign-in flow (`login.ny.gov`). Per the frozen no-bypass rule, reconnaissance
stopped there.

**Contract result:** Fit — request-only/login-gated access is explicit contract
fit per Section 7, not a failure. **Cost:** manual/request-only.

### 2.3 Chicago Local — Individual Landmarks

**Worked record:** Socrata dataset `uct4-hrvh` gives `id=L-120`,
name="Indian Boundary Park Fieldhouse", address="2500 W Lunt Av", designation
date 2005-05-11. The city's own `landmarksweb` search app uses a _different_
internal ID space (`lanId=11380`) with no shared native key — the two
surfaces were cross-matched deterministically on exact name + exact
designation date, both of which matched precisely. The narrative content is
embedded directly in the detail page HTML (no separate PDF).

**Contract result:** Fit. **Link mechanism:** deterministic cross-surface
matching. **Match evidence:** exact name + direct asserted linkage.
**Cost:** multi-surface deterministic.

### 2.4 Illinois State — IHPD National Register Listings

IHPD publishes and maintains a complete, current "National Register Listings
in Illinois" spreadsheet. Its "Reference Number" column is the **same NRIS
reference number used by the federal NPS system** — the state surface does
not itself host the narrative document; it supplies the federal ID.

**Worked record:** Reference Number `66000314` ("First Self-Sustaining
Nuclear Reaction, Site of," Cook County, Chicago, listed 1966-10-15) →
resolved via the shared NPS `GetAsset` pattern (see 2.9), HTTP 200, real PDF.

**Contract result:** Fit, flagged as a genuine administrative-mirror overlap
with the federal system (expected for an NRHP-administering SHPO, not a
defect). HARGIS, Illinois's own ArcGIS-based system, was identified
(`maps.dnr.illinois.gov`) but not probed further within budget — recorded as
Documented-to-exist / Unknown-in-depth. **Cost:** multi-surface deterministic.

### 2.5 Omaha Local — undetermined

Both attempted official-domain paths
(`planning.cityofomaha.org/landmarks-heritage-preservation`,
`www.cityofomaha.org` root) returned HTTP 403 Access Denied. No bypass was
attempted. Recorded as ambiguous/unknown per Section 2A; all six attributes
Unknown.

### 2.6 Nebraska State — undetermined

`history.nebraska.gov` returned a Cloudflare "Just a moment..." anti-bot
challenge (403) on two attempts. The legacy mirror `nebraskahistory.org`
returned only a bare JS-redirect stub pointing back at the same blocked
domain. No bypass was attempted. Recorded as ambiguous/unknown; all six
attributes Unknown.

### 2.7 Las Vegas Local — undetermined

`www.lasvegasnevada.gov/Doing-Business/Planning/Historic-Preservation`
returned 404; the site root (200) surfaced one unverified lead link
(`/Residents/History`), but the 40-request session cap was reached before it
could be inspected. Recorded as ambiguous/unknown per Section 2A — not
broadened past the cap.

### 2.8 Nevada State — SHPO State and National Registers

The SHPO's own "State and National Registers" page **links directly** to
individual nomination PDFs — no intermediate lookup step. One linked document,
`78003379_NV_Clark_County_Las_Vegas_Mormon_Fort_-_reduced2.pdf`, is both the
worked example and directly relevant to the Las Vegas jurisdictional context.

**Worked record:** direct link → HTTP 200, 22 MB PDF, confirmed live.

**Contract result:** Fit. **Link mechanism:** record-directly-links-document.
**Match evidence:** direct asserted linkage + native ID embedded in filename.
**Cost:** direct.

### 2.9 NPS NRHP / NPGallery (shared federal system)

**Worked record:** NRIS Reference Number `66000314` →
`https://npgallery.nps.gov/GetAsset/NRHP/66000314_text` — HTTP 200 on GET
(note: a HEAD request to the same URL returned 404 with a JSON error body;
GET is required), real PDF content returned (`%PDF-1.4` header confirmed).

**Contract result:** Fit. **Link mechanism:** exact-ID lookup. **Match
evidence:** native/source ID. **Cost:** one deterministic lookup.

---

## 3. Recurring link-mechanism + match-evidence pairs

Only **one** matching pair was found among the 6 fully-determined systems:

- **NYC Local (LPC)** and **NPS NRHP** both share `exact-ID lookup` +
  `native/source ID`.

This pair **involves NRHP**, which per Section 12 cannot alone satisfy "a few
recurring adapter patterns." No second, non-NRHP-involving matching pair was
found:

- Illinois State and Chicago Local share the same _link mechanism_
  (deterministic cross-surface matching) but **different** match-evidence
  profiles (native ID vs. exact-name/asserted-linkage) — not a qualifying
  pair under the frozen same-mechanism-AND-same-evidence rule.
- Nevada State's `record-directly-links-document` + `direct asserted
linkage` profile is unique among inspected systems.

---

## 4. True contract failures

**Zero.** Every fully-determined system (6 of 9) populated the five-part
acquisition record without any field acquiring city-specific meaning. The one
request-only/login-gated system (NY State) is explicit contract fit, not a
failure, per Section 7.

---

## 5. Decision mapping result

**Literal frozen-rule result (on the 6 determined systems): Philadelphia-specific acquisition.**

Basis: fewer than two qualifying recurring pairs exist (only one pair was
found, and it involves NRHP, which cannot alone satisfy the "few recurring
patterns" condition).

**Caveats on evidentiary strength:**

1. This result covers only 6 of the 9 maximum systems. 3 remain genuinely
   undetermined (Omaha local, Nebraska State, Las Vegas local) due to real
   access barriers (anti-bot challenge, WAF 403 block, session-cap
   exhaustion) — not due to any contract failure or drawing error.
2. Zero true Section-8 contract failures occurred among any reachable
   system — a positive portability signal, distinct from and not settling
   the "few recurring shapes" question.
3. The access barriers themselves are a notable, honestly-reportable finding
   about real-world reconnaissance friction for preservation-source systems,
   separate from the three frozen decision buckets.
4. Per Section 13's guardrail: this result establishes observed shapes and
   gaps only, not national prevalence, even within the fully-determined
   subset.

---

## 6. Request ledger

- Session cap: 40. **Used: exactly 40** (cap reached, not exceeded).
- 1 request/second/host respected throughout (explicit `sleep 1` between
  same-host calls).
- No anti-bot/access-control bypass attempted at any point (Omaha WAF block,
  Nebraska Cloudflare challenge).
- No general web search used as an acquisition mechanism; one Socrata
  catalog-search call per city (NYC, Chicago) was used only to locate the
  correct dataset within an already-official open-data platform, not to
  acquire documents.

---

## 7. New-rule / gap ledger (logged, not acted on)

- Chicago's two official surfaces (open-data dataset vs. search webapp) use
  **non-overlapping internal ID spaces** — a real-world case where no shared
  native key exists between a jurisdiction's own surfaces, requiring
  cross-surface name/date matching. The existing contract represented this
  without any new field.
- Illinois's state-level surface is largely an administrative index into the
  federal NRIS ID space rather than a self-contained document host — the
  existing contract represented this cleanly as "deterministic cross-surface
  matching," no new concept needed.
- No contract field had to acquire a city-specific meaning in any
  fully-determined system.
