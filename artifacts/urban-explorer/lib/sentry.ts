import * as Sentry from "@sentry/react-native";
import type React from "react";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0,
    enableNativeNagger: false,
    beforeSend(event) {
      if (event.extra) {
        const cleaned: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(event.extra)) {
          const lk = key.toLowerCase();
          if (
            lk.includes("lat") ||
            lk.includes("lon") ||
            lk.includes("coord") ||
            lk.includes("location") ||
            lk.includes("place") ||
            lk.includes("address")
          ) {
            continue;
          }
          cleaned[key] = val;
        }
        event.extra = cleaned;
      }
      if (event.contexts?.device) {
        const dev = event.contexts.device as Record<string, unknown>;
        delete dev.latitude;
        delete dev.longitude;
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
