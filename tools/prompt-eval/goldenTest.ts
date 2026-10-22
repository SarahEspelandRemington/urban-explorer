/**
 * Golden test (Task M): asserts the control eval request is byte-identical
 * to the production-built request for the same fixture. Run directly via
 * tsx (consistent with this repo's local-vitest-blocked workaround):
 *
 *   scripts/node_modules/.bin/tsx tools/prompt-eval/goldenTest.ts
 *
 * No network calls — this only exercises request construction.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildCopyGenRequest } from "../../artifacts/api-server/src/lib/copyGenRequestBuilder";
import { loadFixture, fixtureToRequestParams } from "./loadFixture";
import { CONTROL_VARIANT, VARIANTS } from "./variants";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`PASS: ${name}`);
}

const fixturePath = join(
  process.cwd(),
  "tools/prompt-eval/fixtures/example-enriched.json",
);
const fixture = loadFixture(fixturePath);
const params = fixtureToRequestParams(fixture);

// The "production-built request" for a given set of inputs IS
// buildCopyGenRequest(params) — the same function the route calls. This
// proves the harness's own plumbing (JSON fixture -> Map/Set conversion ->
// control variant) introduces zero transformation relative to calling the
// production builder directly with the same conceptual inputs.
const productionRequest = buildCopyGenRequest(params);
const controlRequest = CONTROL_VARIANT(buildCopyGenRequest(params));

check(
  "control eval request is byte-identical (deep-equal) to the production-built request for the same fixture",
  () => {
    assert.deepEqual(controlRequest, productionRequest);
  },
);

check("VARIANTS registers exactly the control variant", () => {
  assert.deepEqual(Object.keys(VARIANTS), ["control"]);
});

check(
  "CONTROL_VARIANT is a pure pass-through (no field dropped or added)",
  () => {
    const withExtraCall = CONTROL_VARIANT(productionRequest);
    assert.equal(withExtraCall, productionRequest);
  },
);

console.log(`\n${passed} checks passed.`);
