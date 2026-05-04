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
  - Uses OpenAI gpt-4.1 for discover, gpt-4.1-mini for detail/timeline/deep-narration, gpt-4.1-nano for walk-narration/geocode-fallback/suggest-fallback
  - Discover prompt includes numbered priority list (7 categories, including social history: gang territories, labor unions, ethnic organizations, political machines), BAD/GOOD examples, quality standards, and HONESTY RULE. Every discovery must anchor to a single specific locatable point — no vague area descriptions. Tags expanded to include: `labor history`, `ethnic community`, `gang territory`, `political machine`, `immigrant organization`, `working class`, `displacement`.
  - **Coordinate verification**: `postProcessPlaces` runs a Nominatim geocode check on every medium/low-confidence place that has an address. If the AI-returned coordinates and the geocoded address disagree by >50m, the verified coordinates replace the AI's. High-confidence (OSM-backed) places are skipped. Nominatim failures fall back to AI coordinates gracefully.
  - **OpenStreetMap grounding**: `fetchNearbyOSMPlaces()` queries Overpass API for historic sites, heritage, tourism, notable buildings, cemeteries, and memorials nearby; results are sanitized and injected into the user message so the AI attaches history to verified locations. Overpass query is optimized with targeted building type filters (not broad `amenity`), 25-result limit at source, 4-5s query timeouts, and a competitive `Promise.race` timeout (3-4s) so discovery proceeds without OSM data if the external API is slow
  - `postProcessPlaces()` validates fields, enforces 1.25x radius tolerance, deduplicates by name/coords, filters vague content, validates confidence enum, sorts by distance
  - OSM text inputs are sanitized (control chars stripped, length-capped) to prevent prompt injection

