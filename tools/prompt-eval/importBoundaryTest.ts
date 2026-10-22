/**
 * Import-boundary check (Task M safety requirement): asserts that
 * lib/copyGenRequestBuilder.ts — and everything it transitively imports —
 * never imports DB/config/logger/runtime/HTTP/OpenAI-client modules. Run via
 * tsx (same convention as goldenTest.ts):
 *
 *   scripts/node_modules/.bin/tsx tools/prompt-eval/importBoundaryTest.ts
 *
 * Static source inspection only — no imports are actually loaded beyond
 * what TypeScript/Node needs to read the files as text.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ENTRY = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/copyGenRequestBuilder.ts",
);

const FORBIDDEN_IMPORT_PATTERNS: RegExp[] = [
  /^@workspace\/db/,
  /^openai$/,
  /pino|winston/, // logger packages
  /\bprocess\.env\b/, // no direct env reads anywhere in the pure graph
];

const BANNED_SPECIFIER_SUBSTRINGS = [
  "db",
  "config",
  "logger",
  "openai",
  "fastify",
  "express",
];

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importRe = /import\s+(?:type\s+)?[^"']*from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) specifiers.push(m[1]);
  return specifiers;
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  return base.endsWith(".ts") ? base : `${base}.ts`;
}

function walk(filePath: string, visited: Set<string>): void {
  if (visited.has(filePath)) return;
  visited.add(filePath);
  const source = readFileSync(filePath, "utf8");

  for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
    assert.ok(
      !pattern.test(source),
      `${filePath} matches forbidden pattern ${pattern} — pure builder graph must not read env or import db/logger/openai packages.`,
    );
  }

  const specifiers = extractImportSpecifiers(source);
  for (const specifier of specifiers) {
    const lower = specifier.toLowerCase();
    for (const banned of BANNED_SPECIFIER_SUBSTRINGS) {
      assert.ok(
        !lower.includes(banned),
        `${filePath} imports "${specifier}", which contains banned substring "${banned}".`,
      );
    }
    const resolved = resolveRelative(filePath, specifier);
    if (resolved) walk(resolved, visited);
  }
}

const visited = new Set<string>();
walk(ENTRY, visited);

console.log(
  `PASS: ${visited.size} module(s) in the pure copy-gen-request-builder import graph contain no forbidden db/config/logger/openai/env references:`,
);
for (const f of [...visited].sort()) {
  console.log(
    `  - ${join("artifacts/api-server/src/lib", f.split("/lib/")[1] ?? f)}`,
  );
}
