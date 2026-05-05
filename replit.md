# Workspace

## Overview

Urban Explorer - a mobile app for urban explorers that surfaces interesting history and facts about buildings and spaces as they walk around the city. Uses AI (OpenAI) to generate contextual historical information based on the user's GPS location.

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo (React Native)
- **Lint**: ESLint v9 flat config at root (`eslint.config.mjs`); run via `pnpm run lint`. Targets `urban-explorer` + `api-server`. Includes `typescript-eslint` + `eslint-plugin-react-hooks`.
- **AI**: OpenAI via Replit AI Integrations (no API key needed)

## Architecture

- **Mobile app** (`artifacts/urban-explorer`): Expo React Native app with location-based discovery
  - Uses `expo-location` for GPS coordinates, or manual location search (geocoding via AI)
  - Header search button allows switching from GPS to manual location search at any time
  - Two tabs: Explore (discover nearby places) and Saved (bookmarked places)
  - Place detail screen with rich historical information and tags
  - Filter chips: categories, era-based time periods, and AI-generated descriptive tags
  - **Map view auto-discovery**: panning the map 150m+ from last fetch center auto-triggers new discovery (800ms debounce), accumulating markers across pans with deduplication
    - Native: `react-native-maps` MapView with `onRegionChangeComplete`
    - Web: Leaflet with OpenStreetMap tiles (dynamically loaded), full marker interaction and place card overlay
    - "Finding places..." loading badge shown during map-triggered fetches
  - **Walk Mode**: pre-walk planning (start/end address) with OSRM pedestrian routing and pre-fetched places along the route, then continuous GPS tracking with proximity + route-progress gated narration. Plan screen at `/walk-plan` hands off `plannedRoute` to walk-mode via `WalkModeContext`. Server endpoints: `POST /api/explore/route` (OSRM) and `POST /api/explore/places-along-route` (Overpass + LLM blurbs, geometry-signature cache).
    - `WalkModeContext` manages location watching, proximity detection (~50m), narration queue, and building type filter preferences (`enabledBuildingGroups: Set<BuildingGroupKey>`). The building group preference is passed to the discover API as `includeBuildingTypes` and triggers a new fetch when changed. Building type groups are defined in `constants/buildingTypeGroups.ts` (residential, agricultural, parking, utility).
    - Walk Mode header has a sliders icon button that opens a building filter bottom sheet. The button highlights when any filter group is enabled. Preferences are session-scoped (reset when the walk ends).
    - `useNarration` hook plays narrations from a queue with pause/resume/skip. On native it prefers playing pre-rendered MP3 files via `expo-audio` (`createAudioPlayer` + `playbackStatusUpdate`) so users hear OpenAI's natural-voice TTS instead of robotic system speech. Falls back to `expo-speech` if audio fetch/decode fails. On web uses the Web Speech API with text. Each playback is generation-counter guarded to defeat stale callbacks (which previously caused iOS audio crashes).
    - **Natural-voice TTS pipeline**: server endpoint `POST /api/explore/walk-narration-audio` reuses the same prompt as the text endpoint, runs the result through `textToSpeech()` (OpenAI `gpt-audio` model, voice "nova" default — overridable via `?voice=` query for A/B), and returns `audio/mpeg`. Audio bytes are cached in-memory (`audioCache`, 50 entries × ~30 min TTL) keyed by narration content + voice. Client writes the bytes to `Paths.cache` (expo-file-system v55) and queues the file URI; cleanup deletes the temp file when playback finishes or is cancelled.
    - **Now Playing widget**: local Expo module at `artifacts/urban-explorer/modules/expo-now-playing`. While Walk Mode runs, the lock screen shows "Urban Explorer — <place>"; play/pause/next remote commands drive `narration.resume/pause/skip`. Cleared on `stopWalk`. The JS wrapper (`src/index.ts`) uses `requireOptionalNativeModule` and gracefully stubs all calls when native code is absent. To activate for real: add `ios/NowPlayingModule.swift` (MPNowPlayingInfoCenter + MPRemoteCommandCenter) and `android/.../NowPlayingModule.kt` (MediaSession) inside the module directory, then do a native EAS build.
    - Platform-specific maps (native MapView vs Leaflet web map)
  - AsyncStorage for persisting saved places
  - Design tokens: warm earthy palette in `constants/colors.ts` — dark mode: warm charcoal `#242220` background with copper `#D4845A` primary, category accents (sage `#8A9A86`, terracotta `#B4846C`, mauve `#988496`). Light mode: cream `#F5F3F0` with copper `#9C5A2E` primary, mutedForeground `#5C5752` (WCAG AA). Category colors/icons centralized in `constants/categories.ts`.
  - **Accessibility**: Full WCAG AA compliance — all interactive elements have `accessibilityRole`, `accessibilityLabel`, `accessibilityState`; all touch targets 44×44px minimum with `hitSlop={20}`; filter chip text 12px; badge text 12px; narration labels 12px; walk-mode narration/loading cards use `accessibilityLiveRegion="polite"` for screen reader announcements.
  - **Glanceable card layout**: Hero card for nearest place (22px bold name, walk-time badge, summary) + compact single-row cards for the rest (icon + name + walk time). Optimized for walking users who need quick identification without stopping. Distances shown as walk time ("2 min", "< 1 min") instead of raw meters.

