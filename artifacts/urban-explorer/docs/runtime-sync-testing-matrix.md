# Runtime Sync / Testing Matrix

> **Consult this doc any time a code change does not seem to be reflected in the running app or API.**

---

## 1. Purpose

This document exists to prevent testing against stale or wrong runtime layers. Each layer of the Streetlit stack — source code, dev server, production deployment, Metro bundle, native app — is independently versioned and independently refreshed. A change that is committed, CI-green, and even deployed may still not be visible if the wrong layer is being exercised.

Steps that are Replit-specific are labeled **[Replit]** throughout. The document is written to remain useful after migration away from Replit; the equivalent portable step is documented alongside the Replit step in every relevant row.

---

## 2. Core Principle

**GitHub green does not mean the running app or server is fresh.**

CI validates the committed source. It does not restart the dev server, does not rebuild the production deployment, does not re-bundle the Metro client, and does not clear local Simulator state. Any or all of those layers may still be running code from a previous commit. Each layer must be explicitly refreshed before testing against it is valid.

---

## 3. Runtime Layers Table

| Layer                                                   | Current Streetlit / Replit reality                                                                                                                                                           | What changes affect it                                                                                                                                                                                 | How to refresh it now                                                                                                                  | How to verify it                                                                                                                                     | Future portable equivalent                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **GitHub source of truth**                              | `github.com/SarahEspelandRemington/urban-explorer`; HEAD is the canonical state                                                                                                              | Any committed push                                                                                                                                                                                     | `git push` (or GitHub API patch in the Replit sandbox)                                                                                 | `git log -1` / GitHub Actions badge                                                                                                                  | Any hosted git remote                                                   |
| **Replit API Server workflow / dev server** [Replit]    | `pnpm --filter @workspace/api-server run dev`; rebuilds from source on restart; serves `/api/*` inside the Replit preview proxy                                                              | Any change to `artifacts/api-server/src/**`, `lib/**`, or env vars                                                                                                                                     | Restart the `artifacts/api-server: API Server` workflow in Replit                                                                      | `curl localhost:80/api/healthz` returns `{"status":"ok"}`; logs show expected version string or cache key                                            | `npm run dev` / `nodemon` / Docker compose restart                      |
| **Replit production `.replit.app` deployment** [Replit] | Autoscale deployment at `https://city-explorer-guide-sarahremington.replit.app`; built from source at publish time via `pnpm --filter @workspace/api-server run build`                       | Nothing — frozen until next Publish                                                                                                                                                                    | Click **Publish** in Replit UI                                                                                                         | `curl https://city-explorer-guide-sarahremington.replit.app/api/healthz`; check deployment logs for new pid; grep dist for expected symbol/cache key | CI-triggered deploy pipeline (GitHub Actions → cloud provider)          |
| **Metro client bundle**                                 | Expo Metro bundler running inside the Replit Expo workflow or locally on Mac; re-bundles TypeScript/React source on save                                                                     | Any change to `artifacts/urban-explorer/**/*.{ts,tsx,js}`, and **`EXPO_PUBLIC_*` env vars at Metro start**                                                                                             | `expo start --clear` (wipes Metro transform cache); if env vars changed, kill Metro and restart                                        | Shake device → Dev Menu → "Reload"; check network requests from Simulator for expected API URL                                                       | Same: `npx expo start --clear`                                          |
| **Expo dev build / native iOS app**                     | Custom dev client built with `npx expo run:ios`; contains bundled native modules; installed on Simulator or real device                                                                      | Any change to **native dependencies** (`package.json` `dependencies` with `.podspec` / `android/` / `apple/`), `app.config.js` (plugins, permissions, version), or `ios/` / `android/` generated files | `npx expo run:ios` (triggers CocoaPods install + Xcode build + Simulator install)                                                      | App version string in Settings or splash; Metro console shows correct bundle ID                                                                      | `eas build --profile development` for real-device builds                |
| **Expo Go**                                             | Not used for Streetlit — the app uses native modules (`expo-audio`, `react-native-maps`, `react-native-svg`) that Expo Go does not support                                                   | —                                                                                                                                                                                                      | —                                                                                                                                      | If accidental: switch to dev build                                                                                                                   | Same: Expo Go is always unsupported for apps with custom native modules |
| **Simulator local state / AsyncStorage**                | iOS Simulator stores AsyncStorage, saved places, settings, and cached API responses in the Simulator container                                                                               | Any API response that is saved to AsyncStorage; app settings changes                                                                                                                                   | **Soft:** pull-to-refresh in Explore screen. **Hard:** Device → Erase All Content and Settings in Simulator menu (wipes dev build too) | After erase, Explore screen shows no cached places on first load                                                                                     | Same; on real device: reinstall app                                     |
| **API / database cache**                                | In-memory LLM cache (15 min TTL, versioned by `LLM_CACHE_CURRENT_VERSIONS`) and Overpass cache (5 min TTL) inside the running API process                                                    | Cache key version bumps (e.g. `discoverCacheKey` `:v57:`); TTL expiry; server restart                                                                                                                  | Restart the API Server workflow / redeploy production; or wait for TTL                                                                 | Log line `cache miss` vs `cache hit` in API logs; bump cache key version and verify new version appears                                              | Same pattern; version-keyed in-memory or Redis cache                    |
| **Environment variables / `EXPO_PUBLIC_*`**             | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN`, etc. declared in `.env.local` on Mac or as Replit Secrets; **`EXPO_PUBLIC_*` values are baked into the Metro bundle at Metro startup time** | Any change to `.env.local` / Replit Secrets                                                                                                                                                            | Kill Metro and restart (`expo start --clear`); for server vars, restart the API Server workflow                                        | Log the value in a known component on startup; check network request destination URL                                                                 | Same: `.env` file or CI secret injection before Metro start             |
| **GitHub CI / Spec Sync**                               | GitHub Actions runs `pnpm run ci` (typecheck, lint, format, privacy tests, spec-sync, codegen-check) on every push                                                                           | Any committed change                                                                                                                                                                                   | Push to GitHub                                                                                                                         | Actions badge green; no failing checks in the PR                                                                                                     | Same; any CI provider running the same scripts                          |

---

## 4. Common Change Scenarios

### API server source change

Before testing is valid:

1. Save and commit the change.
2. **[Replit]** Restart the `artifacts/api-server: API Server` workflow.
3. Confirm `curl localhost:80/api/healthz` returns 200 and API logs show the expected server version or log line from the new code.
4. If the Simulator points to the production `.replit.app` URL: also **Publish** (see next scenario).

---

### Production API behavior change while Simulator points to `.replit.app`

Before testing is valid:

1. Push changes to GitHub.
2. **[Replit]** Click **Publish** in Replit UI. Wait for the new container to become healthy (watch deployment logs for `request completed` at `/api/healthz`).
3. Confirm the new dist contains the expected symbol: `grep -c "symbolName" artifacts/api-server/dist/index.mjs`.
4. Pull-to-refresh in the Simulator Explore screen (clears client-side React Query cache).
5. If results still look stale, erase Simulator state (see below).

---

### Client TypeScript / React component change

Before testing is valid:

1. Save the file — Metro hot-reloads automatically for JS/TS changes.
2. If hot reload does not pick it up: shake device → Dev Menu → **Reload**.
3. If still stale: `expo start --clear` to wipe the Metro transform cache.

---

### `EXPO_PUBLIC_API_URL` or other `EXPO_PUBLIC_*` change

Before testing is valid:

1. Update the value in `.env.local` (Mac) or Replit Secrets [Replit].
2. **Kill Metro completely** (Ctrl-C).
3. Restart Metro: `npx expo start --clear`.
4. Reload the app. `EXPO_PUBLIC_*` values are not hot-reloaded; they are inlined at bundle time.

---

### Native dependency change

Before testing is valid:

1. Update `package.json` and run `pnpm install`.
2. Run `npx expo run:ios` — this triggers CocoaPods install, Xcode build, and Simulator install.
3. Metro restart alone is **not sufficient**. The dev build must be rebuilt.
4. Note: erasing the Simulator removes the dev build. After an erase, `npx expo run:ios` is required before the app can run again.

---

### App shows stale places / results

Work through in order:

1. Pull-to-refresh on the Explore screen.
2. Confirm the API URL in use (check `.env.local` or network requests from Simulator).
3. `curl` the API directly to confirm expected server behavior.
4. If the API is correct but app still shows stale data: erase Simulator (Device → Erase All Content and Settings), then reinstall dev build with `npx expo run:ios`.

---

### GitHub CI passed but Simulator behavior did not change

CI passing means the source is correct. It does not restart any runtime layer. Check:

1. Was the API server restarted / redeployed after the commit?
2. Was Metro restarted after client changes?
3. Was Simulator local state cleared?

---

### Replit workflow restarted but Simulator behavior did not change [Replit]

The Replit API Server workflow serves only the **dev preview** (`localhost:80/api`). If the Simulator is configured to point to the production `.replit.app` URL, restarting the workflow has no effect on what the Simulator calls.

- Check which API URL is in use (see Section 6 checklist).
- If pointing to production: **Publish** is required.

---

### Replit Publish happened but Simulator still looks stale [Replit]

Publish rebuilds and redeploys the API. The Simulator's local state (AsyncStorage, React Query cache) is independent.

1. Confirm the production deployment is healthy: `curl https://city-explorer-guide-sarahremington.replit.app/api/healthz`.
2. Pull-to-refresh in the Explore screen.
3. If still stale: erase Simulator state. Note that erasing the Simulator removes the dev build — `npx expo run:ios` will be needed afterward.

