/**
 * updatePromptManifest.ts
 *
 * Registers / refreshes per-file entries in scripts/prompt-manifest.json.
 * Existing hashes are IMMUTABLE for an unchanged version set — if a file's
 * hash changed without bumping any cache-key version, this script refuses
 * and tells you to bump first.
 *
 * Workflow after changing a prompt:
 *   1. Increment a cache key version in the affected file (e.g. v1 → v2).
 *   2. Run: pnpm run update:prompt-manifest
 *   3. Commit both the source file and scripts/prompt-manifest.json.
 *
 * For changes that do NOT affect cached LLM output (pure refactors):
 *   bump a version anyway to keep the cache honest.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  MANIFEST_FILE,
  MANIFEST_DESCRIPTION,
  scanFiles,
  parseManifest,
  type Manifest,
} from "./lib/promptManifestLib.js";

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_FILE)) {
    return { description: MANIFEST_DESCRIPTION, entries: {} };
  }
  return parseManifest(readFileSync(MANIFEST_FILE, "utf8"));
}

const scanned = scanFiles();
const manifest = loadManifest();
manifest.description = MANIFEST_DESCRIPTION;

let added = 0;
let updated = 0;
let skipped = 0;
const conflicts: string[] = [];
const addedKeys: string[] = [];
const updatedKeys: string[] = [];

const today = new Date().toISOString().slice(0, 10);
const seenPaths = new Set<string>();

for (const file of scanned) {
  seenPaths.add(file.filePath);
  const existing = manifest.entries[file.filePath];

  if (!existing) {
    manifest.entries[file.filePath] = {
      sectionHash: file.sectionHash,
      versions: file.versions,
      registered: today,
    };
    added++;
    addedKeys.push(file.filePath);
    continue;
  }

  const sameVersions =
    existing.versions.length === file.versions.length &&
    existing.versions.every((v, i) => v === file.versions[i]);

  if (existing.sectionHash === file.sectionHash && sameVersions) {
    skipped++;
    continue;
  }

  if (!sameVersions) {
    // Versions changed → treat as an explicit bump and refresh the entry.
    manifest.entries[file.filePath] = {
      sectionHash: file.sectionHash,
      versions: file.versions,
      registered: today,
    };
    updated++;
    updatedKeys.push(file.filePath);
  } else {
    // Hash drifted with no version change → refuse.
    conflicts.push(file.filePath);
  }
}

const stalePaths = Object.keys(manifest.entries).filter(
  (p) => !seenPaths.has(p),
);
for (const p of stalePaths) {
  delete manifest.entries[p];
}

if (conflicts.length > 0) {
  console.error(
    `\n[update-prompt-manifest] Cannot update — the following file(s)\n` +
      `changed without a cache-key version bump:\n\n` +
      conflicts.map((k) => `  • ${k}`).join("\n") +
      `\n\n` +
      `For each affected file, increment a version suffix\n` +
      `(e.g. \`detail:v1:\` → \`detail:v2:\`), then re-run this command.\n`,
  );
  process.exit(1);
}

const sortedEntries: Manifest["entries"] = {};
for (const key of Object.keys(manifest.entries).sort()) {
  sortedEntries[key] = manifest.entries[key];
}
manifest.entries = sortedEntries;

writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(
  `[update-prompt-manifest] Done. ${added} added, ${updated} updated, ${skipped} unchanged` +
    (stalePaths.length > 0 ? `, ${stalePaths.length} stale removed` : "") +
    `.`,
);
if (addedKeys.length > 0) {
  console.log(`  New entries: ${addedKeys.join(", ")}`);
}
if (updatedKeys.length > 0) {
  console.log(`  Updated entries: ${updatedKeys.join(", ")}`);
}
if (stalePaths.length > 0) {
  console.log(`  Removed stale entries: ${stalePaths.join(", ")}`);
}
