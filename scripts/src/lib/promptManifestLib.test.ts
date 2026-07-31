/**
 * promptManifestLib.test.ts
 *
 * Focused tests for the prompt-manifest extraction/hashing/parsing logic.
 * Run via `pnpm run test:prompt-manifest` (also wired into the root
 * `pnpm run lint` chain — see package.json) using Node's built-in test
 * runner through tsx, so no extra test-framework dependency is needed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  hashSpans,
  findVersionTokens,
  scanFileContent,
  extractModulePromptRegions,
  parseManifestFile,
} from "./promptManifestLib.js";

function lines(...ls: string[]): string {
  return ls.join("\n") + "\n";
}

// --- hashSpans canonicalization -------------------------------------------

test("hashSpans: length-prefixed spans never collide across different splits of the same concatenation", () => {
  const a = hashSpans(["ab", "c"]);
  const b = hashSpans(["a", "bc"]);
  assert.notEqual(a, b);
});

test("hashSpans: identical span lists hash identically", () => {
  assert.equal(hashSpans(["x", "y"]), hashSpans(["x", "y"]));
});

// --- version token extraction ----------------------------------------------

test("findVersionTokens: literal and dynamic-prefix forms", () => {
  const text = "const a = `detail:v1:${x}`; const b = `${mode}:v2:${y}`;";
  const versions = findVersionTokens(text)
    .map((t) => t.version)
    .sort();
  assert.deepEqual(versions, ["v1", "v2"]);
});

// --- fixtures ---------------------------------------------------------------

function baseFixture(routeBBody = 'const prompt = "world";'): string {
  return lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    '  const prompt = "hello";',
    "  // @end-prompt-region route-a",
    '  req.log.info("handled");',
    "});",
    "",
    'router.post("/api/route-b", async (req, res) => {',
    "  const cacheKey = `route-b:v1:${y}`;",
    "  " + routeBBody,
    "});",
  );
}

test("scanFileContent: editing an unrelated route does not change this route's entry", () => {
  const before = scanFileContent("fixture.ts", baseFixture());
  const after = scanFileContent(
    "fixture.ts",
    baseFixture('const prompt = "world, changed";'),
  );
  assert.equal(before.issues.length, 0);
  assert.equal(after.issues.length, 0);

  const beforeA = before.entries.find((e) => e.key === "fixture.ts::route-a")!;
  const afterA = after.entries.find((e) => e.key === "fixture.ts::route-a")!;
  assert.equal(beforeA.sectionHash, afterA.sectionHash);

  const beforeB = before.entries.find((e) => e.key === "fixture.ts::route-b")!;
  const afterB = after.entries.find((e) => e.key === "fixture.ts::route-b")!;
  assert.notEqual(beforeB.sectionHash, afterB.sectionHash);
});

test("scanFileContent: adding logging outside a marked region does not change the marked route's hash", () => {
  const before = scanFileContent("fixture.ts", baseFixture());
  const withExtraLogging = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    '  const prompt = "hello";',
    "  // @end-prompt-region route-a",
    '  req.log.info("handled");',
    '  req.log.warn("a brand new unrelated log line");',
    "});",
    "",
    'router.post("/api/route-b", async (req, res) => {',
    "  const cacheKey = `route-b:v1:${y}`;",
    '  const prompt = "world";',
    "});",
  );
  const after = scanFileContent("fixture.ts", withExtraLogging);
  assert.equal(after.issues.length, 0);

  const beforeA = before.entries.find((e) => e.key === "fixture.ts::route-a")!;
  const afterA = after.entries.find((e) => e.key === "fixture.ts::route-a")!;
  assert.equal(beforeA.sectionHash, afterA.sectionHash);
  assert.deepEqual(beforeA.versions, afterA.versions);
});

test("scanFileContent: changing marked prompt content without bumping its version changes the hash but keeps the same versions (the failure case the check script rejects)", () => {
  const before = scanFileContent("fixture.ts", baseFixture());
  const changedPrompt = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    '  const prompt = "hello there, this text changed";',
    "  // @end-prompt-region route-a",
    '  req.log.info("handled");',
    "});",
    "",
    'router.post("/api/route-b", async (req, res) => {',
    "  const cacheKey = `route-b:v1:${y}`;",
    '  const prompt = "world";',
    "});",
  );
  const after = scanFileContent("fixture.ts", changedPrompt);
  const beforeA = before.entries.find((e) => e.key === "fixture.ts::route-a")!;
  const afterA = after.entries.find((e) => e.key === "fixture.ts::route-a")!;

  assert.notEqual(beforeA.sectionHash, afterA.sectionHash);
  assert.deepEqual(beforeA.versions, afterA.versions);

  // Mirrors checkPromptManifest.ts's own classification rule: same versions
  // + different hash = "changed without a cache-key version bump" -> fail.
  const sameVersions =
    beforeA.versions.length === afterA.versions.length &&
    beforeA.versions.every((v, i) => v === afterA.versions[i]);
  assert.ok(sameVersions && beforeA.sectionHash !== afterA.sectionHash);
});

test("scanFileContent: bumping the version inside a marked region registers as a version change (the supported update path)", () => {
  const before = scanFileContent("fixture.ts", baseFixture());
  const bumped = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v2:${x}`;",
    '  const prompt = "hello";',
    "  // @end-prompt-region route-a",
    '  req.log.info("handled");',
    "});",
    "",
    'router.post("/api/route-b", async (req, res) => {',
    "  const cacheKey = `route-b:v1:${y}`;",
    '  const prompt = "world";',
    "});",
  );
  const after = scanFileContent("fixture.ts", bumped);
  const beforeA = before.entries.find((e) => e.key === "fixture.ts::route-a")!;
  const afterA = after.entries.find((e) => e.key === "fixture.ts::route-a")!;
  assert.deepEqual(beforeA.versions, ["v1"]);
  assert.deepEqual(afterA.versions, ["v2"]);
  assert.notEqual(beforeA.sectionHash, afterA.sectionHash);
});

test("scanFileContent: an unmarked route remains conservatively protected -- any edit anywhere in its section changes the hash", () => {
  const withComment = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    '  const prompt = "hello";',
    "  // @end-prompt-region route-a",
    "});",
    "",
    'router.post("/api/route-b", async (req, res) => {',
    "  const cacheKey = `route-b:v1:${y}`;",
    "  // just a comment, no prompt-region markers here",
    '  const prompt = "world";',
    "});",
  );
  const before = scanFileContent("fixture.ts", baseFixture());
  const after = scanFileContent("fixture.ts", withComment);
  const beforeB = before.entries.find((e) => e.key === "fixture.ts::route-b")!;
  const afterB = after.entries.find((e) => e.key === "fixture.ts::route-b")!;
  assert.equal(beforeB.extraction, "section-fallback");
  assert.equal(afterB.extraction, "section-fallback");
  assert.notEqual(beforeB.sectionHash, afterB.sectionHash);
});

// --- marker structural validation -------------------------------------------

test("scanFileContent: a version token outside a marked region is rejected", () => {
  const bad = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  const cacheKey = `route-a:v1:${x}`;",
    "  // @prompt-region route-a",
    '  const prompt = "hello";',
    "  // @end-prompt-region route-a",
    "});",
  );
  const result = scanFileContent("fixture.ts", bad);
  assert.equal(
    result.entries.find((e) => e.key === "fixture.ts::route-a"),
    undefined,
  );
  assert.ok(
    result.issues.some((i) => i.message.includes("outside the marked regions")),
  );
});

test("scanFileContent: nested @prompt-region markers are rejected", () => {
  const bad = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    "  // @prompt-region route-a",
    '  const prompt = "hello";',
    "  // @end-prompt-region route-a",
    "  // @end-prompt-region route-a",
    "});",
  );
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(result.issues.some((i) => i.message.includes("nested")));
});

test("scanFileContent: unmatched begin marker is rejected", () => {
  const bad = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    "});",
  );
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(
    result.issues.some((i) => i.message.includes("unmatched @prompt-region")),
  );
});

test("scanFileContent: unmatched end marker is rejected", () => {
  const bad = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  const cacheKey = `route-a:v1:${x}`;",
    "  // @end-prompt-region route-a",
    "});",
  );
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(
    result.issues.some((i) =>
      i.message.includes("unmatched @end-prompt-region"),
    ),
  );
});

test("scanFileContent: mismatched end-marker slug is rejected", () => {
  const bad = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    "  // @end-prompt-region route-b",
    "});",
  );
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(result.issues.some((i) => i.message.includes("mismatched")));
});

test("scanFileContent: wrong-route marker slug is rejected", () => {
  const bad = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-b",
    "  const cacheKey = `route-a:v1:${x}`;",
    "  // @end-prompt-region route-b",
    "});",
  );
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(result.issues.some((i) => i.message.includes("wrong-route")));
});

test("scanFileContent: an empty @prompt-region is rejected", () => {
  const bad = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  // @end-prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    "});",
  );
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(result.issues.some((i) => i.message.includes("empty")));
});

test("scanFileContent: multiple ordered marker pairs for the same route are supported", () => {
  const multi = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  // @prompt-region route-a",
    "  const cacheKey = `route-a:v1:${x}`;",
    "  // @end-prompt-region route-a",
    '  req.log.info("unrelated");',
    "  // @prompt-region route-a",
    '  const prompt = "hello";',
    "  // @end-prompt-region route-a",
    "});",
  );
  const result = scanFileContent("fixture.ts", multi);
  assert.equal(result.issues.length, 0);
  const entry = result.entries.find((e) => e.key === "fixture.ts::route-a")!;
  assert.equal(entry.extraction, "marked");
  assert.deepEqual(entry.versions, ["v1"]);
});

test("scanFileContent: duplicate route entry keys are rejected", () => {
  const dup = lines(
    'router.post("/api/route-a", async (req, res) => {',
    "  const cacheKey = `route-a:v1:${x}`;",
    "});",
    "",
    'router.post("/api/route-a", async (req, res) => {',
    "  const cacheKey = `route-a:v1:${z}`;",
    "});",
  );
  const result = scanFileContent("fixture.ts", dup);
  assert.ok(
    result.issues.some((i) => i.message.includes("duplicate route entry key")),
  );
});

// --- module-scope (shared code above the first route) ----------------------

test("scanFileContent: a shared cache key above the first route becomes a module entry", () => {
  const withPreamble =
    lines("const nbhdKey = `nbhd:v2:${lat}`;", "") + baseFixture();
  const result = scanFileContent("fixture.ts", withPreamble);
  const moduleEntry = result.entries.find((e) => e.key === "fixture.ts");
  assert.ok(moduleEntry);
  assert.equal(moduleEntry!.kind, "module");
  assert.equal(moduleEntry!.extraction, "module-prefix");
  assert.deepEqual(moduleEntry!.versions, ["v2"]);
});

// --- extractModulePromptRegions (direct unit tests) -------------------------

test("extractModulePromptRegions: no markers returns an empty map and no errors (preserves the whole-prefix fallback path)", () => {
  const { spansBySlug, errors } = extractModulePromptRegions(
    "const nbhdKey = `nbhd:v2:${lat}`;\n",
    "f.ts",
  );
  assert.equal(errors.length, 0);
  assert.equal(spansBySlug.size, 0);
});

test("extractModulePromptRegions: parses multiple distinct slugs into separate span groups", () => {
  const moduleText = lines(
    "// @prompt-region nbhd-label",
    "const a = `nbhd:v2:${lat}`;",
    "// @end-prompt-region nbhd-label",
    "// @prompt-region wiki-summary",
    "const b = `wiki:v3:${lang}`;",
    "// @end-prompt-region wiki-summary",
  );
  const { spansBySlug, errors } = extractModulePromptRegions(
    moduleText,
    "f.ts",
  );
  assert.equal(errors.length, 0);
  assert.deepEqual([...spansBySlug.keys()].sort(), [
    "nbhd-label",
    "wiki-summary",
  ]);
  assert.equal(spansBySlug.get("nbhd-label")!.length, 1);
  assert.equal(spansBySlug.get("wiki-summary")!.length, 1);
});

test("extractModulePromptRegions: multiple pairs for the same slug are collected in order under one key", () => {
  const moduleText = lines(
    "// @prompt-region nbhd-label",
    "const a = 1;",
    "// @end-prompt-region nbhd-label",
    "// @prompt-region nbhd-label",
    "const b = 2;",
    "// @end-prompt-region nbhd-label",
  );
  const { spansBySlug, errors } = extractModulePromptRegions(
    moduleText,
    "f.ts",
  );
  assert.equal(errors.length, 0);
  assert.equal(spansBySlug.size, 1);
  assert.equal(spansBySlug.get("nbhd-label")!.length, 2);
});

test("extractModulePromptRegions: nested markers are rejected", () => {
  const moduleText = lines(
    "// @prompt-region nbhd-label",
    "// @prompt-region wiki-summary",
    "// @end-prompt-region wiki-summary",
    "// @end-prompt-region nbhd-label",
  );
  const { errors } = extractModulePromptRegions(moduleText, "f.ts");
  assert.ok(errors.some((e) => e.includes("nested")));
});

test("extractModulePromptRegions: unmatched begin marker is rejected", () => {
  const { errors } = extractModulePromptRegions(
    lines("// @prompt-region nbhd-label", "const a = 1;"),
    "f.ts",
  );
  assert.ok(errors.some((e) => e.includes("unmatched @prompt-region")));
});

test("extractModulePromptRegions: unmatched end marker is rejected", () => {
  const { errors } = extractModulePromptRegions(
    lines("const a = 1;", "// @end-prompt-region nbhd-label"),
    "f.ts",
  );
  assert.ok(errors.some((e) => e.includes("unmatched @end-prompt-region")));
});

test("extractModulePromptRegions: an empty region is rejected", () => {
  const { errors } = extractModulePromptRegions(
    lines("// @prompt-region nbhd-label", "// @end-prompt-region nbhd-label"),
    "f.ts",
  );
  assert.ok(errors.some((e) => e.includes("empty")));
});

test("extractModulePromptRegions: mismatched end-marker slug is rejected", () => {
  const { errors } = extractModulePromptRegions(
    lines(
      "// @prompt-region nbhd-label",
      "const a = 1;",
      "// @end-prompt-region wiki-summary",
    ),
    "f.ts",
  );
  assert.ok(errors.some((e) => e.includes("mismatched")));
});

// --- scanFileContent: module-prefix with markers, integrated ---------------
// (multiple independent cache-key systems sharing the module prefix, as in
// the real routes/explore/index.ts nbhd-label / wiki-summary / wiki-photo
// split)

function moduleWithMarkersFixture(opts?: {
  nbhdBody?: string;
  wikiBody?: string;
}): string {
  const nbhdBody = opts?.nbhdBody ?? "const nbhdKey = `nbhd:v2:${lat}`;";
  const wikiBody = opts?.wikiBody ?? "const wikiKey = `wiki:v3:${lang}`;";
  return (
    lines(
      "// @prompt-region nbhd-label",
      nbhdBody,
      "// @end-prompt-region nbhd-label",
      "",
      "// @prompt-region wiki-summary",
      wikiBody,
      "// @end-prompt-region wiki-summary",
      "",
    ) + baseFixture()
  );
}

test("scanFileContent: multiple named module regions produce separate, independently keyed and versioned entries, and the old bare-filePath entry disappears", () => {
  const result = scanFileContent("fixture.ts", moduleWithMarkersFixture());
  assert.equal(result.issues.length, 0);

  // The old whole-prefix key must be gone -- this is exactly the condition
  // updatePromptManifest.ts's existing generic stale-diffing logic relies on
  // to remove it automatically once markers are introduced.
  assert.equal(
    result.entries.find((e) => e.key === "fixture.ts"),
    undefined,
  );

  const nbhd = result.entries.find(
    (e) => e.key === "fixture.ts::module:nbhd-label",
  )!;
  assert.ok(nbhd);
  assert.equal(nbhd.kind, "module");
  assert.equal(nbhd.extraction, "marked");
  assert.deepEqual(nbhd.versions, ["v2"]);

  const wiki = result.entries.find(
    (e) => e.key === "fixture.ts::module:wiki-summary",
  )!;
  assert.ok(wiki);
  assert.equal(wiki.kind, "module");
  assert.equal(wiki.extraction, "marked");
  assert.deepEqual(wiki.versions, ["v3"]);

  assert.notEqual(nbhd.sectionHash, wiki.sectionHash);
});

test("scanFileContent: editing one module region's content does not change a sibling module region's hash", () => {
  const before = scanFileContent("fixture.ts", moduleWithMarkersFixture());
  const after = scanFileContent(
    "fixture.ts",
    moduleWithMarkersFixture({
      nbhdBody: "const nbhdKey = `nbhd:v2:${lat}`; // edited",
    }),
  );
  const beforeNbhd = before.entries.find(
    (e) => e.key === "fixture.ts::module:nbhd-label",
  )!;
  const afterNbhd = after.entries.find(
    (e) => e.key === "fixture.ts::module:nbhd-label",
  )!;
  assert.notEqual(beforeNbhd.sectionHash, afterNbhd.sectionHash);

  const beforeWiki = before.entries.find(
    (e) => e.key === "fixture.ts::module:wiki-summary",
  )!;
  const afterWiki = after.entries.find(
    (e) => e.key === "fixture.ts::module:wiki-summary",
  )!;
  assert.equal(beforeWiki.sectionHash, afterWiki.sectionHash);
  assert.deepEqual(beforeWiki.versions, afterWiki.versions);
});

test("scanFileContent: multiple ordered marker pairs for the same module-prefix slug are merged into a single entry (duplicate slugs are supported, not rejected)", () => {
  const dup =
    lines(
      "// @prompt-region nbhd-label",
      "const nbhdKeyPart1 = `nbhd:v2:${lat}`;",
      "// @end-prompt-region nbhd-label",
      "  // unrelated line between the two spans",
      "// @prompt-region nbhd-label",
      "const nbhdKeyPart2 = `nbhd extra, no token here`;",
      "// @end-prompt-region nbhd-label",
      "",
    ) + baseFixture();
  const result = scanFileContent("fixture.ts", dup);
  assert.equal(result.issues.length, 0);
  const matches = result.entries.filter(
    (e) => e.key === "fixture.ts::module:nbhd-label",
  );
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0]!.versions, ["v2"]);
});

test("scanFileContent: nested @prompt-region markers in the module prefix are rejected and no module entries are produced", () => {
  const bad =
    lines(
      "// @prompt-region nbhd-label",
      "const nbhdKey = `nbhd:v2:${lat}`;",
      "// @prompt-region nbhd-label",
      "const x = 1;",
      "// @end-prompt-region nbhd-label",
      "// @end-prompt-region nbhd-label",
      "",
    ) + baseFixture();
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(
    result.issues.some(
      (i) =>
        i.message.includes("nested") && i.message.includes("module prefix"),
    ),
  );
  assert.equal(
    result.entries.find((e) => e.key.includes("::module:")),
    undefined,
  );
});

test("scanFileContent: unmatched begin marker in the module prefix is rejected", () => {
  const bad =
    lines(
      "// @prompt-region nbhd-label",
      "const nbhdKey = `nbhd:v2:${lat}`;",
      "",
    ) + baseFixture();
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(
    result.issues.some(
      (i) =>
        i.message.includes("unmatched @prompt-region") &&
        i.message.includes("module prefix"),
    ),
  );
});

test("scanFileContent: unmatched end marker in the module prefix is rejected", () => {
  const bad =
    lines(
      "const nbhdKey = `nbhd:v2:${lat}`;",
      "// @end-prompt-region nbhd-label",
      "",
    ) + baseFixture();
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(
    result.issues.some(
      (i) =>
        i.message.includes("unmatched @end-prompt-region") &&
        i.message.includes("module prefix"),
    ),
  );
});

test("scanFileContent: an empty @prompt-region in the module prefix is rejected", () => {
  const bad =
    lines(
      "// @prompt-region nbhd-label",
      "// @end-prompt-region nbhd-label",
      "const nbhdKey = `nbhd:v2:${lat}`;",
      "",
    ) + baseFixture();
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(
    result.issues.some(
      (i) => i.message.includes("empty") && i.message.includes("module prefix"),
    ),
  );
});

test("scanFileContent: overlapping module-prefix regions with mismatched slugs interleaved are rejected", () => {
  const bad =
    lines(
      "// @prompt-region nbhd-label",
      "const nbhdKey = `nbhd:v2:${lat}`;",
      "// @prompt-region wiki-summary",
      "const wikiKey = `wiki:v3:${lang}`;",
      "// @end-prompt-region nbhd-label",
      "// @end-prompt-region wiki-summary",
      "",
    ) + baseFixture();
  const result = scanFileContent("fixture.ts", bad);
  assert.ok(result.issues.length > 0);
  assert.equal(
    result.entries.find((e) => e.key.includes("::module:")),
    undefined,
  );
});

test("scanFileContent: a version token outside a marked module-prefix region is rejected", () => {
  const bad =
    lines(
      "const strayKey = `wiki:v3:${lang}`;",
      "// @prompt-region nbhd-label",
      "const nbhdKey = `nbhd:v2:${lat}`;",
      "// @end-prompt-region nbhd-label",
      "",
    ) + baseFixture();
  const result = scanFileContent("fixture.ts", bad);
  assert.equal(
    result.entries.find((e) => e.key.includes("::module:")),
    undefined,
  );
  assert.ok(
    result.issues.some(
      (i) =>
        i.message.includes("outside the marked regions") &&
        i.message.includes("module prefix"),
    ),
  );
});

test("scanFileContent: introducing module-prefix markers replaces the old bare-filePath module entry with the new per-slug entries (the exact transition updatePromptManifest.ts's generic stale/added diffing relies on)", () => {
  const before = scanFileContent(
    "fixture.ts",
    lines("const nbhdKey = `nbhd:v2:${lat}`;", "") + baseFixture(),
  );
  assert.ok(before.entries.some((e) => e.key === "fixture.ts"));

  const after = scanFileContent("fixture.ts", moduleWithMarkersFixture());
  assert.equal(
    after.entries.find((e) => e.key === "fixture.ts"),
    undefined,
  );
  assert.ok(
    after.entries.some((e) => e.key === "fixture.ts::module:nbhd-label"),
  );
  assert.ok(
    after.entries.some((e) => e.key === "fixture.ts::module:wiki-summary"),
  );
});

// --- discover-style multi-path route (two @prompt-region spans covering
// two independent LLM call paths, mirroring the real /explore/discover
// route's OSM-anchor + non-anchor structure) --------------------------------

function discoverStyleFixture(opts?: {
  pathAPrompt?: string;
  pathBPrompt?: string;
  extraLogging?: string;
  docComment?: string;
}): string {
  const pathAPrompt =
    opts?.pathAPrompt ?? 'const prompt = "path-a prompt text";';
  const pathBPrompt =
    opts?.pathBPrompt ?? 'const prompt = "path-b prompt text";';
  const extraLogging = opts?.extraLogging ?? "";
  const docComment =
    opts?.docComment ??
    "  // note: unrelated to the shared cache (fake-v2, keyed by lang)";
  return lines(
    'router.post("/api/discover", async (req, res) => {',
    "  // @prompt-region discover",
    "  const discoverCacheKey = `discover:v1:${x}`;",
    "  // @end-prompt-region discover",
    docComment,
    "  // Path A: anchor-based LLM call",
    "  // @prompt-region discover",
    "  " + pathAPrompt,
    "  // @end-prompt-region discover",
    extraLogging,
    "  // Path B: non-anchor LLM call",
    "  // @prompt-region discover",
    "  " + pathBPrompt,
    "  // @end-prompt-region discover",
    "});",
  );
}

test("scanFileContent (discover-style): logging added outside both marked spans does not change the hash or require a version bump", () => {
  const before = scanFileContent("discover.ts", discoverStyleFixture());
  const after = scanFileContent(
    "discover.ts",
    discoverStyleFixture({
      extraLogging: '  req.log.info("new diagnostic-only log line");',
    }),
  );
  assert.equal(before.issues.length, 0);
  assert.equal(after.issues.length, 0);

  const beforeEntry = before.entries.find(
    (e) => e.key === "discover.ts::discover",
  )!;
  const afterEntry = after.entries.find(
    (e) => e.key === "discover.ts::discover",
  )!;
  assert.equal(beforeEntry.sectionHash, afterEntry.sectionHash);
  assert.deepEqual(beforeEntry.versions, afterEntry.versions);
});

test("scanFileContent (discover-style): a prompt/cache-key change inside either marked span changes the hash without a version bump (the failure case the check script must reject)", () => {
  const before = scanFileContent("discover.ts", discoverStyleFixture());
  const beforeEntry = before.entries.find(
    (e) => e.key === "discover.ts::discover",
  )!;

  const pathAChanged = scanFileContent(
    "discover.ts",
    discoverStyleFixture({
      pathAPrompt: 'const prompt = "path-a prompt, edited";',
    }),
  );
  const pathAEntry = pathAChanged.entries.find(
    (e) => e.key === "discover.ts::discover",
  )!;
  assert.notEqual(beforeEntry.sectionHash, pathAEntry.sectionHash);
  assert.deepEqual(beforeEntry.versions, pathAEntry.versions);

  const pathBChanged = scanFileContent(
    "discover.ts",
    discoverStyleFixture({
      pathBPrompt: 'const prompt = "path-b prompt, edited";',
    }),
  );
  const pathBEntry = pathBChanged.entries.find(
    (e) => e.key === "discover.ts::discover",
  )!;
  assert.notEqual(beforeEntry.sectionHash, pathBEntry.sectionHash);
  assert.deepEqual(beforeEntry.versions, pathBEntry.versions);
});

test("scanFileContent (discover-style): both LLM paths are covered by the combined hash (changing only path A is distinguishable from changing only path B)", () => {
  const pathAChanged = scanFileContent(
    "discover.ts",
    discoverStyleFixture({
      pathAPrompt: 'const prompt = "path-a prompt, edited";',
    }),
  );
  const pathBChanged = scanFileContent(
    "discover.ts",
    discoverStyleFixture({
      pathBPrompt: 'const prompt = "path-b prompt, edited";',
    }),
  );
  const pathAEntry = pathAChanged.entries.find(
    (e) => e.key === "discover.ts::discover",
  )!;
  const pathBEntry = pathBChanged.entries.find(
    (e) => e.key === "discover.ts::discover",
  )!;
  // Both edits are detected, and they are NOT confused with each other --
  // proof that path A's and path B's marked spans are both actually
  // contributing to the hash (not just one of the two @prompt-region pairs).
  assert.notEqual(pathAEntry.sectionHash, pathBEntry.sectionHash);
});

test("scanFileContent (discover-style): a second marked span left unclosed is rejected (incomplete multi-span region)", () => {
  const incomplete = lines(
    'router.post("/api/discover", async (req, res) => {',
    "  const discoverCacheKey = `discover:v1:${x}`;",
    "  // @prompt-region discover",
    '  const prompt = "path-a prompt text";',
    "  // @end-prompt-region discover",
    "  // @prompt-region discover",
    '  const prompt = "path-b prompt text";',
    "});",
  );
  const result = scanFileContent("discover.ts", incomplete);
  assert.equal(
    result.entries.find((e) => e.key === "discover.ts::discover"),
    undefined,
  );
  assert.ok(
    result.issues.some((i) => i.message.includes("unmatched @prompt-region")),
  );
});

test("scanFileContent (discover-style): overlapping regions with mismatched slugs interleaved are rejected", () => {
  const overlapping = lines(
    'router.post("/api/discover", async (req, res) => {',
    "  // @prompt-region discover",
    "  const cacheKey = `discover:v1:${x}`;",
    '  const prompt = "path-a prompt text";',
    "  // @prompt-region walk-narration",
    '  const prompt2 = "path-b prompt text";',
    "  // @end-prompt-region discover",
    "  // @end-prompt-region walk-narration",
    "});",
  );
  const result = scanFileContent("discover.ts", overlapping);
  assert.ok(result.issues.length > 0);
});

test("scanFileContent (discover-style): a doc comment with a cache-like example (e.g. wiki:v2) outside the marked spans is treated as a real token and rejects the route -- rewording the comment (no colon-adjacent version pattern) fixes it", () => {
  const withStrayToken = discoverStyleFixture({
    docComment:
      "  // note: reuses the shared in-memory cache (wiki:v2:{lang}:{title}) elsewhere",
  });
  const before = scanFileContent("discover.ts", withStrayToken);
  assert.equal(
    before.entries.find((e) => e.key === "discover.ts::discover"),
    undefined,
  );
  assert.ok(
    before.issues.some((i) => i.message.includes("outside the marked regions")),
  );

  const reworded = discoverStyleFixture({
    docComment:
      "  // note: reuses the shared in-memory cache (wiki-v2, keyed by lang/title) elsewhere",
  });
  const after = scanFileContent("discover.ts", reworded);
  assert.equal(after.issues.length, 0);
  const entry = after.entries.find((e) => e.key === "discover.ts::discover")!;
  assert.deepEqual(entry.versions, ["v1"]);
});

// --- manifest schema parsing -------------------------------------------------

test("parseManifestFile: recognizes a well-formed v2 manifest", () => {
  const raw = JSON.stringify({
    description: "x",
    schemaVersion: 2,
    entries: {
      "a.ts::r": {
        kind: "route",
        extraction: "marked",
        sectionHash: "h",
        versions: ["v1"],
        registered: "2026-01-01",
      },
    },
  });
  assert.equal(parseManifestFile(raw).kind, "v2");
});

test("parseManifestFile: recognizes the legacy (v1) per-file shape", () => {
  const raw = JSON.stringify({
    description: "x",
    entries: {
      "a.ts": { sectionHash: "h", versions: ["v1"], registered: "2026-01-01" },
    },
  });
  const parsed = parseManifestFile(raw);
  assert.equal(parsed.kind, "v1-legacy");
  assert.ok(parsed.legacyEntries);
});

test("parseManifestFile: refuses an unrecognized future schemaVersion rather than treating it as legacy or v2", () => {
  const raw = JSON.stringify({
    description: "x",
    schemaVersion: 3,
    entries: {
      "a.ts": { sectionHash: "h", versions: ["v1"], registered: "x" },
    },
  });
  assert.equal(parseManifestFile(raw).kind, "unknown");
});

test("parseManifestFile: treats a missing/empty entries object as empty, not legacy or v2", () => {
  assert.equal(
    parseManifestFile(JSON.stringify({ description: "x" })).kind,
    "empty",
  );
});
