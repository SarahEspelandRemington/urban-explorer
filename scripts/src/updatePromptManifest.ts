/**
 * updatePromptManifest.ts
 *
 * Registers / refreshes entries in scripts/prompt-manifest.json. Existing
 * hashes are IMMUTABLE for an unchanged version set — if an entry's hash
 * changed without bumping any cache-key version, this script refuses and
 * tells you to bump first.
 *
 * Workflow after changing prompt/cache-key content:
 *   1. Increment a cache key version in the affected file (e.g. v1 → v2).
 *   2. Run: pnpm run update:prompt-manifest
 *   3. Commit both the source file(s) and scripts/prompt-manifest.json.
 *
 * For changes that do NOT affect cached LLM output (pure refactors) to
 * material inside a route's marked @prompt-region: bump a version anyway
 * to keep the cache honest. Changes OUTSIDE a route's marked regions (e.g.
 * logging) never require a bump.
 *
 * ## Schema migration (v1 → v2)
 *
 * If the on-disk manifest is in the legacy pre-schemaVersion format (one
 * flat entry per file), this script performs the ONE supported migration:
 * it rescans the source under the new per-module/per-route schema and,
 * before writing anything, verifies that every cache-key version token
 * present in the legacy manifest is still present somewhere in the new
 * entries derived from the same file. If any token would be lost, the
 * migration is aborted and nothing is written. No cache-key version number
 * is ever changed by this migration — only the manifest's own bookkeeping
 * format changes.
 *
 * Any manifest schema this script does not explicitly recognize (v2, or
 * the known legacy v1 shape) is refused outright — never silently
 * discarded or overwritten.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  MANIFEST_FILE,
  MANIFEST_DESCRIPTION,
  SCHEMA_VERSION,
  scanFiles,
  parseManifestFile,
  type Manifest,
  type ScannedEntry,
} from "./lib/promptManifestLib.js";

function baseFileOf(key: string): string {
  const idx = key.indexOf("::");
  return idx === -1 ? key : key.slice(0, idx);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const scanned = scanFiles();

if (scanned.issues.length > 0) {
  console.error(
    `\n[update-prompt-manifest] Cannot update — the following source file(s)\n` +
      `have a structural @prompt-region problem and must be fixed first:\n\n` +
      scanned.issues.map((i) => `  • ${i.message}`).join("\n") +
      "\n",
  );
  process.exit(1);
}

if (!existsSync(MANIFEST_FILE)) {
  writeManifest(freshManifest(scanned.entries), {
    added: scanned.entries.length,
    updated: 0,
    skipped: 0,
    stale: [],
  });
  process.exit(0);
}

const parsed = parseManifestFile(readFileSync(MANIFEST_FILE, "utf8"));

if (parsed.kind === "unknown") {
  console.error(
    `\n[update-prompt-manifest] Cannot update — prompt-manifest.json has an\n` +
      `unrecognized schema (${parsed.unknownReason}).\n` +
      `Refusing to touch it automatically. This needs manual reconciliation.\n`,
  );
  process.exit(1);
}

if (parsed.kind === "empty") {
  writeManifest(freshManifest(scanned.entries), {
    added: scanned.entries.length,
    updated: 0,
    skipped: 0,
    stale: [],
  });
  process.exit(0);
}

if (parsed.kind === "v1-legacy") {
  migrateV1ToV2(parsed.legacyEntries!, scanned.entries);
  process.exit(0);
}

// parsed.kind === "v2" — steady-state incremental update.
updateV2(parsed.manifest!, scanned.entries);

// -------------------------------------------------------------------------

function freshManifest(entries: ScannedEntry[]): Manifest {
  const manifest: Manifest = {
    description: MANIFEST_DESCRIPTION,
    schemaVersion: SCHEMA_VERSION,
    entries: {},
  };
  const day = today();
  for (const e of entries) {
    manifest.entries[e.key] = {
      kind: e.kind,
      extraction: e.extraction,
      sectionHash: e.sectionHash,
      versions: e.versions,
      registered: day,
    };
  }
  return manifest;
}

function writeManifest(
  manifest: Manifest,
  summary: { added: number; updated: number; skipped: number; stale: string[] },
): void {
  const sorted: Manifest["entries"] = {};
  for (const key of Object.keys(manifest.entries).sort()) {
    sorted[key] = manifest.entries[key]!;
  }
  manifest.entries = sorted;
  manifest.description = MANIFEST_DESCRIPTION;
  manifest.schemaVersion = SCHEMA_VERSION;

  writeFileSync(
    MANIFEST_FILE,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  console.log(
    `[update-prompt-manifest] Done. ${summary.added} added, ${summary.updated} updated, ${summary.skipped} unchanged` +
      (summary.stale.length > 0
        ? `, ${summary.stale.length} stale removed`
        : "") +
      `.`,
  );
  if (summary.stale.length > 0) {
    console.log(`  Removed stale entries: ${summary.stale.join(", ")}`);
  }
}

function migrateV1ToV2(
  legacyEntries: Record<
    string,
    { sectionHash: string; versions: string[]; registered: string }
  >,
  newEntries: ScannedEntry[],
): void {
  // Build: for every file that had a legacy (v1) entry, the union of
  // version tokens the NEW (v2) entries derived from that same file cover.
  const newVersionsByFile = new Map<string, Set<string>>();
  for (const e of newEntries) {
    const file = baseFileOf(e.key);
    const set = newVersionsByFile.get(file) ?? new Set<string>();
    for (const v of e.versions) set.add(v);
    newVersionsByFile.set(file, set);
  }

  const lost: { file: string; versions: string[] }[] = [];
  const carried: { file: string; versions: string[] }[] = [];
  for (const [file, legacy] of Object.entries(legacyEntries)) {
    const newSet = newVersionsByFile.get(file) ?? new Set<string>();
    const missing = legacy.versions.filter((v) => !newSet.has(v));
    if (missing.length > 0) {
      lost.push({ file, versions: missing });
    } else {
      carried.push({ file, versions: legacy.versions });
    }
  }

  if (lost.length > 0) {
    console.error(
      `\n[update-prompt-manifest] Migration ABORTED — nothing was written.\n\n` +
        `The following legacy (v1) cache-key version token(s) would not be\n` +
        `covered by any entry under the new (v2) scan. This should not\n` +
        `happen for an unmodified source tree; it indicates either a real\n` +
        `source change that also removed a cache key, or a bug in the new\n` +
        `extraction logic. Investigate before re-running:\n\n` +
        lost
          .map((l) => `  • ${l.file}: [${l.versions.join(", ")}]`)
          .join("\n") +
        "\n",
    );
    process.exit(1);
  }

  const manifest = freshManifest(newEntries);
  writeFileSync(
    MANIFEST_FILE,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  const totalTokens = carried.reduce((n, c) => n + c.versions.length, 0);
  console.log(
    `\n[update-prompt-manifest] Migrated prompt-manifest.json: legacy (v1) → schemaVersion ${SCHEMA_VERSION}.\n` +
      `  ${Object.keys(legacyEntries).length} legacy file entry(ies) → ${newEntries.length} new module/route entry(ies).\n` +
      `  Version tokens verified carried forward across ${carried.length} file(s), ${totalTokens} token(s) total, 0 lost.\n` +
      `  No cache-key version number was changed by this migration — only\n` +
      `  the manifest's own bookkeeping format changed.\n`,
  );
  for (const c of carried) {
    console.log(`    ${c.file}: [${c.versions.join(", ")}]`);
  }
}

function updateV2(manifest: Manifest, newEntries: ScannedEntry[]): void {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const conflicts: string[] = [];
  const addedKeys: string[] = [];
  const updatedKeys: string[] = [];
  const day = today();
  const seenKeys = new Set<string>();

  for (const e of newEntries) {
    seenKeys.add(e.key);
    const existing = manifest.entries[e.key];

    if (!existing) {
      manifest.entries[e.key] = {
        kind: e.kind,
        extraction: e.extraction,
        sectionHash: e.sectionHash,
        versions: e.versions,
        registered: day,
      };
      added++;
      addedKeys.push(e.key);
      continue;
    }

    const sameVersions =
      existing.versions.length === e.versions.length &&
      existing.versions.every((v, i) => v === e.versions[i]);

    if (existing.sectionHash === e.sectionHash && sameVersions) {
      skipped++;
      continue;
    }

    if (!sameVersions) {
      manifest.entries[e.key] = {
        kind: e.kind,
        extraction: e.extraction,
        sectionHash: e.sectionHash,
        versions: e.versions,
        registered: day,
      };
      updated++;
      updatedKeys.push(e.key);
    } else {
      conflicts.push(e.key);
    }
  }

  if (conflicts.length > 0) {
    console.error(
      `\n[update-prompt-manifest] Cannot update — the following entry(ies)\n` +
        `changed without a cache-key version bump:\n\n` +
        conflicts.map((k) => `  • ${k}`).join("\n") +
        `\n\n` +
        `For each affected entry, increment a version suffix\n` +
        `(e.g. \`narration:v20:\` → \`narration:v21:\`), then re-run this command.\n`,
    );
    process.exit(1);
  }

  const stalePaths = Object.keys(manifest.entries).filter(
    (k) => !seenKeys.has(k),
  );
  for (const k of stalePaths) delete manifest.entries[k];

  writeManifest(manifest, { added, updated, skipped, stale: stalePaths });
  if (addedKeys.length > 0)
    console.log(`  New entries: ${addedKeys.join(", ")}`);
  if (updatedKeys.length > 0)
    console.log(`  Updated entries: ${updatedKeys.join(", ")}`);
}
