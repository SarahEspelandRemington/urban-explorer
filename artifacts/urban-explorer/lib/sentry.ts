import * as Sentry from "@sentry/react-native";
import type React from "react";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

const PII_KEY_PATTERNS = [
  "lat", "lon", "lng", "coord", "location", "place", "address",
  "destination", "origin", "route", "street", "city", "geo",
];

function isPiiKey(key: string): boolean {
  const lk = key.toLowerCase();
  return PII_KEY_PATTERNS.some((p) => lk.includes(p));
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
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
    maxBreadcrumbs: 0,
    beforeSend(event) {
      event.breadcrumbs = [];
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

export function wrap<T extends React.ComponentType<any>>(component: T): T {
  return DSN ? (Sentry.wrap(component) as T) : component;
}