- **API server** (`artifacts/api-server`): Express backend
  - `POST /api/explore/discover` - Takes lat/lng, returns AI-generated facts about nearby places (with tags, addresses, confidence levels). Supports `mode: "quick"` for faster map panning discovery (gpt-4.1-mini, 500m radius, 8-12 places) vs default full mode (gpt-4.1, 300m, 5-7 places). OSM Overpass results are cached (5min TTL, 200m distance match) to speed up nearby queries. Accepts optional `includeBuildingTypes: string[]` to un-filter specific OSM building types from the hardcoded denylist (garage, shed, barn, etc.) — cache key includes sorted include list so different preferences get distinct LLM results.
  - `POST /api/explore/geocode` - Converts location name to lat/lng coordinates. **Nominatim (OpenStreetMap) is primary**; LLM (gpt-4.1-nano) is fallback for queries Nominatim can't resolve. Returns `{ latitude, longitude, displayName }`.
  - `POST /api/explore/suggest-locations` - Location autocomplete. **Nominatim primary** (when `nearLocation` is present or query ≥ 15 chars); returns suggestions with embedded `latitude`/`longitude` so the client can skip a separate geocode round-trip. LLM fallback for short/ambiguous queries. Returns `{ name, description, latitude?, longitude? }[]`.
  - `POST /api/explore/place-detail` - Returns detailed history for a specific place
  - `POST /api/explore/place-timeline` - "Time Travel" feature: generates 4-6 historical eras showing how a place transformed through time (gpt-4.1-mini)
  - `POST /api/explore/walk-narration` - Generates brief tour-guide-style narrations for TTS (gpt-4.1-nano)
  - **All OpenAI calls are wrapped in try/catch** — returns 503 on AI service errors instead of unhandled 500, so the client can distinguish and retry. Rate-limit (429) is propagated as-is.
  - **`trust proxy 1`** set so express-rate-limit reads `X-Forwarded-For` correctly through Replit's reverse proxy and per-IP rate limiting works correctly.
  - **LLM result caching**: In-memory cache (15min TTL, 200 entry max) for all AI-backed endpoints (discover, place-detail, place-timeline, geocode, suggest-locations). Cache keys include all prompt-shaping inputs (place name, category, yearBuilt, coordinates, radius, mode) to prevent stale data. Coordinates rounded to 4 decimal places (~11m precision).
  - Uses OpenAI gpt-4.1-mini for discover (condensed ~700-token system prompt keeps TTFT low; LLM capped at 35s, client at 45s), gpt-4.1-mini for detail/timeline/deep-narration, gpt-4.1-nano for walk-narration/geocode-fallback/suggest-fallback
  - Discover prompt includes numbered priority list (7 categories, including social history: gang territories, labor unions, ethnic organizations, political machines), BAD/GOOD examples, quality standards, and HONESTY RULE. Every discovery must anchor to a single specific locatable point — no vague area descriptions. Tags expanded to include: `labor history`, `ethnic community`, `gang territory`, `political machine`, `immigrant organization`, `working class`, `displacement`.
  - **Coordinate verification**: `postProcessPlaces` runs a Nominatim geocode check on every medium/low-confidence place that has an address. If the AI-returned coordinates and the geocoded address disagree by >50m, the verified coordinates replace the AI's. High-confidence (OSM-backed) places are skipped. Nominatim failures fall back to AI coordinates gracefully.
  - **OpenStreetMap grounding**: `fetchNearbyOSMPlaces()` queries Overpass API for historic sites, heritage, tourism, notable buildings, cemeteries, and memorials nearby; results are sanitized and injected into the user message so the AI attaches history to verified locations. Overpass query is optimized with targeted building type filters (not broad `amenity`), 25-result limit at source, 4-5s query timeouts, and a competitive `Promise.race` timeout (3-4s) so discovery proceeds without OSM data if the external API is slow
  - `postProcessPlaces()` validates fields, enforces 1.25x radius tolerance, deduplicates by name/coords, filters vague content, validates confidence enum, sorts by distance
  - OSM text inputs are sanitized (control chars stripped, length-capped) to prevent prompt injection

