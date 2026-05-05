/**
 * checkPromptManifest.ts
 *
 * CI / lint guard: verifies that every file containing LLM cache-key version
 * tokens has a registered entry in scripts/prompt-manifest.json whose hash
 * still matches.
 *
 * Exits 0  — every covered file matches its manifest entry.
 * Exits 1  — a covered file's hash changed without a version bump.
 * Exits 1  — a covered file is unregistered or has a new version set.
 * Exits 1  — manifest file is missing.
 *
 * How to fix failures:
 *   • Hash mismatch (same versions, different content):
 *       Bump a version token in the affected file
 *       (e.g. detail:v1 → detail:v2), then run
 *       `pnpm run update:prompt-manifest` and commit both files.
 *   • Unregistered file or new version set:
 *       Run `pnpm run update:prompt-manifest` and commit both files.
 */

import { readFileSync, existsSync } from "fs";
import {
  MANIFEST_FILE,
  SCAN_ROOT,
  REPO_ROOT,
  scanFiles,
  parseManifest,
} from "./lib/promptManifestLib.js";
import { relative } from "path";

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
const scanned = scanFiles();

const mismatches: string[] = [];
const unregistered: string[] = [];
const versionChanges: string[] = [];

const seenPaths = new Set<string>();
for (const file of scanned) {
  seenPaths.add(file.filePath);
  const entry = manifest.entries[file.filePath];

  if (!entry) {
    unregistered.push(file.filePath);
    continue;
  }

  const sameVersions =
    entry.versions.length === file.versions.length &&
    entry.versions.every((v, i) => v === file.versions[i]);

  if (entry.sectionHash === file.sectionHash) {
    if (!sameVersions) {
      // Hash matched but versions array drifted — should not happen, but
      // keep the manifest in sync.
      versionChanges.push(file.filePath);
    }
    continue;
  }

  if (sameVersions) {
    mismatches.push(file.filePath);
  } else {
    versionChanges.push(file.filePath);
  }
}

const stale = Object.keys(manifest.entries).filter((p) => !seenPaths.has(p));

if (mismatches.length > 0) {
  fail(
    `The following file(s) changed without a cache-key version bump:\n\n` +
      mismatches.map((k) => `  • ${k}`).join("\n") +
      `\n\n` +
      `For each file listed above, increment a version suffix in the file\n` +
      `(e.g. \`detail:v1:\` → \`detail:v2:\`), then run:\n` +
      `  pnpm run update:prompt-manifest\n` +
      `and commit both files.\n\n` +
      `If your change does NOT affect cached LLM output (pure refactor),\n` +
      `bump a version anyway to keep the cache honest.`,
  );
}

if (unregistered.length > 0 || versionChanges.length > 0 || stale.length > 0) {
  const lines: string[] = [];
  if (unregistered.length > 0) {
    lines.push(
      `New file(s) containing cache-key versions are not yet registered:`,
      ...unregistered.map((k) => `  • ${k}`),
    );
  }
  if (versionChanges.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `File(s) have a new cache-key version set that is not yet registered:`,
      ...versionChanges.map((k) => `  • ${k}`),
    );
  }
  if (stale.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `Manifest entries no longer correspond to any scanned file:`,
      ...stale.map((k) => `  • ${k}`),
    );
  }
  lines.push(
    "",
    `Run \`pnpm run update:prompt-manifest\` to reconcile, then commit both files.`,
  );
  fail(lines.join("\n"));
}

console.log(
  `[prompt-manifest] OK — ${scanned.length} file(s) verified under ${relative(REPO_ROOT, SCAN_ROOT)}.`,
);