---

## 5. Streetlit-Specific Lessons Learned

- **Simulator points to production.** The Mac `.env.local` sets `EXPO_PUBLIC_API_URL=https://city-explorer-guide-sarahremington.replit.app`. All API calls from the Simulator go to the production `.replit.app` endpoint, not the Replit dev workflow. [Replit]

- **Restarting the Replit API Server workflow does not update the production `.replit.app` deployment.** The two are completely independent runtime layers. Dev workflow restart ≠ production redeploy. [Replit]

- **`EXPO_PUBLIC_*` values are baked into the Metro bundle at Metro startup.** Changing a `.env.local` value and hot-reloading is not enough — Metro must be killed and restarted with `--clear`.

- **Clearing Simulator state may require erasing the Simulator.** Pull-to-refresh clears the React Query in-memory cache. AsyncStorage persists across Metro restarts and even app quits. A full erase (Device → Erase All Content and Settings) is the only reliable reset.

- **Erasing the Simulator removes the dev build.** After an erase, `npx expo run:ios` is required to reinstall the custom dev client before Metro can deliver a bundle to it.

- **Native dependency changes require rebuilding the dev client, not just restarting Metro.** After `pnpm add <native-package>`, Metro will fail to resolve the native module until `npx expo run:ios` has run CocoaPods and rebuilt the Xcode target.