- **Crash reporting** (`artifacts/urban-explorer/lib/sentry.ts`, `lib/sentryWalk.ts`):
  - `sentry.ts` initializes Sentry at module load time (before any render), gated on `EXPO_PUBLIC_SENTRY_DSN`. When absent, all exports are no-ops.
  - PII protection: `isPiiKey` + recursive `scrubObject` strip lat/lon/place/address/name/narration/altitude/heading/speed keys from `event.extra` and `event.contexts`. `scrubString` redacts keyed PII patterns (e.g. `name: "Central Park"`) from breadcrumb and event messages. `beforeAddBreadcrumb` hook drops all non-walk breadcrumbs at SDK ingestion time; walk breadcrumbs have their `data` and `message` scrubbed at that point too. `beforeSend` is a second pass: same filters applied before the event leaves the device.
  - `sentryWalk.ts` provides `setWalkScope()` (stamps current walk state onto the Sentry scope) and `addWalkBreadcrumb()` (adds a walk-category breadcrumb with ingestion-time PII scrubbing). Called from `WalkModeContext.tsx` on walk start/stop, place visited, narration fetched, and fetch errors.
  - Sentry metrics: `trackNarrationFallback(reason)` increments `narration.audio_fallback` counter with a `reason` tag to track TTS fallback rates. `trackPrefetchEvent(event)` increments `narration.prefetch_event` counter (tagged `event` ∈ `HIT | MISS | STALE_DISCARD | STOP_WALK_DISCARD | DEDUPE`) for every narration prefetch outcome — see "Sentry Dashboards & Alerts" below for the saved panel and regression alert wired off this metric.
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
  - **Walk Mode Prefetch hit-rate alert** — Metric Alert in Sentry that pages on prefetch-pipeline regressions.
    - **Alert URL**: _to be filled in once created — paste the `https://<org>.sentry.io/alerts/rules/details/<id>/` link here._
    - Dataset: Metrics → `narration.prefetch_event`
    - Same equation as Panel 2 above (`100 * A / (A + B + C)`)
    - Time window: **1 hour**, evaluated every 5 minutes
    - **Critical** when the equation is `< 60` for the window
    - **Warning** when the equation is `< 75` for the window
    - Resolve when the value returns above the threshold for one full window
    - Minimum sample-size guard: also require `A + B + C >= 20` over the window so a quiet hour with two events doesn't page the team. Configure as a secondary trigger condition (alert only fires when both the percentage trigger and the volume trigger are true).
    - Owner / route to: the Walk Mode on-call channel (Slack/Email destination set on the Sentry side).
  - **How to create (or recreate) the dashboard + alert** — automated via a one-shot script:
    ```bash
    SENTRY_AUTH_TOKEN=<token-with-org:read+project:read+project:write+alerts:write> \
    SENTRY_ORG=<org-slug> \
    SENTRY_PROJECT=<project-slug> \
    pnpm --filter @workspace/scripts run setup:sentry-walk-dashboard
    ```
    The script (`scripts/src/setupSentryWalkPrefetchDashboard.ts`) is idempotent: it reuses an existing "Walk Mode Prefetch" dashboard / "Walk Mode prefetch hit rate" alert rule if found, otherwise creates them via the Sentry REST API. On success it patches the **Dashboard URL** and **Alert URL** lines above with the real links, so future readers can click straight through. The alert is created without notification actions — open the printed Alert URL once and add the on-call Slack/Email target so it actually pages.
    Manual fallback if the script can't be run: Dashboards → New Dashboard → "Walk Mode Prefetch" → add the two panels above. Alerts → Create Alert → Metric Alert → pick `narration.prefetch_event` → paste the equation → set thresholds. Then paste the URLs above so the team can find them.
  - **Walk Mode Audio Fallback dashboard** — saved Sentry dashboard that charts the natural-voice TTS fallback rate over time off the `narration.audio_fallback` metric (emitted by `trackNarrationFallback` in `lib/sentryWalk.ts`, called from every fallback path in `lib/fetchNarrationPayload.ts`). When the gpt-audio pipeline degrades (OpenAI outage, server-side cache bug, or a client-side `write_failure` spike on a new OS version) users silently fall back to robotic system speech — this dashboard makes that visible.
    - **Audio Fallback Dashboard URL**: _to be filled in once created — paste the `https://<org>.sentry.io/dashboard/<id>/` link here._
    - **Panel 1 — "Audio fallback events by reason" (stacked area, 24h)**
      - Metric: `narration.audio_fallback` (counter), aggregate `sum`
      - Group by tag: `reason`
      - Visualization: stacked area chart so `write_failure` / `endpoint_error` / `bad_response` are visible side-by-side over time. A spike in any single `reason` points at a specific failure mode (write_failure → client/OS issue, endpoint_error → network/timeout, bad_response → server/upstream issue).
    - **Panel 2 — "Total narration volume" (line, 24h, 5-min buckets)**
      - Metric: `narration.prefetch_event` (counter), aggregate `sum`, no `event` filter
      - Provides **approximate** denominator context: every narration emits at least one prefetch event, but the same metric also counts lifecycle events like `DEDUPE` and `STOP_WALK_DISCARD`, so the sum slightly over-counts true narrations played. Good enough as a volume sanity check — a high fallback count next to a low volume is background noise; a high count next to high volume is a real regression.
    - **Panel 3 — "Audio fallback rate %" (line, 24h, 5-min buckets)**
      - Equation: `100 * sum(narration.audio_fallback) / sum(narration.prefetch_event)`
      - In Sentry's "Add Equation" UI: define two queries (`A` = audio_fallback sum, `B` = prefetch_event sum) and use equation `100 * A / B`.
      - Y-axis: 0–100, threshold line at `10`.
      - Read this as an **approximate** rate (denominator caveat above). For a tighter rate once narration volume is well-understood, swap the denominator for a dedicated `narration.played` counter or filter `event:HIT|MISS|STALE_DISCARD` to exclude lifecycle noise.
  - **Walk Mode Audio Fallback rate alert** — Metric Alert in Sentry that pages on TTS-pipeline regressions.
    - **Audio Fallback Alert URL**: _to be filled in once created — paste the `https://<org>.sentry.io/alerts/rules/details/<id>/` link here._
    - Dataset: Metrics → `narration.audio_fallback`
    - Aggregate: `sum(narration.audio_fallback)` (no `reason` filter — fires on any reason)
    - Time window: **1 hour**, evaluated every 5 minutes
    - **Critical** when `sum >= 15` over the window (**approximate** placeholder for ~> 10% of typical hourly walk volume)
    - **Warning** when `sum >= 8` over the window (**approximate** placeholder for ~> 5% of typical hourly walk volume)
    - Resolve when the value returns below `5` for one full window
    - **Why count and not rate**: Sentry Metric Alerts can't fire on a cross-metric equation, so the alert uses the absolute fallback count as a proxy. The thresholds above are seeded guesses — they MUST be retuned in the Sentry UI once real hourly walk volume is observed, otherwise the alert will either page on noise (if real volume is low) or stay silent through real regressions (if real volume is much higher than assumed). The dashboard's Panel 3 carries the true rate-based view for humans.
    - Minimum-volume guard: the absolute-count thresholds are themselves the guard — a quiet hour with one or two failures naturally stays under the warning line.
    - Owner / route to: the Walk Mode on-call channel (Slack/Email destination set on the Sentry side).
  - **How to create (or recreate) the audio-fallback dashboard + alert** — automated via a one-shot script (mirrors the prefetch script above):
    ```bash
    SENTRY_AUTH_TOKEN=<token-with-org:read+project:read+project:write+alerts:write> \
    SENTRY_ORG=<org-slug> \
    SENTRY_PROJECT=<project-slug> \
    pnpm --filter @workspace/scripts run setup:sentry-walk-audio-dashboard
    ```
    The script (`scripts/src/setupSentryWalkAudioFallbackDashboard.ts`) is idempotent: it reuses an existing "Walk Mode Audio Fallback" dashboard / "Walk Mode audio fallback rate" alert rule if found, otherwise creates them via the Sentry REST API. On success it patches the **Audio Fallback Dashboard URL** and **Audio Fallback Alert URL** lines above with the real links. The alert is created without notification actions — open the printed Alert URL once and add the on-call Slack/Email target so it actually pages.
    Manual fallback: Dashboards → New Dashboard → "Walk Mode Audio Fallback" → add the three panels above. Alerts → Create Alert → Metric Alert → pick `narration.audio_fallback` → set the absolute-count thresholds. Then paste the URLs above so the team can find them.

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
