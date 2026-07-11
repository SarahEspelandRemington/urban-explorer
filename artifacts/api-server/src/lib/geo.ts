/**
 * Shared geometry primitives for server-side place computations.
 *
 * `haversineDistance` was previously duplicated inline in
 * routes/explore/index.ts; moved here as the single canonical
 * implementation so new features (e.g. orientation.ts) don't add another
 * copy.
 */

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Initial bearing from point 1 to point 2, in degrees, normalized to
 * 0-360 (0 = north, 90 = east). This matches the convention used by
 * `bearingDeg` in the client's WalkModeContext.tsx / HeadingContext.tsx —
 * NOT the ±180 convention used by the client's walkEligibility.ts.
 */
export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
