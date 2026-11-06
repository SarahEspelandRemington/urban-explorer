/**
 * Covers: selector-overlap dedupe by (osm_type, osm_id); unnamed-element
 * admission (historic/memorial/etc. do not require `name` at the selector
 * level — that filter is downstream app logic, not part of Package 1's
 * selector reproduction); full raw-tag preservation; duplicate
 * (osm_type, osm_id) collapsing; approved-rescue inclusion when an element
 * fails every normal selector; missing-approved-rescue-id reporting; and
 * import-row validation. Run via tsx:
 *
 *   scripts/node_modules/.bin/tsx tools/osm-import/importPipelineTest.ts
 */
import assert from "node:assert/strict";
import { parseOpl } from "./opl";
import { runImportPipeline, validateRows } from "./importPipeline";
import type { ApprovedRescueTarget } from "./approvedRescue";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`PASS: ${name}`);
}

check(
  "selector-overlap dedupe: a node matching two clauses yields exactly one row",
  () => {
    const opl = `n1 v1 dV c0 t i0 u Thistoric=yes,memorial=statue x-74 y40.7`;
    const parsed = parseOpl(opl);
    const result = runImportPipeline(parsed, []);
    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.rows[0].matchedSelectorIds.sort(), [
      "historic",
      "memorial",
    ]);
    assert.equal(result.diagnostics.selectorMatchCount, 1); // one element checked, matched (counted once per element, not per clause)
  },
);

check(
  "unnamed historic node is admitted (selector-level, not the downstream name filter)",
  () => {
    const opl = `n1 v1 dV c0 t i0 u Thistoric=monument x-74 y40.7`;
    const parsed = parseOpl(opl);
    const result = runImportPipeline(parsed, []);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].name, null);
  },
);

check(
  "full raw tag dict is preserved on the row, not just HINT_TAGS-whitelisted keys",
  () => {
    const opl = `n1 v1 dV c0 t i0 u Thistoric=yes,wikidata=Q123,some_unrelated_key=value x-74 y40.7`;
    const parsed = parseOpl(opl);
    const result = runImportPipeline(parsed, []);
    assert.deepEqual(result.rows[0].tags, {
      historic: "yes",
      wikidata: "Q123",
      some_unrelated_key: "value",
    });
  },
);

check(
  "a node that matches no selector and is not approved-rescued is excluded",
  () => {
    const opl = `n1 v1 dV c0 t i0 u Tshop=bakery x-74 y40.7`;
    const parsed = parseOpl(opl);
    const result = runImportPipeline(parsed, []);
    assert.equal(result.rows.length, 0);
  },
);

check(
  "duplicate (osm_type, osm_id) across a selector match and a rescue match collapses to one row, flagged as rescued",
  () => {
    const opl = `n1 v1 dV c0 t i0 u Thistoric=yes,name=X x-74 y40.7`;
    const parsed = parseOpl(opl);
    const targets: ApprovedRescueTarget[] = [{ osmType: "node", osmId: "1" }];
    const result = runImportPipeline(parsed, targets);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].isApprovedRescue, true);
    assert.equal(result.diagnostics.duplicateIdsCollapsed, 1);
  },
);

check(
  "approved-rescue inclusion: a tag-sparse element (building=yes only, fails every selector) is still admitted when its id is approved",
  () => {
    const opl = `w1 v1 dV c0 t i0 u Tbuilding=yes Nn1x-74y40.7,n2x-74y40.701,n3x-74.001y40.701,n4x-74.001y40.7,n1x-74y40.7`;
    const parsed = parseOpl(opl);
    const targets: ApprovedRescueTarget[] = [{ osmType: "way", osmId: "1" }];
    const result = runImportPipeline(parsed, targets);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].isApprovedRescue, true);
    assert.equal(result.diagnostics.approvedRescueMatchCount, 1);
    assert.equal(result.diagnostics.selectorMatchCount, 0); // building=yes alone fails name+building
  },
);

check(
  "missing approved-rescue id (not present anywhere in the extract) is reported, not silently dropped",
  () => {
    const opl = `n1 v1 dV c0 t i0 u Thistoric=yes x-74 y40.7`;
    const parsed = parseOpl(opl);
    const targets: ApprovedRescueTarget[] = [
      { osmType: "way", osmId: "999999" },
    ];
    const result = runImportPipeline(parsed, targets);
    assert.deepEqual(result.diagnostics.approvedRescueMissingIds, [
      "way/999999",
    ]);
  },
);

check(
  "row validation rejects a row with invalid lat/lon or missing tags",
  () => {
    const errors = validateRows([
      {
        osmType: "node",
        osmId: "1",
        name: null,
        lat: NaN,
        lon: -74,
        tags: {},
        isApprovedRescue: false,
        osmVersion: null,
        matchedSelectorIds: [],
      },
      {
        osmType: "node",
        osmId: "2",
        name: null,
        lat: 40,
        lon: -74,
        tags: {},
        isApprovedRescue: false,
        osmVersion: null,
        matchedSelectorIds: [],
      },
    ]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].osmId, "1");
  },
);

console.log(`\n${passed} passed, 0 failed`);
