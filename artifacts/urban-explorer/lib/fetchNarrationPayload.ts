/**
 * Standalone narration-payload fetcher.
 *
 * Extracted from WalkModeContext so it can be unit-tested without a React
 * component or native device.  The function mirrors the exact behaviour of
 * the inline version it replaces:
 *
 *   1. On native (non-Expo-Go) try the natural-voice MP3 endpoint first.
 *      a. If the audio response is good, write the bytes to a cache file
 *         via writeNarrationAudioToCache.  Return an "audio" payload with
 *         the file URI and a cleanup that deletes the temp file.
 *      b. If writeNarrationAudioToCache throws (e.g. Paths.cache is
 *         undefined/invalid), catch the error, log a breadcrumb, and fall
 *         through to the text path.  The throw must NOT propagate.
 *   2. Fall back to the text endpoint and return a "text" payload.
 *   3. Return null on any unrecoverable error.
 */
import { Platform } from "react-native";
import { authHeaders } from "./apiToken";
import { addWalkBreadcrumb, trackNarrationFallback } from "./sentryWalk";
import { writeNarrationAudioToCache } from "./walkAudioCache";

export type NarrationPayload =
  | { kind: "audio"; audioUri: string; cleanup?: () => void }
  | { kind: "text"; text: string };

export interface NarrationPlace {
  id: string;
  name: string;
  category: string;
  summary: string;
  facts: string[];
  /** Specific street address of the place (e.g. "610 8th Ave"). */
  address?: string;
  /**
   * Approximate block context for the narration spatial anchor
   * (e.g. "W 49th St, Hell's Kitchen, Manhattan").
   *
   * This MUST represent the place's own location — the cross streets or
   * neighborhood label at the place's coordinates — NOT the user's current
   * GPS position. Passing the user's location as this field when the user is
   * far from the place causes the LLM to synthesize false local context
   * ("Here in Fairmount —" for a place at 328 Walnut Street).
   *
   * Only populated by WalkModeContext when (a) the place has no address AND
   * (b) the user is physically adjacent (≤ maxQueueDistance) to the place, so
   * the user's reverse-geocoded block is approximately correct for the place.
   */
  crossStreets?: string;
}

export async function fetchNarrationPayload(
  place: NarrationPlace,
  opts: {
    apiBase: string;
    isExpoGo: boolean;
  },
): Promise<NarrationPayload | null> {
  const { apiBase, isExpoGo } = opts;

  const body = JSON.stringify({
    placeName: place.name,
    category: place.category,
    summary: place.summary,
    // Bounded to 3 facts (matches WalkNarrationRequest.facts maxItems); see
    // the same pattern in HeadingContext.tsx's deep-narration request body.
    facts: place.facts.slice(0, 3),
    ...(place.address ? { address: place.address } : {}),
    ...(place.crossStreets ? { crossStreets: place.crossStreets } : {}),
  });
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
  };

  // Native: try the natural-voice MP3 endpoint first.
  // Skipped in Expo Go: the bundled native runtime may not match the JS
  // package versions, which can cause a native crash on file write / playback.
  if (Platform.OS !== "web" && !isExpoGo) {
    try {
      const audioController = new AbortController();
      const audioTimeout = setTimeout(() => audioController.abort(), 15_000);
      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/explore/walk-narration-audio`, {
          method: "POST",
          headers,
          body,
          signal: audioController.signal,
        });
      } finally {
        clearTimeout(audioTimeout);
      }

      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 0) {
          try {
            const cached = writeNarrationAudioToCache(place.id, buf);
            if (cached) {
              return {
                kind: "audio",
                audioUri: cached.uri,
                cleanup: cached.cleanup,
              };
            }
          } catch (writeErr) {
            addWalkBreadcrumb(
              "narration audio write failed",
              {
                errorType:
                  writeErr instanceof Error
                    ? writeErr.constructor.name
                    : typeof writeErr,
              },
              "warning",
            );
            trackNarrationFallback("write_failure");
            // Fall through to text endpoint below.
          }
        } else {
          addWalkBreadcrumb("narration audio response empty", {}, "warning");
          trackNarrationFallback("bad_response");
        }
      } else {
        addWalkBreadcrumb(
          "narration audio bad status",
          { status: res.status },
          "warning",
        );
        trackNarrationFallback("bad_response");
      }
    } catch (err) {
      addWalkBreadcrumb(
        "narration audio endpoint error",
        { errorType: err instanceof Error ? err.constructor.name : typeof err },
        "warning",
      );
      trackNarrationFallback("endpoint_error");
    }
  }

  // Text path (web, or native fallback if audio failed / write threw).
  try {
    const textController = new AbortController();
    const textTimeout = setTimeout(() => textController.abort(), 12_000);
    try {
      const res = await fetch(`${apiBase}/api/explore/walk-narration`, {
        method: "POST",
        headers,
        body,
        signal: textController.signal,
      });
      if (!res.ok) {
        addWalkBreadcrumb(
          "narration fetch failed",
          { status: res.status },
          "error",
        );
        return null;
      }
      const data = await res.json();
      if (typeof data?.narration !== "string" || !data.narration.trim()) {
        addWalkBreadcrumb("narration payload null or empty", {}, "error");
        return null;
      }
      return { kind: "text", text: data.narration };
    } finally {
      clearTimeout(textTimeout);
    }
  } catch (err) {
    addWalkBreadcrumb(
      "narration fetch threw",
      { errorType: err instanceof Error ? err.constructor.name : typeof err },
      "error",
    );
    return null;
  }
}
