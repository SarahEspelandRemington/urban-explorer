/**
 * checkPromptManifest.ts
 *
 * CI / lint guard: verifies that every LLM-backed route section in
 * explore/index.ts has a registered entry in scripts/prompt-manifest.json
 * whose hash still matches.
 *
 * Exits 0  — all route sections match their manifest entries.
 * Exits 1  — a route section's hash changed without a version bump.
 * Exits 1  — a route section is unregistered (new version not recorded yet).
 * Exits 1  — manifest file is missing.
 *
 * How to fix failures:
 *   • Hash mismatch (same version, different content):
 *       Bump the version in the cache key (e.g. detail:v1 → detail:v2),
 *       then run `pnpm run update:prompt-manifest` and commit both files.
 *   • Unregistered entry (new version after a bump):
 *       Run `pnpm run update:prompt-manifest` and commit both files.
 */

import { readFileSync, existsSync } from "fs";
import {
  EXPLORE_FILE,
  MANIFEST_FILE,
  extractRouteSections,
  hashText,
  parseManifest,
} from "./lib/promptManifestLib.js";

function fail(message: string): never {
  console.error(`\n[prompt-manifest] FAIL\n\n${message}\n`);
  process.exit(1);
}

if (!existsSync(MANIFEST_FILE)) {
  fail(
    `prompt-manifest.json not found.\n` +
      `  Run \`pnpm run update:prompt-manifest\` to initialise it, then commit the result.`,
  );
}

const manifest = parseManifest(readFileSync(MANIFEST_FILE, "utf8"));
const source = readFileSync(EXPLORE_FILE, "utf8");
const sections = extractRouteSections(source);

const mismatches: string[] = [];
const unregistered: string[] = [];

for (const [routeKey, sectionText] of sections) {
  const currentHash = hashText(sectionText);
  const entry = manifest.entries[routeKey];

  if (!entry) {
    unregistered.push(routeKey);
  } else if (entry.sectionHash !== currentHash) {
    mismatches.push(routeKey);
  }
}

if (mismatches.length > 0) {
  fail(
    `The following route sections changed without a cache-key version bump:\n\n` +
      mismatches.map((k) => `  • ${k}`).join("\n") +
      `\n\n` +
      `For each route listed above, increment its version suffix in\n` +
      `  artifacts/api-server/src/routes/explore/index.ts\n` +
      `  (e.g. \`detail:v1:\` → \`detail:v2:\`)\n` +
      `then run:\n` +
      `  pnpm run update:prompt-manifest\n` +
      `and commit both files.\n\n` +
      `If your change does NOT affect cached LLM output (pure refactor),\n` +
      `bump the version anyway to keep the cache honest.`,
  );
}

if (unregistered.length > 0) {
  fail(
    `The following cache-key versions are not yet in prompt-manifest.json:\n\n` +
      unregistered.map((k) => `  • ${k}`).join("\n") +
      `\n\n` +
      `Run \`pnpm run update:prompt-manifest\` to register them, then commit both files.`,
  );
}

console.log(
  `[prompt-manifest] OK — ${sections.size} route section(s) verified.`,
);
