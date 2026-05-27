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
 * Fetch-side reasons (emitted from `lib/fetchNarrationPayload.ts` — the audio
 * never made it to the playback engine):
 *   "write_failure"          – audio bytes were received but writing the temp file threw
 *   "endpoint_error"         – the audio fetch itself threw (network / timeout / abort)
 *   "bad_response"           – the audio endpoint returned a non-ok status or empty body
 *
 * Playback-side reasons (emitted from `hooks/useNarration.ts` — the audio
 * payload arrived but expo-audio could not play it, so Walk Mode silently
 * skipped the story; the queue advances to the next item):
 *   "playback_create"        – `createAudioPlayer({ uri })` threw (corrupt cache file,
 *                              native runtime mismatch). The queue advances after a
 *                              short defer.
 *   "playback_play"          – `player.play()` threw (audio session lost, decoder
 *                              unavailable). teardownActive runs and the queue advances.
 *   "playback_status_error"  – `playbackStatusUpdate` reported an error / failure /
 *                              cannotPlay state. The queue advances.
 *   "playback_watchdog"      – the 60s audio watchdog tripped because `didJustFinish`
 *                              never fired (decoder stall, lost audio session). The
 *                              queue advances.
 *
 * Text-path reasons (emitted from `hooks/useNarration.ts` — the audio path was
 * unavailable or already failed, so we tried to read the prefetched text via
 * expo-speech / Web Speech API, and that silently skipped too). Without these
 * a regression in expo-speech, the Web Speech API, or the text endpoint would
 * leave the dashboard at zero while users get a gap in their tour:
 *   "text_speak_error"       – native `Speech.speak`'s `onError` callback fired.
 *                              onFinish runs and the queue advances.
 *   "text_web_error"         – web `SpeechSynthesisUtterance.onerror` fired.
 *                              onFinish runs and the queue advances.
 *   "text_empty"             – the prefetched text payload was empty/missing
 *                              (no audio AND no usable text), so processQueue's
 *                              empty-text guard advanced past the place.
 *
 * This lets you see in the Sentry Metrics dashboard how often the native audio
 * path degrades to text, and *why* it degrades. The dashboard's
 * "Audio fallback events by reason" panel groups by `reason`, so new values
 * appear automatically with no dashboard edit.
 */
export type NarrationFallbackReason =
  | "write_failure"
  | "endpoint_error"
  | "bad_response"
  | "playback_create"
  | "playback_play"
  | "playback_status_error"
  | "playback_watchdog"
  | "text_speak_error"
  | "text_speak_watchdog"
  | "text_web_error"
  | "text_empty";

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
 * Increment the "narration actually started playback" counter. Emitted from
 * `hooks/useNarration.ts` once per queued item that successfully began
 * playing — i.e. after `player.play()` returns without throwing on the audio
 * path, after `Speech.speak(...)` is invoked on the native text path, and
 * after `window.speechSynthesis.speak(...)` is invoked on the web text path.
 *
 * Intentionally NOT incremented for items that never started:
 *   - `playback_create` failures (createAudioPlayer threw before play)
 *   - `playback_play` failures (play() itself threw)
 *   - `text_empty` (no text payload, processQueue's empty-text guard fired)
 *
 * This is the dedicated denominator for the Walk Mode Audio Fallback
 * dashboard's "Audio fallback rate %" panel. Before this counter existed the
 * panel divided `sum(narration.audio_fallback)` by `sum(narration.prefetch_event)`,
 * which over-counts true narrations because it also includes lifecycle
 * events like `DEDUPE` and `STOP_WALK_DISCARD`. Counting only narrations
 * that actually started playback gives a tight, trustworthy fallback rate.
 *
 * The `kind` tag is for diagnostic visibility (audio vs text playbacks); the
 * dashboard equation sums across all kinds.
 */
export type NarrationPlayedKind = "audio" | "text";

export function trackNarrationPlayed(kind: NarrationPlayedKind): void {
  if (!DSN) return;
  Sentry.metrics.increment("narration.played", 1, {
    tags: { kind },
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
