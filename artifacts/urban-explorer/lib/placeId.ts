export function buildPlaceId(
  name: string,
  latitude: number,
  longitude: number,
): string {
  return `${name}-${latitude}-${longitude}`;
}
