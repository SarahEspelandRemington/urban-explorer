/**
 * promoteGeneratedSubject.ts — offline reviewed-subject promotion CLI.
 *
 * Automates transcription of one already-generated, already-worthy subject
 * from an offline pipeline report into curatedLocalHistory.ts's
 * GENERATED_LOCAL_HISTORY — nothing more. It does NOT run extraction,
 * grounding, admission, or projection itself; it only consumes an existing
 * report JSON produced by one of those harnesses (e.g.
 * sources/forgottenNy/generateJacksonHeightsArtifact.ts, or an equivalent
 * one-off script), containing a "gated" key shaped like
 * DiscoveryWorthinessGateResult (or being that shape directly).
 *
 * Core rule: AUTO-ADMIT / projectable / worthy means only "ready for human
 * review" — never "ship to production". This tool never commits, pushes,
 * deploys, or bumps a cache version, and defaults to dry-run (print only).
 * A human still decides whether the printed/written entry is actually
 * worth promoting and whether to commit it.
 *
 * Usage:
 *   tsx promoteGeneratedSubject.ts --subject <subjectId> --report <path> [--write] [--replace] [--registry <path>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import {
  extractGatedFromReportJson,
  runPromotion,
} from "./promoteGeneratedSubjectCore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = resolve(__dirname, "../curatedLocalHistory.ts");

interface CliArgs {
  subject?: string;
  report?: string;
  write: boolean;
  replace: boolean;
  registry?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { write: false, replace: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--subject") args.subject = argv[++i];
    else if (arg === "--report") args.report = argv[++i];
    else if (arg === "--write") args.write = true;
    else if (arg === "--replace") args.replace = true;
    else if (arg === "--registry") args.registry = argv[++i];
    else throw new Error(`Unrecognized argument: ${arg}`);
  }
  return args;
}

function printUsage(): void {
  console.log(
    `Usage: tsx promoteGeneratedSubject.ts --subject <subjectId> --report <path> [--write] [--replace] [--registry <path>]

  --subject   Required. Target subjectId (e.g. "way/265320243").
  --report    Required. Path to a JSON report from an existing offline
              pipeline harness. Must contain a "gated" key shaped like
              DiscoveryWorthinessGateResult, or be that shape directly.
  --write     Modify GENERATED_LOCAL_HISTORY in curatedLocalHistory.ts.
              Default is dry-run (print only, no file changes).
  --replace   Required in addition to --write when subjectId already
              exists in GENERATED_LOCAL_HISTORY.
  --registry  Override the registry file path (default: curatedLocalHistory.ts).

This tool never commits, pushes, deploys, or changes cache versions. After
--write it stops — review the diff and commit manually if correct.`,
  );
}

async function formatEntryPreview(entryText: string): Promise<string> {
  const wrapped = `const __PROMOTE_PREVIEW__: Record<string, unknown> = {\n  ${entryText}\n};\n`;
  const formatted = await prettier.format(wrapped, { parser: "typescript" });
  const lines = formatted.split("\n");
  // Strip the synthetic wrapper's first line ("const ... = {") and its
  // final "};" + trailing blank line, leaving only the formatted entry.
  return lines.slice(1, -2).join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.subject || !args.report) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const reportRaw = readFileSync(resolve(args.report), "utf8");
  const reportJson: unknown = JSON.parse(reportRaw);
  const gated = extractGatedFromReportJson(reportJson);
  if (!gated) {
    console.error(
      'Refusing: --report JSON has no usable "gated" shape (expected an object with "entries" and "worthinessBySubject", either at the top level or under a "gated" key).',
    );
    process.exitCode = 1;
    return;
  }

  const registryPath = args.registry
    ? resolve(args.registry)
    : DEFAULT_REGISTRY_PATH;

  const result = runPromotion({
    subjectId: args.subject,
    gated,
    write: args.write,
    replace: args.replace,
    registrySourceText: args.write
      ? readFileSync(registryPath, "utf8")
      : undefined,
  });

  if (result.outcome === "refused") {
    console.error(`Refusing to promote "${args.subject}": ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  if (result.outcome === "dry-run") {
    console.log(
      `--- DRY RUN: generated CuratedEntry for "${args.subject}" (registry NOT modified) ---`,
    );
    console.log(await formatEntryPreview(result.entryText));
    return;
  }

  // outcome === "written"
  const resolvedConfig = (await prettier.resolveConfig(registryPath)) ?? {};
  const formatted = await prettier.format(result.updatedSource, {
    ...resolvedConfig,
    filepath: registryPath,
  });
  writeFileSync(registryPath, formatted);
  console.log(`Wrote entry for "${args.subject}" into ${registryPath}.`);
  console.log(
    "Registry file modified only — not committed, pushed, deployed, or built. Review `git diff` and commit manually if correct.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
