import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

import { addWalkBreadcrumb } from "./sentryWalk";

/**
 * Cold-start instrumentation.
 *
 * Records the wall-clock time of each phase of app boot relative to the JS
 * bundle start, so Sentry events generated during or shortly after launch
 * carry a snapshot of where the time went.
 *
 * Phases (typical order):
 *   - bundleStart         — module evaluation begins (auto-recorded on import)
 *   - providersMounted    — RootLayout's provider tree finished mounting
 *   - splashHidden        — SplashScreen.hideAsync() returned
 *   - firstInteractiveFrame — landing tab painted its first usable content
 *   - fontsLoaded         — non-critical: custom fonts swapped in
 *   - authUserResolved    — /api/auth/user fetch resolved (or short-circuited)
 *   - exploreFirstResponse — first /api/explore/discover response landed
 *
 * The data is reported two ways so we can slice it later without setting up
 * a full performance dashboard:
 *
 *   1. As a Sentry tag on the *first* phase (cold-start session marker) plus
 *      individual `coldStart.<phase>Ms` tags for each subsequent phase. Tags
 *      are searchable and persisted on every event captured during the boot
 *      window.
 *   2. As a single "walk" breadcrumb (so it's preserved by the existing PII
 *      filter in beforeAddBreadcrumb) per phase. Breadcrumbs already carry a
 *      timestamp and platform context, so a crash report includes a complete
 *      boot trace.
 *
 * No fetches are issued and no PII is captured — only opaque phase names and
 * monotonic millisecond deltas.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export type ColdStartPhase =
  | "bundleStart"
  | "providersMounted"
  | "splashHidden"
  | "firstInteractiveFrame"
  | "fontsLoaded"
  | "authUserResolved"
  | "exploreFirstResponse";

const recorded = new Map<ColdStartPhase, number>();

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

const startMs = now();
recorded.set("bundleStart", 0);

if (DSN) {
  try {
    const scope = Sentry.getCurrentScope();
    scope.setTag("startup.kind", "cold");
    scope.setTag("startup.platform", Platform.OS);
  } catch {
    /* ignore */
  }
}

// Phase that marks the user-perceived end of cold start. When this phase
// fires we snapshot the accumulated tags into a real Sentry event so the
// data is queryable in Discover (tags alone don't ship without an event).
const TERMINAL_PHASE: ColdStartPhase = "firstInteractiveFrame";
let terminalEmitted = false;

/**
 * Mark a startup phase. Subsequent calls with the same phase are ignored so
 * a warm route change can never overwrite the cold-boot measurement.
 *
 * On the terminal phase (`firstInteractiveFrame`) we also emit a single
 * `cold_start_complete` info event. That event carries the
 * `coldStart.<phase>Ms` tags accumulated on the scope so far, plus the
 * breadcrumbs trail of every phase, which is what the runbook's percentile
 * queries pivot on.
 */
export function markStartupPhase(phase: ColdStartPhase): void {
  if (recorded.has(phase)) return;
  const elapsed = Math.round(now() - startMs);
  recorded.set(phase, elapsed);

  if (!DSN) return;
  try {
    Sentry.getCurrentScope().setTag(`coldStart.${phase}Ms`, String(elapsed));
  } catch {
    /* ignore tag failures — instrumentation is best-effort */
  }
  // Walk-category so it survives the beforeAddBreadcrumb filter.
  addWalkBreadcrumb("coldStart_phase", { phase, elapsedMs: elapsed });

  if (phase === TERMINAL_PHASE && !terminalEmitted) {
    terminalEmitted = true;
    try {
      // Single info-level event per cold launch. The PII filter in
      // beforeSend strips request/user fields and non-walk breadcrumbs but
      // preserves the message string and the scope tags, which is exactly
      // the surface we need for percentile queries on
      // tags[coldStart.firstInteractiveFrameMs]. The message itself
      // contains no user-controlled content, so it is safe to send.
      Sentry.captureMessage("cold_start_complete", "info");
    } catch {
      /* best-effort */
    }
  }
}

/** Read-only view, primarily for tests + a future debug overlay. */
export function getStartupPhases(): ReadonlyMap<ColdStartPhase, number> {
  return recorded;
}

/** Test-only: reset state between unit tests. */
export function _resetColdStartForTests(): void {
  recorded.clear();
  recorded.set("bundleStart", 0);
  terminalEmitted = false;
}
