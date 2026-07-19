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
