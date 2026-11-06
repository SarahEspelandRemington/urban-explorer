/**
 * Node coordinate passthrough, way bbox-center, and one-level relation
 * bbox-center resolution, including the explicit relation-handling scope
 * guardrail (nested relation members reported as unresolved, not silently
 * dropped or recursively traversed). Run via tsx:
 *
 *   scripts/node_modules/.bin/tsx tools/osm-import/geometryTest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpl } from "./opl";
import { nodeCoordinate, wayBBoxCenter, relationBBoxCenter } from "./geometry";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`PASS: ${name}`);
}

const oplText = readFileSync(
  join(__dirname, "fixtures/oplProofFixture.opl"),
  "utf8",
);
const parsed = parseOpl(oplText);

check("node coordinate passthrough uses the node's own lat/lon", () => {
  const n5 = parsed.nodes.get("5")!;
  assert.deepEqual(nodeCoordinate(n5), { lat: 40.705, lon: -73.905 });
});

check(
  "way bbox center averages min/max over its resolved node refs (not a centroid)",
  () => {
    const w10 = parsed.ways.get("10")!;
    const result = wayBBoxCenter(w10);
    // nodes 1-4 form a rectangle: lat [40.7, 40.701], lon [-73.901, -73.9]
    assert.equal(result.lat, (40.7 + 40.701) / 2);
    assert.equal(result.lon, (-73.901 + -73.9) / 2);
    assert.deepEqual(result.unresolvedMemberRefs, []);
  },
);

check(
  "relation bbox center resolves one level deep: a way member (via its own node refs) union a node member",
  () => {
    const r100 = parsed.relations.get("100")!;
    const result = relationBBoxCenter(r100, parsed);
    // way 10's nodes span lat [40.7, 40.701] lon [-73.901, -73.9];
    // node 6 is at lat 40.695, lon -73.895 — widening both ranges.
    assert.equal(result.lat, (40.695 + 40.701) / 2);
    assert.equal(result.lon, (-73.901 + -73.895) / 2);
    assert.deepEqual(result.unresolvedMemberRefs, []);
  },
);

check(
  "relation-handling scope guardrail: a nested relation-of-relation member is reported as unresolved, not traversed",
  () => {
    const nestedOpl = `r200 v1 dV c0 t i0 u Ttype=site Mr100@subarea,n6@label`;
    const parsedNested = parseOpl(nestedOpl + "\n" + oplText);
    const r200 = parsedNested.relations.get("200")!;
    const result = relationBBoxCenter(r200, parsedNested);
    assert.deepEqual(result.unresolvedMemberRefs, ["relation/100"]);
    // The resolvable node/6 member still contributes a real bbox.
    assert.equal(result.lat, 40.695);
    assert.equal(result.lon, -73.895);
  },
);

check(
  "a relation member referencing a missing way/node id is reported unresolved, not thrown",
  () => {
    const danglingOpl = `r300 v1 dV c0 t i0 u Ttype=site Mw999@perimeter`;
    const parsedDangling = parseOpl(danglingOpl);
    const r300 = parsedDangling.relations.get("300")!;
    const result = relationBBoxCenter(r300, parsedDangling);
    assert.deepEqual(result.unresolvedMemberRefs, ["way/999"]);
    assert.ok(Number.isNaN(result.lat));
    assert.ok(Number.isNaN(result.lon));
  },
);

console.log(`\n${passed} passed, 0 failed`);
