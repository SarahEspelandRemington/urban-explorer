# Threat Model

## Project Overview

Urban Explorer is a pnpm workspace containing a production Expo/React Native client in `artifacts/urban-explorer` and an Express 5 API in `artifacts/api-server`. The app accepts user location or typed place names, then calls backend endpoints that use OpenAI plus OpenStreetMap/Overpass and OSRM to generate nearby-history discovery, place detail, narration, geocoding, and walking-route experiences. The production client is public-facing, the API appears publicly reachable from the client domain, and the `artifacts/mockup-sandbox` Vite app is development-only unless future scans prove production reachability.

Assumptions propagated from the scan environment: production traffic is protected by platform TLS, `NODE_ENV` is `production`, and the mockup sandbox is not deployed to production.

## Assets

- **Precise user location and route data** — current coordinates, route geometry, start/end addresses, and nearby-place context. Exposure would reveal sensitive user movement and physical whereabouts.
- **OpenAI-backed compute budget and API capacity** — multiple endpoints translate unauthenticated user input into paid or quota-limited LLM calls. Abuse can create cost spikes or deny service to legitimate users.
- **Application availability** — all user value depends on the API remaining responsive despite public, potentially bursty traffic and third-party dependency failures.
- **Prompt context and generated content integrity** — OSM-derived place context and user-provided place names/queries shape AI responses. The server must prevent malformed upstream data from degrading outputs or creating unsafe amplification paths.
- **Deployment secrets and infrastructure credentials** — `AI_INTEGRATIONS_OPENAI_*` and `DATABASE_URL` environment variables are high-value secrets even if the current app uses the database minimally.

## Trust Boundaries

- **Client to API** — all `/api/*` requests originate from an untrusted public client. The server must validate, bound, and rate-limit all input.
- **API to OpenAI** — user input becomes model prompts on paid backend credentials. This is a high-risk cost and availability boundary.
- **API to Overpass / OSRM** — server-side outbound fetches to public third-party services can be used to amplify attacker traffic or stall request handling if not constrained.
- **Public endpoint to internal caches** — in-memory caches reduce repeated work but do not authenticate callers; cache design affects abuse resistance and stale-data exposure.
- **Production to dev-only artifacts** — `artifacts/mockup-sandbox` is treated as out of scope for production vulnerabilities unless separately exposed.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, Expo app entry via `artifacts/urban-explorer/app/_layout.tsx`
- **Highest-risk code area**: `artifacts/api-server/src/routes/explore/index.ts`
- **Public surfaces**: all `/api/explore/*` routes plus `/api/healthz`; no authenticated or admin-only server surfaces currently present
- **Shared libraries worth checking**: `lib/api-zod`, `lib/api-client-react`, `lib/integrations-openai-ai-server`, `lib/db`
- **Usually dev-only / ignore unless proven reachable**: `artifacts/mockup-sandbox`, build scripts, generated dist artifacts

## Threat Categories

### Spoofing

The current production API surface appears intentionally public and does not implement user authentication. That makes caller identity untrusted by default. Any future privileged, quota-sensitive, or user-specific endpoint MUST add server-side authentication rather than relying on client behavior or obscurity.

### Tampering

All client input is attacker-controlled. The API MUST validate both structure and bounds for coordinates, route geometry, free-text prompts, and route-planning parameters before using them in CPU-heavy logic, cache keys, or upstream requests. Third-party map data that is passed into prompts MUST continue to be sanitized before model use.

### Information Disclosure

The app handles precise location and route data, which is sensitive even without formal user accounts. Responses, logs, and error paths MUST avoid exposing secrets, stack traces, raw cookies, or unnecessary location history. Public APIs should return only the minimum information needed for the client experience.

### Denial of Service

This project is highly exposed to DoS and cost-amplification risk because public endpoints trigger expensive OpenAI, Overpass, and OSRM operations. Production guarantees should include request-size bounds, cardinality limits, timeouts, caching, and endpoint-level abuse controls such as rate limiting or caller gating so a third party cannot turn the backend into an unrestricted public compute proxy.

### Elevation of Privilege

There are no current admin surfaces, but privilege expansion can still happen indirectly through unsafe server-side capabilities. The API MUST keep outbound hosts fixed, avoid user-controlled server-side fetch destinations, and prevent injection or unbounded processing paths that could let public callers exercise more backend capability than intended.
