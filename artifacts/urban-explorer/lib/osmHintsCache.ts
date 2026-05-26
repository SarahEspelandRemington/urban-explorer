export type OsmTrustLevel = "osm_enriched" | "osm_standard" | "osm_bare";

export interface OsmHints {
  trustLevel: OsmTrustLevel;
  osmTags: Record<string, string>;
}

const cache = new Map<string, OsmHints>();

export function setOsmHints(osmId: string, hints: OsmHints): void {
  cache.set(osmId, hints);
}

export function getOsmHints(osmId: string): OsmHints | null {
  return cache.get(osmId) ?? null;
}
