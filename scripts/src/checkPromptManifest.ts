/**
 * checkPromptManifest.ts
 *
 * CI / lint guard: verifies that every module/route containing LLM cache-key
 * version tokens has a registered entry in scripts/prompt-manifest.json
 * whose hash still matches.
 *
 * Exits 0  — every covered module/route matches its manifest entry.
 * Exits 1  — a covered module/route's hash changed without a version bump.
 * Exits 1  — a covered module/route is unregistered or has a new version set.
 * Exits 1  — manifest file is missing.
 * Exits 1  — a source file has a structural @prompt-region marker problem
 *            (unmatched / nested / mismatched / empty / wrong-route marker,
 *            duplicate route key, or a version token outside its route's
 *            marked regions).
 * Exits 1  — the manifest is in the legacy (pre-schemaVersion) format, or an
 *            unrecognized schema — both require running the update script,
 *            which performs the one supported migration path.
 *
 * How to fix failures:
 *   • Hash mismatch (same versions, different content):
 *       Bump a version token in the affected route/file
 *       (e.g. narration:v20 → narration:v21), then run
 *       `pnpm run update:prompt-manifest` and commit both files.
 *   • Unregistered entry or new version set:
 *       Run `pnpm run update:prompt-manifest` and commit both files.
 *   • Legacy/unrecognized manifest schema:
 *       Run `pnpm run update:prompt-manifest` — for the legacy case this
 *       performs the one supported v1→v2 migration and reports exactly
 *       what changed.
 */

import { readFileSync, existsSync } from "fs";
import {
  MANIFEST_FILE,
  SCAN_ROOT,
  REPO_ROOT,
  scanFiles,
  parseManifestFile,
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

const scanned = scanFiles();

if (scanned.issues.length > 0) {
  fail(
    `The following source file(s) have a structural @prompt-region problem\n` +
      `and must be fixed before the manifest can be checked:\n\n` +
      scanned.issues.map((i) => `  • ${i.message}`).join("\n"),
  );
}

const parsed = parseManifestFile(readFileSync(MANIFEST_FILE, "utf8"));

if (parsed.kind === "unknown") {
  fail(
    `prompt-manifest.json has an unrecognized schema (${parsed.unknownReason}).\n` +
      `Refusing to check it automatically — this needs manual reconciliation,\n` +
      `not the standard v1→v2 migration.`,
  );
}

if (parsed.kind === "v1-legacy") {
  fail(
    `prompt-manifest.json is in the legacy (pre-schemaVersion) format.\n` +
      `Run \`pnpm run update:prompt-manifest\` to perform the supported\n` +
      `v1→v2 migration (it verifies every existing cache-key version token\n` +
      `is carried forward before writing anything), then commit the result\n` +
      `and re-run this check.`,
  );
}

const entries = parsed.kind === "v2" ? parsed.manifest!.entries : {};

const mismatches: string[] = [];
const unregistered: string[] = [];
const versionChanges: string[] = [];

const seenKeys = new Set<string>();
for (const scan of scanned.entries) {
  seenKeys.add(scan.key);
  const entry = entries[scan.key];

  if (!entry) {
    unregistered.push(scan.key);
    continue;
  }

  const sameVersions =
    entry.versions.length === scan.versions.length &&
    entry.versions.every((v, i) => v === scan.versions[i]);

  if (entry.sectionHash === scan.sectionHash) {
    if (!sameVersions) {
      versionChanges.push(scan.key);
    }
    continue;
  }

  if (sameVersions) {
    mismatches.push(scan.key);
  } else {
    versionChanges.push(scan.key);
  }
}

const stale = Object.keys(entries).filter((k) => !seenKeys.has(k));

if (mismatches.length > 0) {
  fail(
    `The following module(s)/route(s) changed without a cache-key version bump:\n\n` +
      mismatches.map((k) => `  • ${k}`).join("\n") +
      `\n\n` +
      `For each entry listed above, increment a version suffix\n` +
      `(e.g. \`narration:v20:\` → \`narration:v21:\`), then run:\n` +
      `  pnpm run update:prompt-manifest\n` +
      `and commit both files.\n\n` +
      `If this is a route with @prompt-region markers, double check whether\n` +
      `your change actually touched the marked prompt/cache-key material —\n` +
      `if it didn't, the change shouldn't be inside the marked region.`,
  );
}

if (unregistered.length > 0 || versionChanges.length > 0 || stale.length > 0) {
  const lines: string[] = [];
  if (unregistered.length > 0) {
    lines.push(
      `New module(s)/route(s) containing cache-key versions are not yet registered:`,
      ...unregistered.map((k) => `  • ${k}`),
    );
  }
  if (versionChanges.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `Entry(ies) have a new cache-key version set that is not yet registered:`,
      ...versionChanges.map((k) => `  • ${k}`),
    );
  }
  if (stale.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `Manifest entries no longer correspond to any scanned module/route:`,
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
  `[prompt-manifest] OK — ${scanned.entries.length} entry(ies) verified under ${relative(REPO_ROOT, SCAN_ROOT)}.`,
);
