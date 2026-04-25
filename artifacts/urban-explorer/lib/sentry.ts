import * as Sentry from "@sentry/react-native";
import type { ErrorEvent } from "@sentry/react-native";
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

/**
 * Redact values adjacent to known PII key names in a free-text string.
 *
 * Matches structured patterns like:
 *   name: Eiffel Tower          → name: [redacted]
 *   place="Coffee House"        → place=[redacted]
 *   narration: 'Long text here' → narration: [redacted]
 *
 * This does NOT catch place names interpolated raw with no surrounding key
 * (e.g. "Failed for The Eiffel Tower"). Callers (addWalkBreadcrumb,
 * captureMessage) are expected to use only caller-controlled, opaque strings.
 * This scrubber is a belt-and-suspenders guard for structured patterns.
 */
export function scrubString(text: string): string {
  let result = text;
  for (const pattern of PII_KEY_PATTERNS) {
    result = result.replace(
      new RegExp(
        `(\\b${pattern}\\b\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|\\S+)`,
        "gi",
      ),
      "$1[redacted]",
    );
  }
  return result;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (val === null || typeof val !== "object" || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val) as unknown;
  return proto === Object.prototype || proto === null;
}

export function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isPiiKey(key)) continue;
    if (val !== null && typeof val === "object") {
      if (Array.isArray(val)) {
        out[key] = val.map((item) =>
          isPlainObject(item) ? scrubObject(item) : item,
        );
      } else {
        out[key] = scrubObject(val as Record<string, unknown>);
      }
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function beforeSend(event: ErrorEvent): ErrorEvent {
  // Retain walk-category breadcrumbs only; drop everything else (XHR,
  // console, navigation, etc.) which may inadvertently carry PII.
  if (Array.isArray(event.breadcrumbs) && event.breadcrumbs.length > 0) {
    const filtered = event.breadcrumbs
      .filter((b) => b.category === "walk")
      .map((b) => ({
        ...b,
        message: b.message ? scrubString(b.message) : b.message,
        data: b.data ? scrubObject(b.data as Record<string, unknown>) : b.data,
      }));
    event.breadcrumbs = filtered.length > 0 ? filtered : undefined;
  } else {
    event.breadcrumbs = undefined;
  }
  event.request = undefined;
  event.user = undefined;
  if (event.message) {
    event.message = scrubString(event.message);
  }
  if (event.extra) {
    event.extra = scrubObject(event.extra as Record<string, unknown>);
  }
  if (event.contexts) {
    event.contexts = scrubObject(
      event.contexts as unknown as Record<string, unknown>,
    ) as typeof event.contexts;
  }
  return event;
}

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0,
    enableNativeNagger: false,
    maxBreadcrumbs: 20,
    beforeSend,
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
