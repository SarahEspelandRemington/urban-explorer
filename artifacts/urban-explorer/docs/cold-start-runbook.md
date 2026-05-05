# Cold-start triage runbook

This document walks through how to diagnose a regression in Urban Explorer's
cold-start time. It is paired with the instrumentation in
`lib/coldStart.ts` and the deferral patterns introduced in
`lib/auth.tsx`, `contexts/UserRatingsContext.tsx`,
`contexts/WalkModeContext.tsx`, and `lib/startupStorage.ts`.

## What "cold start" means here

A cold start begins the moment the OS launches the JS bundle for our process
and ends when the user can interact with the first useful screen. We split
that window into the following phases, each emitted as a Sentry tag and a
walk-category breadcrumb:

| Phase                   | Where it's marked                                                                            | Typical budget on a 2022-class Android |
| ----------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `bundleStart`           | Auto, at first import of `lib/coldStart.ts`                                                  | 0 ms (origin)                          |
| `providersMounted`      | `app/_layout.tsx` mount effect                                                               | < 250 ms                               |
| `splashHidden`          | `app/_layout.tsx` after `SplashScreen.hideAsync()`                                           | < 350 ms                               |
| `firstInteractiveFrame` | `app/_layout.tsx` after rAF→rAF on mount (fires regardless of which tab the router lands on) | < 500 ms                               |
| `fontsLoaded`           | `useFonts` resolved                                                                          | < 1500 ms (non-blocking)               |
| `authUserResolved`      | `lib/auth.tsx` after `/api/auth/user` returns                                                | < 800 ms                               |
| `exploreFirstResponse`  | `app/(tabs)/index.tsx` first `discoverMutation` settles                                      | < 2500 ms                              |

Each phase is a one-shot — only the first call per process lands on the
recorder. Warm reloads / route changes do not move the dial.

## Reading the data in Sentry

Every cold launch ships one `cold_start_complete` info-level event when the
`firstInteractiveFrame` phase fires. That event carries:

- `message:cold_start_complete`
- `level:info`
- `startup.kind=cold` and `startup.platform=ios|android|web`
- One `coldStart.<phase>Ms` tag per phase that was recorded before the
  terminal marker (typically all of `bundleStart`, `providersMounted`,
  `splashHidden`, `firstInteractiveFrame`, plus whichever of `fontsLoaded`
  / `authUserResolved` / `exploreFirstResponse` happened to land first)
- A breadcrumb trail with one `coldStart_phase` crumb per phase, so even a
  later crash report includes the boot timeline.

The full path we care about is `bundleStart` → `firstInteractiveFrame`.
That single delta is the user-perceived cold-start time. The intermediate
phases (`providersMounted`, `splashHidden`, `authUserResolved`,
`exploreFirstResponse`) explain _where_ time was spent if the total moves.

The `firstInteractiveFrame` recorder is one-shot per process, so warm route
changes never inflate the dataset.

### Suggested Sentry queries

In Sentry → Discover → "All Events" (the project the mobile app reports
to), build queries against the `cold_start_complete` event. Tags are
strings, so use the `to_number()` cast.

P50 / P75 / P95 of total cold-start time, last 7 days, Android only:

```
project:urban-explorer
message:cold_start_complete
startup.kind:cold
startup.platform:android
has:coldStart.firstInteractiveFrameMs
```

In the visualization panel, set:

- y-axis: `p50(to_number(tags[coldStart.firstInteractiveFrameMs]))`,
  `p75(...)`, `p95(...)`
- x-axis: time, 1-day buckets
- group by: `release` (so a regression is pinned to the deploy that caused it)

To slice a specific phase regression:

1. Filter `message:cold_start_complete startup.kind:cold` plus the platform
   you care about.
2. Sort/group by `coldStart.providersMounted` (or whichever phase is suspect)
   and look for a step change after a deploy.
3. Drill into a single event and read its breadcrumbs: every
   `coldStart_phase` crumb has the phase name and `elapsedMs` so you can
   see the whole timeline.

### Verifying the pipeline is alive

A new build should produce one `cold_start_complete` event per cold launch.
If the count drops to zero after a deploy, check (in this order):

