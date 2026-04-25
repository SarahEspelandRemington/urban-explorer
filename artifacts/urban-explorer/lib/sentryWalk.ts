import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export interface WalkScopeData {
  isWalking: boolean;
  currentPlaceId: string | null;
  placeCount: number;
  narrationCount: number;
}

/**
 * Stamp the current Sentry scope with walk-session context so every crash
 * report carries a snapshot of what was happening during the walk.
 * PII-safe: only opaque IDs and counts, no coordinates or place names.
 */
export function setWalkScope(data: WalkScopeData): void {
  if (!DSN) return;
  Sentry.getCurrentScope().setContext("walk", {
    isWalking: data.isWalking,
    currentPlaceId: data.currentPlaceId,
    placeCount: data.placeCount,
    narrationCount: data.narrationCount,
  });
}

/**
 * Record a walk-lifecycle event as a Sentry breadcrumb.
 * Only call with opaque IDs and counts — never place names or coordinates.
 */
export function addWalkBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!DSN) return;
  Sentry.addBreadcrumb({
    category: "walk",
    message,
    level: "info",
    ...(data ? { data } : {}),
  });
}
