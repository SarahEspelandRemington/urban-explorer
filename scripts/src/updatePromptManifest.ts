/**
 * updatePromptManifest.ts
 *
 * Registers NEW cache-key version entries into scripts/prompt-manifest.json.
 * Existing entries are IMMUTABLE — if a route section's hash has changed
 * without a version bump, this script refuses and tells you to bump first.
 *
 * Workflow after changing a prompt:
 *   1. Increment the cache key version in explore/index.ts (e.g. v1 → v2).
 *   2. Run: pnpm run update:prompt-manifest
 *   3. Commit both explore/index.ts and scripts/prompt-manifest.json.
 *
 * For changes that do NOT affect cached LLM output (pure refactors):
 *   bump the version anyway to keep the cache honest.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  EXPLORE_FILE,
  MANIFEST_FILE,
  MANIFEST_DESCRIPTION,
  extractRouteSections,
  hashText,
  parseManifest,
  type Manifest,
} from "./lib/promptManifestLib.js";

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_FILE)) {
    return { description: MANIFEST_DESCRIPTION, entries: {} };
  }
  return parseManifest(readFileSync(MANIFEST_FILE, "utf8"));
}

const source = readFileSync(EXPLORE_FILE, "utf8");
const sections = extractRouteSections(source);
const manifest = loadManifest();

let added = 0;
let skipped = 0;
const conflicts: string[] = [];
const addedKeys: string[] = [];

for (const [routeKey, sectionText] of sections) {
  const sectionHash = hashText(sectionText);
  const existing = manifest.entries[routeKey];

  if (existing) {
    if (existing.sectionHash === sectionHash) {
      skipped++;
    } else {
      conflicts.push(routeKey);
    }
  } else {
    manifest.entries[routeKey] = {
      sectionHash,
      registered: new Date().toISOString().slice(0, 10),
    };
    added++;
    addedKeys.push(routeKey);
  }
}

if (conflicts.length > 0) {
  console.error(
    `\n[update-prompt-manifest] Cannot update — the following route sections\n` +
      `changed without a cache-key version bump:\n\n` +
      conflicts.map((k) => `  • ${k}`).join("\n") +
      `\n\n` +
      `For each affected route, increment its version suffix in explore/index.ts\n` +
      `(e.g. \`detail:v1:\` → \`detail:v2:\`), then re-run this command.\n`,
  );
  process.exit(1);
}

writeFileSync(
  MANIFEST_FILE,
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);

console.log(
  `[update-prompt-manifest] Done. ${added} added, ${skipped} unchanged.`,
);
if (addedKeys.length > 0) {
  console.log(`  New entries: ${addedKeys.join(", ")}`);
}
