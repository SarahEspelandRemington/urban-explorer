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
 * Increment the narration audio-to-text fallback counter in Sentry metrics.
 *
 * Reasons:
 *   "write_failure"   – audio bytes were received but writing the temp file threw
 *   "endpoint_error"  – the audio fetch itself threw (network / timeout / abort)
 *   "bad_response"    – the audio endpoint returned a non-ok status or empty body
 *
 * This lets you see in the Sentry Metrics dashboard how often the native audio
 * path degrades to text, and *why* it degrades.
 */
export type NarrationFallbackReason =
  | "write_failure"
  | "endpoint_error"
  | "bad_response";

export function trackNarrationFallback(reason: NarrationFallbackReason): void {
  if (!DSN) return;
  Sentry.metrics.increment("narration.audio_fallback", 1, {
    tags: { reason },
  });
}

/**
 * Record a walk-lifecycle event as a Sentry breadcrumb.
 * Only call with opaque IDs and counts — never place names or coordinates.
 */
export function addWalkBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
): void {
  if (!DSN) return;
  Sentry.addBreadcrumb({
    category: "walk",
    message,
    level,
    ...(data ? { data } : {}),
  });
}
