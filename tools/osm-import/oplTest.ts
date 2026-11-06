/**
 * Proves the OPL intermediate-format pipeline (Package 1 requirement B):
 * parsing fixtures/oplProofFixture.opl — generated from
 * fixtures/oplProofFixture.osm via
 *   osmium add-locations-to-ways --keep-member-nodes IN -o LOCATED.osm
 *   osmium cat LOCATED.osm -f opl,locations_on_ways=true -o OUT.opl
 * — retains every node/way/relation with full tags and resolved
 * coordinates, including a non-area `type=site` relation and a node that is
 * a relation member but not a way member. Run via tsx:
 *
 *   scripts/node_modules/.bin/tsx tools/osm-import/oplTest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpl, decodeOplText } from "./opl";

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

check("retains the standalone tagged node (n5)", () => {
  const n5 = parsed.nodes.get("5");
  assert.ok(n5, "node 5 missing from parse");
  assert.equal(n5!.tags.historic, "memorial");
  assert.equal(n5!.tags.name, "Test Memorial");
  assert.equal(n5!.lat, 40.705);
  assert.equal(n5!.lon, -73.905);
});

check(
  "retains the relation-only node member (n6) even though it is untagged and not a way member",
  () => {
    const n6 = parsed.nodes.get("6");
    assert.ok(n6, "node 6 missing from parse — --keep-member-nodes regression");
    assert.deepEqual(n6!.tags, {});
    assert.equal(n6!.lat, 40.695);
    assert.equal(n6!.lon, -73.895);
  },
);

check(
  "retains the way with full tags and inline resolved node coordinates",
  () => {
    const w10 = parsed.ways.get("10");
    assert.ok(w10, "way 10 missing from parse");
    assert.equal(w10!.tags.building, "yes");
    assert.equal(w10!.tags.name, "Test Building");
    assert.equal(w10!.nodeRefs.length, 5);
    assert.deepEqual(
      w10!.nodeRefs.map((r) => r.id),
      ["1", "2", "3", "4", "1"],
    );
    assert.equal(w10!.nodeRefs[0].lat, 40.7);
    assert.equal(w10!.nodeRefs[0].lon, -73.9);
    assert.equal(w10!.nodeRefs[2].lat, 40.701);
    assert.equal(w10!.nodeRefs[2].lon, -73.901);
  },
);

check(
  "retains the non-area type=site relation with full tags and resolvable members",
  () => {
    const r100 = parsed.relations.get("100");
    assert.ok(
      r100,
      "relation 100 missing from parse — would be dropped by osmium export",
    );
    assert.equal(r100!.tags.type, "site");
    assert.equal(r100!.tags.historic, "heritage");
    assert.equal(r100!.tags.name, "Test Heritage Site");
    assert.equal(r100!.members.length, 2);
    assert.deepEqual(r100!.members[0], {
      memberType: "way",
      ref: "10",
      role: "perimeter",
    });
    assert.deepEqual(r100!.members[1], {
      memberType: "node",
      ref: "6",
      role: "label",
    });
  },
);

check("decodes OPL's %HH% escape scheme, not standard %HH URL-encoding", () => {
  assert.equal(decodeOplText("Test%20%Memorial"), "Test Memorial");
});

console.log(`\n${passed} passed, 0 failed`);
