/**
 * Covers all 13 selector clauses, all 8 `name + X` AND cases (each must
 * reject an element with only one half of the pair — the exact osmium
 * tags-filter OR-vs-AND gap this module exists to avoid), and the
 * selector-drift guard (requirement D): parses the live Overpass query text
 * out of routes/explore/index.ts and asserts it structurally matches this
 * module's own SELECTOR_CLAUSES, so an edit to either side without the
 * other fails. Does NOT modify routes/explore/index.ts. Run via tsx:
 *
 *   scripts/node_modules/.bin/tsx tools/osm-import/selectorsTest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SELECTOR_CLAUSES,
  matchesAnySelector,
  matchingSelectorIds,
} from "./selectors";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`PASS: ${name}`);
}

// ---------------------------------------------------------------------------
// All 13 clauses, each matched in isolation
// ---------------------------------------------------------------------------

check("historic: bare existence, any value", () => {
  assert.ok(matchesAnySelector({ historic: "yes" }));
  assert.ok(matchesAnySelector({ historic: "no" })); // Overpass existence check has no value special-case
});

check("heritage: bare existence", () => {
  assert.ok(matchesAnySelector({ heritage: "2" }));
});

check("ruins: bare existence", () => {
  assert.ok(matchesAnySelector({ ruins: "yes" }));
});

check("tourism: regex-matched value, no name required", () => {
  assert.ok(matchesAnySelector({ tourism: "museum" }));
  assert.ok(!matchesAnySelector({ tourism: "hotel" })); // not in the alternation
});

check("name+building: AND", () => {
  assert.ok(matchesAnySelector({ name: "X", building: "yes" }));
});

check("name+amenity: AND + regex", () => {
  assert.ok(matchesAnySelector({ name: "X", amenity: "library" }));
  assert.ok(!matchesAnySelector({ name: "X", amenity: "restaurant" }));
});

check("name+man_made: AND + regex", () => {
  assert.ok(matchesAnySelector({ name: "X", man_made: "lighthouse" }));
});

check("name+landuse: AND + regex", () => {
  assert.ok(matchesAnySelector({ name: "X", landuse: "cemetery" }));
});

check("name+railway: AND + regex", () => {
  assert.ok(matchesAnySelector({ name: "X", railway: "station" }));
});

check("name+disused:amenity: AND, no regex", () => {
  assert.ok(matchesAnySelector({ name: "X", "disused:amenity": "pub" }));
});

check("name+demolished:building: AND, no regex", () => {
  assert.ok(matchesAnySelector({ name: "X", "demolished:building": "yes" }));
});

check("memorial: bare existence", () => {
  assert.ok(matchesAnySelector({ memorial: "statue" }));
});

check("name+leisure: AND + regex", () => {
  assert.ok(matchesAnySelector({ name: "X", leisure: "park" }));
});

// ---------------------------------------------------------------------------
// All 8 name+X AND cases must reject when only one half is present — the
// exact osmium tags-filter OR-vs-AND gap this module exists to avoid.
// ---------------------------------------------------------------------------

const AND_CASES: {
  id: string;
  full: Record<string, string>;
  nameOnly: Record<string, string>;
  keyOnly: Record<string, string>;
}[] = [
  {
    id: "name+building",
    full: { name: "X", building: "yes" },
    nameOnly: { name: "X" },
    keyOnly: { building: "yes" },
  },
  {
    id: "name+amenity",
    full: { name: "X", amenity: "library" },
    nameOnly: { name: "X" },
    keyOnly: { amenity: "library" },
  },
  {
    id: "name+man_made",
    full: { name: "X", man_made: "tower" },
    nameOnly: { name: "X" },
    keyOnly: { man_made: "tower" },
  },
  {
    id: "name+landuse",
    full: { name: "X", landuse: "industrial" },
    nameOnly: { name: "X" },
    keyOnly: { landuse: "industrial" },
  },
  {
    id: "name+railway",
    full: { name: "X", railway: "halt" },
    nameOnly: { name: "X" },
    keyOnly: { railway: "halt" },
  },
  {
    id: "name+disused:amenity",
    full: { name: "X", "disused:amenity": "bar" },
    nameOnly: { name: "X" },
    keyOnly: { "disused:amenity": "bar" },
  },
  {
    id: "name+demolished:building",
    full: { name: "X", "demolished:building": "yes" },
    nameOnly: { name: "X" },
    keyOnly: { "demolished:building": "yes" },
  },
  {
    id: "name+leisure",
    full: { name: "X", leisure: "garden" },
    nameOnly: { name: "X" },
    keyOnly: { leisure: "garden" },
  },
];

for (const c of AND_CASES) {
  check(`${c.id}: rejects name-only (missing secondary key)`, () => {
    assert.ok(
      !matchesAnySelector(c.nameOnly),
      `${c.id} incorrectly matched name-only tags`,
    );
  });
  check(`${c.id}: rejects key-only (missing name)`, () => {
    assert.ok(
      !matchesAnySelector(c.keyOnly),
      `${c.id} incorrectly matched key-only tags`,
    );
  });
  check(`${c.id}: accepts both halves together`, () => {
    assert.ok(matchesAnySelector(c.full));
  });
}

check("no selector clauses match an unrelated tag set", () => {
  assert.deepEqual(matchingSelectorIds({ shop: "bakery" }), []);
});

check("an element can match multiple clauses simultaneously", () => {
  const ids = matchingSelectorIds({ historic: "yes", memorial: "statue" });
  assert.ok(ids.includes("historic"));
  assert.ok(ids.includes("memorial"));
});

// ---------------------------------------------------------------------------
// Selector-drift guard (requirement D): parse the live Overpass query text
// and structurally compare it against SELECTOR_CLAUSES.
// ---------------------------------------------------------------------------

interface ParsedQueryClause {
  keys: string[];
  valueRegex: string | null;
}

function parseLiveQueryClauses(source: string): ParsedQueryClause[] {
  const queryMatch = /const query = `([\s\S]*?)`;/.exec(source);
  assert.ok(
    queryMatch,
    "could not locate the Overpass query template literal in routes/explore/index.ts",
  );
  const queryText = queryMatch![1];

  const clauseRe = /nwr((?:\["[^"]+"(?:~"[^"]+")?\])+)\(around:/g;
  const segmentRe = /\["([^"]+)"(?:~"([^"]+)")?\]/g;

  const clauses: ParsedQueryClause[] = [];
  let m: RegExpExecArray | null;
  while ((m = clauseRe.exec(queryText))) {
    const keys: string[] = [];
    let valueRegex: string | null = null;
    let sm: RegExpExecArray | null;
    segmentRe.lastIndex = 0;
    const segmentsText = m[1];
    while ((sm = segmentRe.exec(segmentsText))) {
      keys.push(sm[1]);
      if (sm[2] !== undefined) valueRegex = sm[2];
    }
    clauses.push({ keys, valueRegex });
  }
  return clauses;
}

check("selector-drift guard: live query has exactly 13 clauses", () => {
  const source = readFileSync(
    join(__dirname, "../../artifacts/api-server/src/routes/explore/index.ts"),
    "utf8",
  );
  const liveClauses = parseLiveQueryClauses(source);
  assert.equal(
    liveClauses.length,
    13,
    `expected 13 clauses in the live query, found ${liveClauses.length}`,
  );
});

check(
  "selector-drift guard: live query clauses structurally match SELECTOR_CLAUSES in this module, in order",
  () => {
    const source = readFileSync(
      join(__dirname, "../../artifacts/api-server/src/routes/explore/index.ts"),
      "utf8",
    );
    const liveClauses = parseLiveQueryClauses(source);
    const ownClauses = SELECTOR_CLAUSES.map((c) => ({
      keys: c.keys,
      valueRegex: c.valueRegex,
    }));
    assert.deepEqual(
      liveClauses,
      ownClauses,
      "selectors.ts's SELECTOR_CLAUSES has drifted from the live fetchNearbyOSMPlaces query text — update both together",
    );
  },
);

console.log(`\n${passed} passed, 0 failed`);
