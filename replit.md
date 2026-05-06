# Urban Explorer

A mobile app that surfaces AI-generated historical and factual information about buildings and spaces based on the user's GPS location.

## Run & Operate

- `pnpm run typecheck`: Type-check all packages.
- `pnpm run build`: Type-check and build all packages.
- `pnpm run lint`: Run ESLint for `urban-explorer` and `api-server`.
- `pnpm --filter @workspace/api-spec run codegen`: Regenerate API hooks and Zod schemas.
- `pnpm --filter @workspace/db run push`: Push DB schema changes (development only).
- `pnpm --filter @workspace/api-server run dev`: Run API server locally.

**Required Environment Variables:**

- `AI_INTEGRATIONS_OPENAI_BASE_URL` (provisioned by Replit OpenAI integration)
- `AI_INTEGRATIONS_OPENAI_API_KEY` (provisioned by Replit OpenAI integration)
- `SESSION_SECRET`: A long random string (e.g., `openssl rand -hex 32`).
- `EXPO_PUBLIC_SENTRY_DSN`: (Optional) Sentry DSN for crash reporting.

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo (React Native)
- **Lint**: ESLint v9 flat config
- **Formatting**: Prettier
- **AI**: OpenAI via Replit AI Integrations

## Where things live

- `artifacts/urban-explorer/`: Expo React Native mobile application.
- `artifacts/api-server/`: Express API backend.
- `lib/api-spec/`: OpenAPI specification (source of truth for API contracts).
- `lib/db/`: Drizzle ORM database schema (source of truth for DB schema).
- `artifacts/urban-explorer/constants/colors.ts`: Design tokens (theme colors).
- `artifacts/urban-explorer/constants/categories.ts`: Category colors and icons.
- `artifacts/urban-explorer/constants/buildingTypeGroups.ts`: Building type filter definitions.
- `app.config.js`: Dynamic Expo configuration.

## Architecture decisions

- **AI Model Selection**: Uses specific OpenAI models (gpt-4.1-mini, gpt-4.1-nano) tuned for different API endpoints to balance speed, cost, and detail.
- **Location Grounding**: Prioritizes Nominatim (OpenStreetMap) for geocoding and location suggestions, falling back to LLMs for ambiguity. Integrates Overpass API to ground AI-generated history with verified OSM data.
- **Walk Mode Narration**: Prioritizes native pre-rendered MP3 audio via `expo-audio` for natural-voice TTS, falling back to `expo-speech` or Web Speech API. Includes a custom "Now Playing" module for lock screen integration.
- **Dynamic Map Discovery**: Implements a debounced auto-discovery mechanism (150m+ pan) for map views, accumulating and deduplicating markers.
- **Robust Caching & In-Flight Dedup**: In-memory caches for LLM results (15min TTL) and Overpass results (5min TTL). Concurrent cache-miss requests for the same key are coalesced onto a single LLM/TTS call via in-flight Maps (`inFlightNarration`, `inFlightAudio`, `inFlightDetail`), preventing duplicate paid API calls.
- **OSRM Provider Racing**: Route endpoint races multiple OSRM providers with `Promise.any()` and returns the fastest successful result. Distinguishes reachable-but-no-route (404) from all-providers-failed (502).
- **Privacy by Design**: Extensive PII scrubbing and anonymization for Sentry crash reporting, tested with a dedicated test suite and enforced by a custom ESLint rule.

## Product

- **Location-based Discovery**: Users discover historical facts about nearby places using GPS or manual search.
- **Walk Mode**: Provides pre-planned routes with OSRM, real-time proximity-based narration, and building type filtering.
- **Place Details & Timeline**: Offers detailed historical information and a "Time Travel" feature visualizing changes over eras.
- **Saved Places**: Users can bookmark interesting locations.
- **Accessibility**: Designed for WCAG AA compliance with appropriate roles, labels, and touch targets.
- **Crash Reporting & Monitoring**: Integrated Sentry for robust crash reporting, with custom dashboards and anomaly-detection alerts for narration prefetch hit rates and audio fallback rates.

## User preferences

- _Populate as you build_

## Gotchas

- **OpenAI Integration**: The API server requires the Replit OpenAI integration to be connected to provision necessary environment variables.
- **Secrets**: `SESSION_SECRET` must be manually added to Replit Secrets. Sentry source map upload secrets are EAS build-time secrets, not Replit secrets.
- **Database**: Database contents are _not_ exported. `db push` recreates the schema but wipes data.
- **PII Scrubbing**: Be mindful of PII when interacting with Sentry calls, as sensitive data is automatically scrubbed. Use the custom ESLint rule `no-pii-in-sentry.mjs` to detect potential leaks.
- **Sentry Anomaly Detection**: Requires ~7 days of history to build a reliable baseline. Use `PREFETCH_ALERT_DETECTION_TYPE=static` or `AUDIO_FALLBACK_ALERT_DETECTION_TYPE=static` for setup scripts if history is insufficient or Sentry plan doesn't support it.
- **Legacy Sentry Alerts**: If migrating from older Sentry configurations, ensure legacy combined audio fallback alerts are manually disabled/deleted to avoid double-paging.

## Pointers

- **pnpm workspaces**: [https://pnpm.io/workspaces](https://pnpm.io/workspaces)
- **Drizzle ORM**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **Zod**: [https://zod.dev/](https://zod.dev/)
- **Orval**: [https://orval.dev/](https://orval.dev/)
- **Expo Documentation**: [https://docs.expo.dev/](https://docs.expo.dev/)
- **Sentry Documentation**: [https://docs.sentry.io/](https://docs.sentry.io/)
- **Replit AI Integrations**: [https://docs.replit.com/ai/integrations](https://docs.replit.com/ai/integrations)
