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
    - `WalkModeContext` manages location watching, proximity detection (~50m), and narration queue
    - `useNarration` hook wraps expo-speech (native) / Web Speech API with queue, pause/resume/skip
    - Platform-specific maps (native MapView vs Leaflet web map)
  - AsyncStorage for persisting saved places
  - Design tokens: warm earthy palette in `constants/colors.ts` — dark mode: warm charcoal `#242220` background with copper `#D4845A` primary, category accents (sage `#8A9A86`, terracotta `#B4846C`, mauve `#988496`). Light mode: cream `#F5F3F0` with copper `#9C5A2E` primary, mutedForeground `#5C5752` (WCAG AA). Category colors/icons centralized in `constants/categories.ts`.
  - **Accessibility**: Full WCAG AA compliance — all interactive elements have `accessibilityRole`, `accessibilityLabel`, `accessibilityState`; all touch targets 44×44px minimum with `hitSlop={20}`; filter chip text 12px; badge text 12px; narration labels 12px; walk-mode narration/loading cards use `accessibilityLiveRegion="polite"` for screen reader announcements.
  - **Glanceable card layout**: Hero card for nearest place (22px bold name, walk-time badge, summary) + compact single-row cards for the rest (icon + name + walk time). Optimized for walking users who need quick identification without stopping. Distances shown as walk time ("2 min", "< 1 min") instead of raw meters.

- **API server** (`artifacts/api-server`): Express backend
  - `POST /api/explore/discover` - Takes lat/lng, returns AI-generated facts about nearby places (with tags, addresses, confidence levels). Supports `mode: "quick"` for faster map panning discovery (gpt-4.1-mini, 500m radius, 8-12 places) vs default `"full"` mode (gpt-5.2, 300m, 5-7 places). OSM Overpass results are cached (5min TTL, 200m distance match) to speed up nearby queries.
  - `POST /api/explore/geocode` - Converts location name to lat/lng coordinates via AI
  - `POST /api/explore/place-detail` - Returns detailed history for a specific place
  - `POST /api/explore/place-timeline` - "Time Travel" feature: generates 4-6 historical eras showing how a place transformed through time (gpt-4.1-mini)
  - `POST /api/explore/walk-narration` - Generates brief tour-guide-style narrations for TTS (gpt-4.1-nano)
  - `POST /api/explore/suggest-locations` - AI-powered location autocomplete (gpt-4.1-nano)
  - **LLM result caching**: In-memory cache (15min TTL, 200 entry max) for all AI-backed endpoints (discover, place-detail, place-timeline, geocode, suggest-locations). Cache keys include all prompt-shaping inputs (place name, category, yearBuilt, coordinates, radius, mode) to prevent stale data. Coordinates rounded to 4 decimal places (~11m precision).
  - Uses OpenAI GPT-5.2 for discover, gpt-4.1-mini for detail, gpt-4.1-nano for narration/geocode/suggest
  - Discover prompt includes numbered priority list, BAD/GOOD examples, quality standards, and HONESTY RULE
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