- **Sentry upload can block local iOS builds unless disabled or allowed to fail.** If Sentry source map upload is enabled and credentials are absent, the Xcode build phase will hang or fail. Disable the Sentry build phase or set `SENTRY_DISABLE_AUTO_UPLOAD=true` for local builds.

- **Generic commercial suppression (`filterGenericCommercial`) required the full cycle before it was verified in Simulator.** Working sequence: source edit → GitHub push → Replit Publish → deployment healthcheck confirmed → Simulator Erase All Content → `npx expo run:ios` to reinstall dev build → Metro restart → pull-to-refresh. Skipping any step produced stale results.

---

## 6. Minimal Verification Checklist Before Field / Simulator Testing

1. **What API URL is the client using?** Check `.env.local` (Mac) or `EXPO_PUBLIC_API_URL` in the running bundle. Confirm it points to the layer you intend to test.

2. **Was the relevant server runtime rebuilt / redeployed?**
   - Dev server: was the Replit API Server workflow restarted? [Replit]
   - Production: was Replit Publish completed and the new container healthy? [Replit]

3. **Was Metro restarted if client or env vars changed?** `expo start --clear` after any `EXPO_PUBLIC_*` change or suspected transform-cache staleness.

4. **Was Simulator / app local state cleared if stale results are suspected?** At minimum, pull-to-refresh. For full reset: erase Simulator, then `npx expo run:ios`.

5. **Does a direct `curl` to the API show the expected behavior?** Isolate the server layer before blaming the client. Example: `curl -X POST <API_URL>/api/explore/discover -H 'Content-Type: application/json' -d '{...}'`.

6. **Does the debug overlay confirm request mode / trust fields where available?** The Walk Mode debug overlay (Settings → Developer → Walk Debug Overlay) surfaces heading source, eligibility counts, and rejection reasons in real time.

---

## 7. Migration Note

Making these layers explicit is part of a plan to migrate off Replit to a cleaner, more portable stack. Every step labeled **[Replit]** in this document is a candidate for replacement:

- The Replit API Server workflow → a standard `nodemon`/Docker dev server.
- Replit Publish / autoscale deployment → a CI-triggered deploy pipeline (e.g. GitHub Actions → Railway, Fly.io, or similar).
- Replit Secrets → `.env` files, GitHub Actions secrets, or a secrets manager.
- Replit preview proxy → direct `localhost` in development, production domain in staging/prod.

The goal is that every row in the table above has a portable, non-Replit equivalent that any developer can operate from their own machine. The verification steps (healthz curl, dist grep, Metro reload, Simulator erase) are already portable and will remain valid after migration.
