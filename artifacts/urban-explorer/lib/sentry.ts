import * as Sentry from "@sentry/react-native";
import type React from "react";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// ─── PII audit (2026-04-25) ──────────────────────────────────────────────────
// Audited all Sentry data paths against this pattern list:
//
// 1. event.contexts["walk"] (setWalkScope in lib/sentryWalk.ts):
//      isWalking (bool), currentPlaceId (opaque ID, *Id suffix), placeCount
//      (*Count suffix), narrationCount (*Count suffix) — all safe.
//
// 2. event.contexts["react"] (ErrorBoundary.tsx captureException call):
//      componentStack — React component-tree trace, no user data, safe.
//
// 3. event.extra: nothing in the codebase sets extra fields explicitly.
//
// 4. Walk breadcrumb data (addWalkBreadcrumb in WalkModeContext.tsx):
//      "narration fetched" → { placeId (*Id), kind ("audio"|"text") } — safe.
//      "place visited"     → { placeId (*Id) } — safe.
//      "walk started" / "walk stopped" → no data — safe.
//
// Gaps identified: the following field names appear on WalkPlace and
// Location.LocationObject (and in fetchNarrationPayload request bodies) but
// are NOT currently forwarded to Sentry. They are added here defensively so
// that a future event.extra or event.contexts key accidentally including them
// is scrubbed before the event leaves the device. Breadcrumb data objects
// are now also passed through scrubObject in beforeSend (after the category
// filter) so that any future call-site that accidentally includes a PII field
// is scrubbed before the event leaves the device.
//
//   "name"      — place name (human-readable, identifies a specific building)
//   "summary"   — AI-generated place description (contains place-specific text)
//   "narration" — spoken narration text (content derived from place identity)
//   "altitude"  — third GPS coordinate dimension, same sensitivity as lat/lon
//   "heading"   — direction of travel (location-adjacent movement data)
//   "speed"     — movement velocity (location-adjacent movement data)
// ─────────────────────────────────────────────────────────────────────────────
const PII_KEY_PATTERNS = [
  "lat", "lon", "lng", "coord", "location", "place", "address",
  "destination", "origin", "route", "street", "city", "geo",
  "name", "summary", "narration", "altitude", "heading", "speed",
];

export function isPiiKey(key: string): boolean {
  // Keys ending with "Id" or "Count" are safe metadata — not PII — even if
  // they contain a pattern word (e.g. "currentPlaceId", "placeCount").
  if (/(?:Id|Count)$/.test(key)) return false;
  const lk = key.toLowerCase();
  return PII_KEY_PATTERNS.some((p) => lk.includes(p));
}

export function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isPiiKey(key)) continue;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      out[key] = scrubObject(val as Record<string, unknown>);
    } else {
      out[key] = val;
    }
  }
  return out;
}

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0,
    enableNativeNagger: false,
    maxBreadcrumbs: 20,
    beforeSend(event) {
      // Retain walk-category breadcrumbs only; drop everything else (XHR,
      // console, navigation, etc.) which may inadvertently carry PII.
      if (Array.isArray(event.breadcrumbs) && event.breadcrumbs.length > 0) {
        event.breadcrumbs = event.breadcrumbs
          .filter((b) => b.category === "walk")
          .map((b) => ({
            ...b,
            data: b.data ? scrubObject(b.data as Record<string, unknown>) : b.data,
          }));
      } else {
        event.breadcrumbs = undefined;
      }
      event.request = undefined;
      event.user = undefined;
      if (event.extra) {
        event.extra = scrubObject(event.extra as Record<string, unknown>);
      }
      if (event.contexts) {
        event.contexts = scrubObject(
          event.contexts as unknown as Record<string, unknown>,
        ) as typeof event.contexts;
      }
      return event;
    },
  });
}

export function captureException(
  err: unknown,
  ctx?: Parameters<typeof Sentry.captureException>[1],
): void {
  if (!DSN) return;
  Sentry.captureException(err, ctx);
}

export function captureMessage(
  message: string,
  level?: Parameters<typeof Sentry.captureMessage>[1],
): void {
  if (!DSN) return;
  Sentry.captureMessage(message, level);
}

export const hasDsn = Boolean(DSN);

export function wrap<T extends React.ComponentType<any>>(component: T): T {
  return DSN ? (Sentry.wrap(component) as T) : component;
}