1. `EXPO_PUBLIC_SENTRY_DSN` is set in the build's env.
2. `lib/sentry.ts` `Sentry.init()` ran (no top-level throw before it).
3. The `firstInteractiveFrame` marker still fires — see the rAF→rAF effect
   in `app/_layout.tsx`.
4. `beforeSend` in `lib/sentry.ts` did not start dropping the message.

## Common regressions and where to look

### "Splash sticks for 1+ seconds"

Most likely a synchronous import added to a file in the boot graph (anything
imported transitively from `app/_layout.tsx` before the first `useEffect`).

- Check `providersMounted` vs `splashHidden`. If `providersMounted` itself
  is high, JS evaluation is the culprit. Look at recent additions to
  `app/_layout.tsx`, the `Provider` files, or `lib/loginFlow.ts`. Avoid
  importing heavy modules at top level — wrap them in dynamic imports or
  hooks that only run on a screen that needs them.
- If `providersMounted` is fine but `splashHidden` is high, `SplashScreen.hideAsync`
  is being delayed by a long synchronous render or by reverted changes that
  re-introduce `if (!fontsLoaded) return null` guards in `RootLayout`.

### "Login screen flashes a discovery hit"

`AuthSession.useAutoDiscovery(ISSUER_URL)` lives in `lib/loginFlow.ts` and
is intentionally only mounted from the login screen. If you see the OIDC
discovery request firing on every cold start in network logs, somebody
re-introduced it into `AuthProvider` or another always-mounted provider.

### "Walk tab freezes on entry"

`createStalePrefetchPool` is lazy-allocated via `getStalePrefetchPool()`
inside `WalkModeContext`. The first call is on the path to `consumePrefetchedNarration`
or `prefetchNext`. If the walk tab feels slow on the very first visit, look
at:

- The pool factory itself — it must stay cheap (pure data, no I/O).
- The `Location.requestForegroundPermissionsAsync()` call, which is async
  but contention-prone on Android. Consider pre-warming permissions earlier
  in the user journey if this becomes a hotspot.

### "Storage reads are slow"

`lib/startupStorage.ts` performs a single `multiGet` for every
known boot-time key. Adding a new persisted preference?

- Add the key to `STARTUP_KEYS`.
- Read it via `getStartupValue(STARTUP_KEYS.<name>)` from the consuming
  provider — never call `AsyncStorage.getItem` directly during mount.
- Writes can stay as direct `AsyncStorage.setItem` calls; the cache is
  read-through-once, so subsequent reads will see the new value on the next
  cold start.

## Rolling back a regression

Cold-start changes are isolated to a small set of files. Reverts of any of
the following are usually safe:

- `lib/coldStart.ts` — removes instrumentation, no behaviour change.
- `lib/loginFlow.ts` + `lib/auth.tsx` — re-merging `useAuthRequest` /
  `useAutoDiscovery` back into `AuthProvider` restores the old eager-OIDC
  behaviour at the cost of cold-start time.
- `lib/startupStorage.ts` — switching consumers back to `AsyncStorage.getItem`
  serialises N reads but otherwise preserves behaviour.

If the splash starts blocking again, check whether `app/_layout.tsx` was
edited to gate the render on `fontsLoaded`. The current implementation
intentionally renders the shell before fonts; a short FOUT is preferred over
a long splash.

## Manual verification checklist

We don't run device benchmarks in CI, so any change touching boot performance
should be verified by hand:

- [ ] Cold-launch the app on a 2022-class Android device with the network
      throttled to "Fast 3G". Splash should disappear in < 1 s.
- [ ] Verify the first tab renders before the Inter weights swap in (you'll
      see a brief font swap — that's expected).
- [ ] Open Walk tab as a brand-new user; the welcome card appears once and
      stays dismissed across launches.
- [ ] Open Explore as a brand-new user; the screen never shows a blank
      `ActivityIndicator` for more than ~600 ms before the seeded fix
      arrives.
- [ ] Confirm the OIDC discovery request fires only when navigating to
      `/login`, not on cold launch (see network tab).
