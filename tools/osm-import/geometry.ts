// Node/way/relation coordinate resolution, reproducing Overpass `out center`
// semantics: the bounding-box CENTER of a way/relation's member coordinates,
// NOT a true geometric centroid (confirmed via OSM Wiki + OSM-talk mailing
// list during the Package 1 parity investigation). A node's own coordinate
// is used as-is.
//
// Relation-handling scope guardrail (per the Package 1 task's explicit
// instruction): this module resolves relation members ONE level deep only —
// a member that is a node uses that node's own coordinate; a member that is
// a way uses that way's own resolved node coordinates. A member that is
// ANOTHER RELATION is NOT resolved — doing so would require recursive
// relation-graph traversal (with cycle detection, since OSM relations can
// legally reference each other in loops), which is materially broader
// geometry infrastructure than the bounded importer described in the
// Package 1 plan. Such members are reported via `unresolvedMemberRefs`
// instead of silently dropped or guessed at. In practice, that kind of
// relation-of-relations nesting is NOT needed by any of the 13 selector
// clauses' typical real-world targets (historic sites, heritage, memorials,
// etc. — overwhelmingly plain ways/nodes, occasionally a `type=site`
// relation of nodes/ways, essentially never a relation-of-relations), so
// this stop-rather-than-expand boundary should rarely or never bite in
// practice — see the Package 1 report's relation-handling section.

import type { OplNode, OplWay, OplRelation, ParsedOpl } from "./opl";

export interface BBoxCenterResult {
  lat: number;
  lon: number;
  unresolvedMemberRefs: string[]; // relation-member refs this function could not resolve (e.g. nested relations)
}

export function nodeCoordinate(node: OplNode): { lat: number; lon: number } {
  return { lat: node.lat, lon: node.lon };
}

export function wayBBoxCenter(way: OplWay): BBoxCenterResult {
  if (way.nodeRefs.length === 0) {
    throw new Error(`Way ${way.id} has no node refs — cannot compute center`);
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const ref of way.nodeRefs) {
    if (Number.isNaN(ref.lat) || Number.isNaN(ref.lon)) {
      throw new Error(
        `Way ${way.id} has an unresolved node ref (${ref.id}) — ` +
          `OPL must be generated with locations_on_ways=true`,
      );
    }
    minLat = Math.min(minLat, ref.lat);
    maxLat = Math.max(maxLat, ref.lat);
    minLon = Math.min(minLon, ref.lon);
    maxLon = Math.max(maxLon, ref.lon);
  }
  return {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
    unresolvedMemberRefs: [],
  };
}

export function relationBBoxCenter(
  relation: OplRelation,
  parsed: ParsedOpl,
): BBoxCenterResult {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  const unresolvedMemberRefs: string[] = [];

  for (const member of relation.members) {
    if (member.memberType === "node") {
      const node = parsed.nodes.get(member.ref);
      if (!node) {
        unresolvedMemberRefs.push(`node/${member.ref}`);
        continue;
      }
      minLat = Math.min(minLat, node.lat);
      maxLat = Math.max(maxLat, node.lat);
      minLon = Math.min(minLon, node.lon);
      maxLon = Math.max(maxLon, node.lon);
    } else if (member.memberType === "way") {
      const way = parsed.ways.get(member.ref);
      if (!way) {
        unresolvedMemberRefs.push(`way/${member.ref}`);
        continue;
      }
      for (const ref of way.nodeRefs) {
        if (Number.isNaN(ref.lat) || Number.isNaN(ref.lon)) continue;
        minLat = Math.min(minLat, ref.lat);
        maxLat = Math.max(maxLat, ref.lat);
        minLon = Math.min(minLon, ref.lon);
        maxLon = Math.max(maxLon, ref.lon);
      }
    } else {
      // Nested relation member — explicit scope guardrail, not resolved.
      unresolvedMemberRefs.push(`relation/${member.ref}`);
    }
  }

  if (minLat === Infinity) {
    // Every member was unresolved (or the relation had no members).
    return { lat: NaN, lon: NaN, unresolvedMemberRefs };
  }

  return {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
    unresolvedMemberRefs,
  };
}