- **Crash reporting** (`artifacts/urban-explorer/lib/sentry.ts`, `lib/sentryWalk.ts`):
  - `sentry.ts` initializes Sentry at module load time (before any render), gated on `EXPO_PUBLIC_SENTRY_DSN`. When absent, all exports are no-ops.
  - PII protection: `isPiiKey` + recursive `scrubObject` strip lat/lon/place/address/name/narration/altitude/heading/speed keys from `event.extra` and `event.contexts`. `scrubString` redacts keyed PII patterns (e.g. `name: "Central Park"`) from breadcrumb and event messages. `beforeAddBreadcrumb` hook drops all non-walk breadcrumbs at SDK ingestion time; walk breadcrumbs have their `data` and `message` scrubbed at that point too. `beforeSend` is a second pass: same filters applied before the event leaves the device.
  - `sentryWalk.ts` provides `setWalkScope()` (stamps current walk state onto the Sentry scope) and `addWalkBreadcrumb()` (adds a walk-category breadcrumb with ingestion-time PII scrubbing). Called from `WalkModeContext.tsx` on walk start/stop, place visited, narration fetched, and fetch errors.
  - Sentry metrics: `trackNarrationFallback(reason)` increments `narration.audio_fallback` counter with a `reason` tag to track TTS fallback rates. The `reason` tag covers fetch-side failures (`write_failure | endpoint_error | bad_response` — emitted from `lib/fetchNarrationPayload.ts` when the audio bytes never reach the playback engine), playback-side silent-skip failures (`playback_create | playback_play | playback_status_error | playback_watchdog` — emitted from `hooks/useNarration.ts` when expo-audio receives the audio but cannot play it), AND text-path silent-skip failures (`text_speak_error | text_web_error | text_empty` — emitted from `hooks/useNarration.ts` when the text fallback path itself fails: native expo-speech onError, web Web Speech API onerror, or an empty/missing text payload). `trackPrefetchEvent(event)` increments `narration.prefetch_event` counter (tagged `event` ∈ `HIT | MISS | STALE_DISCARD | STOP_WALK_DISCARD | DEDUPE`) for every narration prefetch outcome — see "Sentry Dashboards & Alerts" below for the saved panel and regression alert wired off this metric. `trackNarrationPlayed(kind)` increments `narration.played` counter (tagged `kind` ∈ `audio | text`) once per queued narration that actually started playback — emitted from `hooks/useNarration.ts` after `player.play()` returns without throwing on the audio path, and after `Speech.speak` / `window.speechSynthesis.speak` is invoked on the text paths. Items that never reach the play call (`playback_create` / `playback_play` failures, `text_empty` guard) are intentionally excluded so the dashboard's Panel 3 rate is `fallback / actually-played` instead of being inflated by lifecycle events.
  - Test suite: `artifacts/urban-explorer/__tests__/sentry.test.ts` + `sentryWalk.test.ts` — 200+ tests covering `isPiiKey`, `scrubObject`, `scrubString`, `beforeSend`, `beforeAddBreadcrumb`. Registered as the `privacy-tests` validation step.
  - ESLint rule: `eslint-rules/no-pii-in-sentry.mjs` — warns when a known PII field (name, lat, place, etc.) is interpolated into a Sentry call's message argument. Registered as the `lint-rules` validation step.
  - `app.config.js` (replaces `app.json`) — dynamic Expo config that reads `SENTRY_ORG`/`SENTRY_PROJECT` from environment for the `@sentry/react-native/expo` build plugin.

