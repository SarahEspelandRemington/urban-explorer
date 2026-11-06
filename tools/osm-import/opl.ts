// Parser for the OPL (OSM Pipe/plain-text Line) format produced by the
// Package 1 canonical, lossless intermediate-format pipeline (see
// fixtures/oplProofFixture.* for a worked example and the Package 1
// requirement-B proof):
//
//   osmium add-locations-to-ways --keep-member-nodes INPUT.osm -o LOCATED.osm
//   osmium cat LOCATED.osm -f opl,locations_on_ways=true -o OUTPUT.opl
//
// `--keep-member-nodes` is required so that a node referenced ONLY by a
// relation (never by a way, and possibly untagged, e.g. a `type=site`
// relation's label node) is not dropped from the output — osmium's default
// add-locations-to-ways behavior discards every node not needed to resolve
// a way's geometry. `locations_on_ways=true` is required so each way's own
// OPL line embeds its member nodes' resolved coordinates inline
// (`Nn1x-73.9y40.7,n2...`) rather than bare node-id references that would
// otherwise require a second cross-reference pass.
//
// Deliberately NOT using `osmium export`: an earlier Package 1 parity
// investigation found it can silently drop/reshape a selected element (a
// closed `building=yes` way went missing from its polygon output even after
// add-locations-to-ways + sort). OPL (after the two-command pipeline above)
// is the raw node/way/relation element model with no implicit polygon/area
// re-derivation step, so nothing selected is lost, and non-area relations
// (e.g. `type=site`) are preserved like any other element instead of being
// dropped by an area-only export step.

export interface OplNode {
  type: "node";
  id: string;
  tags: Record<string, string>;
  lat: number;
  lon: number;
}

export interface OplWayNodeRef {
  id: string;
  lat: number;
  lon: number;
}

export interface OplWay {
  type: "way";
  id: string;
  tags: Record<string, string>;
  nodeRefs: OplWayNodeRef[];
}

export interface OplRelationMember {
  memberType: "node" | "way" | "relation";
  ref: string;
  role: string;
}

export interface OplRelation {
  type: "relation";
  id: string;
  tags: Record<string, string>;
  members: OplRelationMember[];
}

export interface ParsedOpl {
  nodes: Map<string, OplNode>;
  ways: Map<string, OplWay>;
  relations: Map<string, OplRelation>;
}

// OPL's own escape scheme: a byte is encoded as `%HH%` (hex code between two
// percent signs) — NOT standard URL percent-encoding (which has no trailing
// percent). Confirmed empirically: a tag value "Test Memorial" round-trips
// through osmium as "Test%20%Memorial".
export function decodeOplText(raw: string): string {
  return raw.replace(/%([0-9A-Fa-f]{2})%/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function parseTagsField(value: string): Record<string, string> {
  const tags: Record<string, string> = {};
  if (!value) return tags;
  for (const pair of value.split(",")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = decodeOplText(pair.slice(0, eq));
    const val = decodeOplText(pair.slice(eq + 1));
    tags[key] = val;
  }
  return tags;
}

// Parses a way's `N` field. Plain form (no locations_on_ways):
//   Nn1,n2,n3
// With locations_on_ways=true, each ref is annotated inline:
//   Nn1x-73.9y40.7,n2x-73.9y40.701
// Both forms are accepted; a ref without embedded coordinates yields
// lat/lon of NaN (the caller must resolve it via the node index instead —
// see geometry.ts's scope guardrail notes).
function parseWayNodeRefs(value: string): OplWayNodeRef[] {
  if (!value) return [];
  const refs: OplWayNodeRef[] = [];
  for (const token of value.split(",")) {
    if (!token) continue;
    const m = /^n(-?\d+)(?:x(-?[\d.]+)y(-?[\d.]+))?$/.exec(token);
    if (!m) {
      throw new Error(`Unparseable way node-ref token in OPL: "${token}"`);
    }
    refs.push({
      id: m[1],
      lat: m[3] !== undefined ? Number(m[3]) : NaN,
      lon: m[2] !== undefined ? Number(m[2]) : NaN,
    });
  }
  return refs;
}

function parseRelationMembers(value: string): OplRelationMember[] {
  if (!value) return [];
  const members: OplRelationMember[] = [];
  for (const token of value.split(",")) {
    if (!token) continue;
    const m = /^([nwr])(-?\d+)@(.*)$/.exec(token);
    if (!m) {
      throw new Error(`Unparseable relation member token in OPL: "${token}"`);
    }
    const memberType: OplRelationMember["memberType"] =
      m[1] === "n" ? "node" : m[1] === "w" ? "way" : "relation";
    members.push({ memberType, ref: m[2], role: decodeOplText(m[3]) });
  }
  return members;
}

export function parseOplLine(
  line: string,
):
  | { kind: "node"; node: OplNode }
  | { kind: "way"; way: OplWay }
  | { kind: "relation"; relation: OplRelation }
  | null {
  if (!line.trim()) return null;
  const tokens = line.split(" ");
  const head = tokens[0];
  const typeChar = head[0];
  const id = head.slice(1);
  if (typeChar !== "n" && typeChar !== "w" && typeChar !== "r") {
    throw new Error(`Unrecognized OPL element type in line: "${line}"`);
  }

  let tags: Record<string, string> = {};
  let x: number | undefined;
  let y: number | undefined;
  let nodeRefsField: string | undefined;
  let membersField: string | undefined;

  for (const token of tokens.slice(1)) {
    if (!token) continue;
    const field = token[0];
    const value = token.slice(1);
    switch (field) {
      case "T":
        tags = parseTagsField(value);
        break;
      case "x":
        x = Number(value);
        break;
      case "y":
        y = Number(value);
        break;
      case "N":
        nodeRefsField = value;
        break;
      case "M":
        membersField = value;
        break;
      default:
        // v (version), d (visible), c (changeset), t (timestamp), i (uid),
        // u (user) — diagnostics-only metadata, not consumed.
        break;
    }
  }

  if (typeChar === "n") {
    if (x === undefined || y === undefined) {
      throw new Error(`Node OPL line missing x/y: "${line}"`);
    }
    return { kind: "node", node: { type: "node", id, tags, lat: y, lon: x } };
  }
  if (typeChar === "w") {
    return {
      kind: "way",
      way: {
        type: "way",
        id,
        tags,
        nodeRefs: parseWayNodeRefs(nodeRefsField ?? ""),
      },
    };
  }
  return {
    kind: "relation",
    relation: {
      type: "relation",
      id,
      tags,
      members: parseRelationMembers(membersField ?? ""),
    },
  };
}

export function parseOpl(text: string): ParsedOpl {
  const nodes = new Map<string, OplNode>();
  const ways = new Map<string, OplWay>();
  const relations = new Map<string, OplRelation>();

  for (const line of text.split("\n")) {
    const parsed = parseOplLine(line);
    if (!parsed) continue;
    if (parsed.kind === "node") nodes.set(parsed.node.id, parsed.node);
    else if (parsed.kind === "way") ways.set(parsed.way.id, parsed.way);
    else relations.set(parsed.relation.id, parsed.relation);
  }

  return { nodes, ways, relations };
}
