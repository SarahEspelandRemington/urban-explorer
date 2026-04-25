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

- **Shared libs**:
  - `lib/api-spec` - OpenAPI specification
  - `lib/api-client-react` - Generated React Query hooks
  - `lib/api-zod` - Generated Zod validation schemas
  - `lib/integrations-openai-ai-server` - OpenAI client integration
  - `lib/db` - Database schema (Drizzle ORM)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
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

Both workflows are defined in `.replit` and restart automatically:
- `artifacts/api-server` — Express API server (`pnpm --filter @workspace/api-server run dev`)
- `artifacts/urban-explorer` — Expo mobile app (`pnpm --filter @workspace/urban-explorer run dev`)
