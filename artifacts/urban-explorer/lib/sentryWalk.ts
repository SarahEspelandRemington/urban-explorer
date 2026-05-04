import * as Sentry from "@sentry/react-native";

import { scrubObject } from "./sentry";

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
 * Record a narration prefetch pipeline event in Sentry. We emit BOTH a
 * lightweight breadcrumb (so the event shows up in the timeline of any
 * subsequent crash report) AND a metrics counter (so the Sentry dashboard
 * tracks aggregate cache-hit rate over time).
 *
 *   HIT               — prefetched payload was consumed for the requested place
 *   MISS              — fetchNarration found no cached payload at all
 *   STALE_DISCARD     — cached payload existed but for a different place and
 *                       was thrown away (wasted prefetch work)
 *   STOP_WALK_DISCARD — prefetch resolved after the walk ended or the
 *                       candidate was already narrated; payload was dropped
 *   DEDUPE            — duplicate prefetch call for the same in-flight
 *                       candidate was collapsed into the first
 */
export type PrefetchTelemetryEvent =
  | "HIT"
  | "MISS"
  | "STALE_DISCARD"
  | "STOP_WALK_DISCARD"
  | "DEDUPE";

export function trackPrefetchEvent(event: PrefetchTelemetryEvent): void {
  if (!DSN) return;
  Sentry.metrics.increment("narration.prefetch_event", 1, {
    tags: { event },
  });
  Sentry.addBreadcrumb({
    category: "walk.prefetch",
    message: `prefetch ${event}`,
    level: "info",
  });
}

/**
 * Record a walk-lifecycle event as a Sentry breadcrumb.
 * Only call with opaque IDs and counts — never place names or coordinates.
 *
 * PII is scrubbed from `data` at the point of ingestion (before the breadcrumb
 * enters Sentry's in-memory buffer) so that accidentally-included fields are
 * never stored, even transiently. The `beforeSend` scrub in sentry.ts is kept
 * as a second line of defence.
 */
export function addWalkBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
): void {
  if (!DSN) return;
  const scrubbedData = data ? scrubObject(data) : undefined;
  const hasData = scrubbedData != null && Object.keys(scrubbedData).length > 0;
  Sentry.addBreadcrumb({
    category: "walk",
    message,
    level,
    ...(hasData ? { data: scrubbedData } : {}),
  });
}