- **Sentry Dashboards & Alerts** (configured in the Sentry web UI, not in code):
  - **Walk Mode Prefetch dashboard** — saved Sentry dashboard that charts the narration-prefetch hit rate over time off the `narration.prefetch_event` metric (emitted by `trackPrefetchEvent` in `lib/sentryWalk.ts`).
    - **Dashboard URL**: _to be filled in once created — paste the `https://<org>.sentry.io/dashboard/<id>/` link here._
    - **Panel 1 — "Prefetch events by outcome" (stacked area, 24h)**
      - Metric: `narration.prefetch_event` (counter), aggregate `sum`
      - Group by tag: `event`
      - Visualization: stacked area chart so HIT / MISS / STALE_DISCARD / STOP_WALK_DISCARD / DEDUPE are visible side-by-side over time.
    - **Panel 2 — "Prefetch hit rate %" (line, 24h, 5-min buckets)**
      - Equation: `100 * sum(narration.prefetch_event){event:HIT} / (sum(narration.prefetch_event){event:HIT} + sum(narration.prefetch_event){event:MISS} + sum(narration.prefetch_event){event:STALE_DISCARD})`
      - In Sentry's "Add Equation" UI: define three queries (`A` = HIT sum, `B` = MISS sum, `C` = STALE_DISCARD sum) and use equation `100 * A / (A + B + C)`.
      - Y-axis: 0–100, threshold line at `60`.
      - `STOP_WALK_DISCARD` and `DEDUPE` are intentionally excluded from the denominator: they reflect lifecycle/coalescing behavior, not cache effectiveness.
  - **Walk Mode prefetch hit rate alert** — Metric Alert in Sentry that pages on prefetch-pipeline regressions. Last calibrated **2026-05-04**: migrated from absolute HIT-count static thresholds onto Sentry **Anomaly Detection** (`detectionType: dynamic`), so the HIT count is judged against its own learned hourly/daily baseline instead of a fixed floor. This implicitly normalizes against walk volume — a quiet hour with a 100% hit rate but only 50 walks no longer looks like a critical regression, and a busy hour where the hit rate has actually collapsed but volume kept the count above the legacy floor no longer stays silent (the exact symptom of static-threshold alerts that this task set out to fix, mirroring the audio-fallback migration in Task #229).
    - **Alert URL**: _to be filled in once created — paste the `https://<org>.sentry.io/alerts/rules/details/<id>/` link here._
    - Dataset: Metrics → `narration.prefetch_event`
    - Aggregate: `sum(narration.prefetch_event)` filtered to `event:HIT`
    - Time window: **1 hour**, evaluated every 5 minutes
    - Detection: `detectionType: dynamic` (Sentry Anomaly Detection), `seasonality: auto` so Sentry picks hourly vs daily vs weekly periodicity from the data. The numeric `alertThreshold` on the trigger is `0` and ignored — sensitivity is what controls how easily the alert fires. Threshold direction is "below" so only anomalously LOW HIT counts page (a collapse in cache effectiveness), never an anomalously high one.
    - Sensitivity: `medium` — symmetric tuning to the fetch-side audio-fallback alert. A brief OpenAI / network blip can dent the prefetch hit rate the same way it dents the audio-fallback rate, and we don't want to wake the on-call on every transient blip; we want to catch sustained regressions only.
    - **Why anomaly detection and not a literal hit-rate equation**: Sentry's Metric Alerts on the `metrics` dataset can't fire on an equation across multiple queries, so a literal `100 * HIT / (HIT + MISS + STALE_DISCARD) < X%` trigger isn't expressible in an alert rule today (only in a dashboard panel — the true rate view stays in Panel 2 above for humans). Anomaly detection on the HIT count is the closest principled proxy: it models the typical hourly profile of HITs from history, so it implicitly knows that "55 HITs at 3am on a Tuesday" is normal while "55 HITs during peak commute" is anomalously low. Panel 2 (`100 * A / (A + B + C)`) remains the source of truth when an alert fires — open it first to confirm the rate matches the page.
    - **Bootstrap caveat**: anomaly detection needs ~7 days of `narration.prefetch_event{event:HIT}` history before its baseline is trustworthy. While the baseline is still warming up the alert may either over-page or stay silent; if you ship before there is meaningful walk traffic, run the setup script with `PREFETCH_ALERT_DETECTION_TYPE=static` to use the legacy absolute HIT-count thresholds (critical `<60`, warning `<75`, resolve `>=75`) as a bridge, then re-run without the flag once a week of data has accumulated. Anomaly Detection also requires a Sentry Business plan or above — if the alerts API rejects `detectionType: dynamic`, fall back to `static` the same way.
    - Minimum-volume guard: with dynamic detection the baseline itself is the guard — a quiet hour where the HIT count is normally low won't page until the value moves significantly off that learned floor, so the previous "require A+B+C >= 20" hand-tuned guard is no longer needed.
    - Owner / route to: the Walk Mode on-call channel (Slack/Email destination set on the Sentry side).
    - **On-call runbook (when paged)**: open the **Dashboard URL** above and read Panel 2 (`100 * A / (A + B + C)`) for the alert window first — that's the true hit-rate view, while the alert itself only knows it saw an anomalously low HIT count. Confirm the rate is genuinely depressed (not a baseline-warmup blip while history is still <7 days old, and not a tiny denominator misleading the eye) before escalating. Then check Panel 1 ("Prefetch events by outcome") to see whether MISS or STALE_DISCARD drove the dip — that points at whether the regression is in cache freshness vs cache population.
  - **How to create (or recreate) the dashboard + alert** — automated via a one-shot script:
    ```bash
    SENTRY_AUTH_TOKEN=<token-with-org:read+project:read+project:write+alerts:write> \
    SENTRY_ORG=<org-slug> \
    SENTRY_PROJECT=<project-slug> \
    pnpm --filter @workspace/scripts run setup:sentry-walk-dashboard
    ```
    The script (`scripts/src/setupSentryWalkPrefetchDashboard.ts`) is idempotent: it reuses an existing "Walk Mode Prefetch" dashboard, and `PUT`s the "Walk Mode prefetch hit rate" alert rule onto the current spec when found (otherwise `POST`s a new one) — so a re-run also migrates any pre-existing static rule onto dynamic anomaly detection in place, no manual rule deletion needed. On success it patches the **Dashboard URL** and **Alert URL** lines above with the real links. The alert is created without notification actions — open the printed Alert URL once and add the on-call Slack/Email target so it actually pages.
    Detection-mode escape hatch: by default the script creates the alert with `detectionType: dynamic` (Sentry Anomaly Detection). To bridge the ~7-day baseline-warmup window — or if the org's Sentry plan doesn't include anomaly detection (Business plan or above) and the API rejects dynamic alerts — re-run with `PREFETCH_ALERT_DETECTION_TYPE=static` to fall back to the legacy absolute HIT-count thresholds (critical `<60`, warning `<75`, resolve `>=75`). The same `PUT` upsert path means a follow-up re-run without the flag flips the same rule back to dynamic.
    Manual fallback if the script can't be run: Dashboards → New Dashboard → "Walk Mode Prefetch" → add the two panels above. Alerts → Create Alert → Metric Alert → pick `narration.prefetch_event` filtered to `event:HIT` → set to **Anomaly Detection** with sensitivity `medium`, `seasonality: auto`, threshold direction "below". Then paste the URLs above so the team can find them.
  - **Walk Mode Audio Fallback dashboard** — saved Sentry dashboard that charts the natural-voice TTS fallback rate over time off the `narration.audio_fallback` metric (emitted by `trackNarrationFallback` in `lib/sentryWalk.ts`, called from every fallback path in `lib/fetchNarrationPayload.ts`). When the gpt-audio pipeline degrades (OpenAI outage, server-side cache bug, or a client-side `write_failure` spike on a new OS version) users silently fall back to robotic system speech — this dashboard makes that visible.
    - **Audio Fallback Dashboard URL**: _to be filled in once created — paste the `https://<org>.sentry.io/dashboard/<id>/` link here._
    - **Panel 1 — "Audio fallback events by reason" (stacked area, 24h)**
      - Metric: `narration.audio_fallback` (counter), aggregate `sum`
      - Group by tag: `reason`
      - Visualization: stacked area chart so every `reason` value is visible side-by-side over time. The `group by reason` already aggregates new tag values automatically, so the panel does not need to be edited when new fallback reasons are added.
      - Fetch-side reasons (audio bytes never reached the playback engine): `write_failure` → client/OS issue, `endpoint_error` → network/timeout, `bad_response` → server/upstream issue.
      - Playback-side reasons (audio arrived but expo-audio could not play it, so Walk Mode silently skipped the story): `playback_create` → `createAudioPlayer` threw on a corrupt cache file or native runtime mismatch, `playback_play` → `player.play()` threw on a lost audio session or unavailable decoder, `playback_status_error` → the OS reported an error/failure/cannotPlay state via `playbackStatusUpdate`, `playback_watchdog` → the 60s audio watchdog tripped because `didJustFinish` never fired (decoder stall, lost audio session). A spike in any `playback_*` reason points at a regression in expo-audio or a new OS audio-stack issue.
      - Text-path reasons (the text fallback path used on web AND when the audio fetch failed silently skipped too — emitted from `hooks/useNarration.ts`): `text_speak_error` → native `Speech.speak`'s `onError` fired (expo-speech engine unavailable, locale missing on a new OS version), `text_web_error` → web `SpeechSynthesisUtterance.onerror` fired (Web Speech API regression, voice unavailable), `text_empty` → the prefetched text payload was empty/missing so `processQueue`'s empty-text guard advanced past the place (text endpoint regression, malformed cached entry). A spike in any `text_*` reason points at a regression in expo-speech, the Web Speech API, or the text endpoint.
    - **Panel 2 — "Total narration volume" (line, 24h, 5-min buckets)**
      - Metric: `narration.prefetch_event` (counter), aggregate `sum`, no `event` filter
      - Provides **approximate** denominator context: every narration emits at least one prefetch event, but the same metric also counts lifecycle events like `DEDUPE` and `STOP_WALK_DISCARD`, so the sum slightly over-counts true narrations played. Good enough as a volume sanity check — a high fallback count next to a low volume is background noise; a high count next to high volume is a real regression.
    - **Panel 3 — "Audio fallback rate %" (line, 24h, 5-min buckets)**
      - Equation: `100 * sum(narration.audio_fallback) / sum(narration.played)`
      - In Sentry's "Add Equation" UI: define two queries (`A` = audio_fallback sum, `B` = `narration.played` sum) and use equation `100 * A / B`.
      - Y-axis: 0–100, threshold line at `10`.
      - The denominator is the dedicated `narration.played` counter (emitted by `trackNarrationPlayed` in `lib/sentryWalk.ts`, fired once per queued narration that actually started playback — `audio` kind after `player.play()` returns, `text` kind after `Speech.speak` / `window.speechSynthesis.speak`). Items that never started — `playback_create` / `playback_play` failures, `text_empty` guard — are intentionally excluded, so the rate is a true `fallback / narrations-played` and is safe to compare across windows.
  - **Walk Mode Audio Fallback rate alerts** — two Metric Alerts in Sentry that page on TTS-pipeline regressions, one per failure surface. Last calibrated **2026-05-04**: migrated from absolute-count static thresholds onto Sentry **Anomaly Detection** (`detectionType: dynamic`), so each per-side count is judged against its own learned hourly/daily baseline instead of a fixed number. This implicitly normalizes against narration volume — a quiet hour with a 100% failure rate is anomalous and pages, while a busy hour with the usual fallback noise stays silent (the exact symptom of static-threshold alerts that Task #229 set out to fix). Previously split out from a single combined rule (originally `sum(narration.audio_fallback)` over all reasons at `>=15` critical / `>=8` warning) so a fetch-side regression isn't masked by playback noise (and vice versa) now that Task #222 widened the metric from 3 reason values to 7.
    - Dataset (both rules): Metrics → `narration.audio_fallback`
    - Aggregate (both rules): `sum(narration.audio_fallback)` filtered by the `reason` tag group
    - Time window (both rules): **1 hour**, evaluated every 5 minutes
    - Detection (both rules): `detectionType: dynamic` (Sentry Anomaly Detection), `seasonality: auto` so Sentry picks hourly vs daily vs weekly periodicity from the data. The numeric `alertThreshold` on each trigger is `0` and ignored — sensitivity (`low` | `medium` | `high`) is what controls how easily the alert fires.
    - **Rule 1 — Fetch-side** (`Walk Mode audio fallback rate (fetch)`):
      - **Fetch-side Alert URL**: _to be filled in once created — paste the `https://<org>.sentry.io/alerts/rules/details/<id>/` link here._
      - Filter: `reason:[write_failure,endpoint_error,bad_response]` (audio bytes never reached the playback engine)
      - Sensitivity: `medium` — `endpoint_error` / `bad_response` can legitimately surge during third-party (OpenAI) blips that resolve on their own; we want to catch sustained regressions, not page on every transient blip.
    - **Rule 2 — Playback-side** (`Walk Mode audio fallback rate (playback)`):
      - **Playback-side Alert URL**: _to be filled in once created — paste the `https://<org>.sentry.io/alerts/rules/details/<id>/` link here._
      - Filter: `reason:[playback_create,playback_play,playback_status_error,playback_watchdog]` (audio arrived but expo-audio could not play it)
      - Sensitivity: `high` — a sustained playback failure rate almost always indicates an expo-audio or OS audio-stack regression worth catching early, and unlike fetch-side issues there is no upstream observability (OpenAI/server logs) to back-stop a missed page.
    - **Why anomaly detection and not a literal cross-metric ratio**: Sentry's Metric Alerts on the `metrics` dataset can't fire on an equation across two metrics, so a literal `sum(narration.audio_fallback) / sum(narration.played) > X%` trigger isn't expressible in an alert rule today (only in a dashboard panel — the true rate view stays in the dashboard's Panel 3 for humans). Anomaly detection is the closest principled proxy: it models each per-side count's typical hourly profile from history, so it implicitly knows that "5 fallbacks at 3am on a Tuesday" is anomalous while "5 fallbacks during peak commute" is noise. The dashboard's Panel 3 (`100 * sum(narration.audio_fallback) / sum(narration.played)`) remains the source of truth when an alert fires — open it first to confirm the rate matches the page.
    - **Bootstrap caveat**: anomaly detection needs ~7 days of `narration.audio_fallback` history per reason group before its baseline is trustworthy. While the baseline is still warming up the alerts may either over-page or stay silent; if you ship before there is meaningful walk traffic, run the setup script with `AUDIO_FALLBACK_ALERT_DETECTION_TYPE=static` to use the legacy absolute-count thresholds (fetch >=15/8, playback >=10/5) as a bridge, then re-run without the flag once a week of data has accumulated. Anomaly Detection also requires a Sentry Business plan or above — if the alerts API rejects `detectionType: dynamic`, fall back to `static` the same way.
    - Minimum-volume guard: with dynamic detection the baseline itself is the guard — a quiet hour where the metric is normally near zero won't page until the value moves significantly off that learned floor, and a busy hour's typical fallback noise sits inside the learned envelope and stays silent.
    - **Migration note**: the pre-split combined rule (`Walk Mode audio fallback rate`) is superseded — by default the setup script only detects and warns about it (no destructive side effects without consent), so disable or delete it manually in the Sentry UI to avoid double-paging. To make the migration one-step, re-run the setup script with `MIGRATE_LEGACY_AUDIO_FALLBACK_ALERT=1` set; the script will then `DELETE` the legacy rule via the Sentry REST API after both per-side replacements are confirmed in place. Without the flag, behavior stays warn-only. Re-running the setup script now also `PUT`s the per-side rules with the current spec (detection type, sensitivity, reason filter), so a one-step re-run also migrates any previously-created static rule onto dynamic detection in place — no manual rule deletion needed for that step.
    - Owner / route to: the Walk Mode on-call channel (Slack/Email destination set on the Sentry side, on both rules).
    - **On-call runbook (when paged)**: open the **Audio Fallback Dashboard URL** above and read Panel 3 (`100 * sum(narration.audio_fallback) / sum(narration.played)`) for the alert window first — that's the true rate view, while the alert itself only knows it saw an anomalous count. Confirm the rate is genuinely elevated (not a baseline-warmup blip while history is still <7 days old, and not a tiny denominator inflating a few real fallbacks into a misleading percentage) before escalating. Then check Panel 1 ("Audio fallback events by reason") to see which reason group drove the spike — that points straight at the regression surface (third-party endpoint vs expo-audio playback vs text fallback path).
  - **How to create (or recreate) the audio-fallback dashboard + alert** — automated via a one-shot script (mirrors the prefetch script above):
    ```bash
    SENTRY_AUTH_TOKEN=<token-with-org:read+project:read+project:write+alerts:write> \
    SENTRY_ORG=<org-slug> \
    SENTRY_PROJECT=<project-slug> \
    pnpm --filter @workspace/scripts run setup:sentry-walk-audio-dashboard
    ```
    The script (`scripts/src/setupSentryWalkAudioFallbackDashboard.ts`) is idempotent: it reuses an existing "Walk Mode Audio Fallback" dashboard, and `PUT`s the per-side "Walk Mode audio fallback rate (fetch)" and "Walk Mode audio fallback rate (playback)" alert rules onto the current spec when found (otherwise `POST`s new ones) — so a re-run also migrates any pre-existing static rule onto dynamic anomaly detection in place, no manual rule deletion needed. It also detects the legacy combined "Walk Mode audio fallback rate" rule (pre-2026-05-04); by default it just warns you to disable it manually so you don't get double-paged, but if you re-run with `MIGRATE_LEGACY_AUDIO_FALLBACK_ALERT=1` set, it will instead `DELETE` the legacy rule via the Sentry REST API after both per-side replacements are confirmed in place (one-step migration). On success it patches the **Audio Fallback Dashboard URL**, **Fetch-side Alert URL**, and **Playback-side Alert URL** lines above with the real links. Both alerts are created without notification actions — open each printed Alert URL once and add the on-call Slack/Email target so they actually page.
    Detection-mode escape hatch: by default the script creates the per-side alerts with `detectionType: dynamic` (Sentry Anomaly Detection). To bridge the ~7-day baseline-warmup window — or if the org's Sentry plan doesn't include anomaly detection (Business plan or above) and the API rejects dynamic alerts — re-run with `AUDIO_FALLBACK_ALERT_DETECTION_TYPE=static` to fall back to the legacy absolute-count thresholds (fetch >=15/8, playback >=10/5). The same `PUT` upsert path means a follow-up re-run without the flag flips the same rules back to dynamic.
    Manual fallback: Dashboards → New Dashboard → "Walk Mode Audio Fallback" → add the three panels above. Alerts → Create Alert → Metric Alert → pick `narration.audio_fallback` → create one rule filtered to fetch-side reasons and one filtered to playback-side reasons → set both to **Anomaly Detection** with the per-side sensitivity documented above (fetch `medium`, playback `high`), `seasonality: auto`. Then paste the URLs above so the team can find them.

- **Shared libs**:
  - `lib/api-spec` - OpenAPI specification
  - `lib/api-client-react` - Generated React Query hooks
  - `lib/api-zod` - Generated Zod validation schemas
  - `lib/integrations-openai-ai-server` - OpenAI client integration
  - `lib/db` - Database schema (Drizzle ORM)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages (registered as a validation step)
- `pnpm run build` — typecheck + build all packages
- `pnpm run lint` — ESLint across urban-explorer + api-server (registered as a validation step)
- `pnpm run lint:rules` — run the custom no-pii-in-sentry ESLint rule tests (registered as a validation step)
- `pnpm --filter @workspace/urban-explorer run test` — run the privacy/sentry unit test suite (registered as a validation step)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Security & Dependency Notes

- Dependency overrides in `pnpm-workspace.yaml` enforce minimum secure versions for transitive dependencies (lodash, path-to-regexp, picomatch)
- Catalog entries pin minimum versions for drizzle-orm (^0.45.2), vite (^7.3.2)
- Global Express error handler catches unhandled errors and returns consistent JSON responses
- All AI response JSON.parse calls are wrapped in try-catch with proper error responses
- Frontend JSON.parse calls (navigation params, AsyncStorage) have safe fallbacks

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Reimporting / First-time Setup

If this project is exported as a zip and imported into a new Replit, run the following once from the Shell:

```bash
bash scripts/setup.sh
```

That script installs dependencies and pushes the database schema. Then complete these manual steps:

### Required manual steps after import

1. **OpenAI integration** — open the Integrations tab in the Replit sidebar and connect **OpenAI**. This automatically provisions `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY`. The API server will not start without these.

2. **SESSION_SECRET** — go to Secrets (padlock icon) and add `SESSION_SECRET` set to any long random string. Generate one with `openssl rand -hex 32` in the Shell.

3. **Database** — the PostgreSQL module in `.replit` auto-provisions a fresh database and all `PG*` / `DATABASE_URL` env vars. No action needed, but you must run `pnpm --filter @workspace/db run push` (already done by `setup.sh`) to create the tables.

4. **Optional: Sentry DSN** — add `EXPO_PUBLIC_SENTRY_DSN` to Secrets with the DSN from your Sentry project (Settings → Projects → Client Keys). The mobile app runs fine without it; crash reporting is simply disabled.

5. **Optional: Sentry source map uploads** — these are EAS build-time secrets, not Replit secrets. Set them via the EAS CLI after installing it (`npm install -g eas-cli`):
   ```
   eas secret:create --name SENTRY_AUTH_TOKEN --value <token>
   eas secret:create --name SENTRY_ORG --value <org-slug>
   eas secret:create --name SENTRY_PROJECT --value <project-slug>
   ```
   Without these, crash reports still work but stack traces show minified positions instead of readable file/line info. The `SENTRY_AUTH_TOKEN` is an internal integration token from sentry.io (Settings → Developer Settings → Internal Integrations, needs `project:releases` + `org:read` scopes).

### What is NOT exported

- **Database contents** (user ratings, sessions, saved places stored server-side). The schema is recreated by `db push`, but any existing data is lost. Saved places in the mobile app are stored in AsyncStorage on the device and are unaffected.
- **Secrets** — all values in the Secrets tab must be re-added manually (see above).

### Artifacts and workflows

Service workflows (defined in `.replit`, restart automatically):
- `artifacts/api-server` — Express API server (`pnpm --filter @workspace/api-server run dev`)
- `artifacts/urban-explorer` — Expo mobile app (`pnpm --filter @workspace/urban-explorer run dev`)

Validation workflows (run on demand or as CI gates):
- `privacy-tests` — `pnpm --filter @workspace/urban-explorer run test` (200+ sentry/privacy unit tests)
- `lint-rules` — `pnpm run lint:rules` (ESLint PII rule self-tests)
- `lint` — `pnpm run lint` (ESLint across all source files)
- `typecheck` — `pnpm run typecheck` (TypeScript check across all packages)

All four validations run via the **Project** run button. They are also wired as `isValidation = true` gates in `.replit`.

### Verifying the setup after import

After running `setup.sh`, verify everything is healthy:

```bash
pnpm run typecheck      # should exit 0 (no errors)
pnpm run lint           # should exit 0 (warnings only, no errors)
pnpm run lint:rules     # should print "All tests passed"
pnpm --filter @workspace/urban-explorer run test  # should pass all tests
```

## Reverting features using git

The full git history is preserved in the `.git` folder, which is included when you export the project as a zip. In a new Replit (or any git environment), you can roll back specific features.

### Key feature commits

| Feature | Commit |
|---|---|
| Race condition / stability fixes | `e05014c` |
| expo-dev-client + DevBuildBanner | `19beaeb` |
| Sentry crash reporting (initial) | `ef02ede` |
| Sentry source maps / app.config.js | `e86102e` |
| Walk session context in Sentry | `d4cc389` |
| Narration failure breadcrumbs | `c1c52e8` |
| Narration fallback rate metric | `944d25e` |
| Privacy test suite (jest) | `72ce4de` |
| ESLint PII rule | `8b6a03e` |
| PII scrubbing in arrays | `d83e4b8` |
| beforeBreadcrumb ingestion hook | `7a10412` |
| Multi-word PII fix in scrubString | `38a77e8` |

### How to revert

**Roll the whole project back to a specific point** (destructive — loses all commits after that hash):
```bash
git reset --hard <commit-hash>
```

**Undo a single commit while keeping everything else** (safe, creates a new undo commit):
```bash
git revert <commit-hash>
```

**Remove Sentry entirely** (files to delete):
```bash
rm -rf artifacts/urban-explorer/lib/sentry.ts \
       artifacts/urban-explorer/lib/sentryWalk.ts \
       artifacts/urban-explorer/__tests__/sentry.test.ts \
       artifacts/urban-explorer/__tests__/sentryWalk.test.ts \
       artifacts/urban-explorer/__mocks__ \
       artifacts/urban-explorer/jest.config.js \
       eslint-rules/
```
Then remove the `@sentry/react-native` entry from `artifacts/urban-explorer/package.json`, revert `app.config.js` back to `app.json`, remove the `wrap` call from `app/_layout.tsx`, and remove the `captureException` call from `components/ErrorBoundary.tsx`.

**Find the commit that introduced a file or change:**
```bash
git log --oneline --follow -- artifacts/urban-explorer/lib/sentry.ts
```
