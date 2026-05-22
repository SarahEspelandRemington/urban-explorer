/**
 * Area-context resolution for the discovery LLM prompt.
 *
 * The server derives the neighbourhood label from Nominatim (server-side
 * reverse-geocode at the exact search-centre coordinates). Clients may
 * optionally send an `addressHint` sourced from the device OS geocoder
 * (Expo Location.reverseGeocodeAsync), but the device geocoder is unreliable
 * near neighbourhood boundaries and can return a label that is kilometres
 * from the actual GPS position — e.g. "University City" for coordinates
 * firmly inside Fairmount.
 *
 * Rule: Nominatim is always authoritative when it returns a result. The
 * client hint is accepted only as a last resort when Nominatim has failed or
 * timed out.
 *
 * This module is extracted so the priority rule can be unit-tested in
 * isolation without spinning up the full Express route.
 */

export type EffectiveHintSrc = "nominatim" | "client-hint" | "absent";

export interface EffectiveHint {
  hint: string | undefined;
  src: EffectiveHintSrc;
}

/**
 * Returns the hint string and its source for injection into the LLM
 * brainstorm / main discovery prompt.
 *
 * @param nominatimLabel  Neighbourhood label returned by fetchNeighborhoodLabel.
 * @param nominatimSrc    "nominatim" when Nominatim returned a real result;
 *                        "fallback" when it failed / timed out (label = "Nearby").
 * @param clientHint      Optional string sent by the API caller (device geocoder
 *                        result). Treated as untrusted; never overrides a
 *                        confirmed Nominatim result.
 */
export function resolveEffectiveHint(
  nominatimLabel: string,
  nominatimSrc: "nominatim" | "fallback",
  clientHint: string | undefined,
): EffectiveHint {
  // Nominatim is authoritative. A device OS geocoder (the source of
  // clientHint) can silently return the wrong neighbourhood — the root cause
  // of "West Philly content at Fairmount coordinates" field reports. Never
  // let a client-supplied string override a confirmed server-side result.
  if (nominatimSrc === "nominatim") {
    return { hint: nominatimLabel, src: "nominatim" };
  }

  // Nominatim failed (timeout / HTTP error). Accept the client hint as a
  // best-effort fallback so the LLM still has some location anchor.
  if (clientHint) {
    return { hint: clientHint, src: "client-hint" };
  }

  // Nothing reliable. Omit the hint entirely rather than injecting a stale or
  // incorrect label. The LLM will still receive the raw GPS coordinates.
  return { hint: undefined, src: "absent" };
}
