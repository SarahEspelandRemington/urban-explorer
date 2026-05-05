import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface ReplitMdUrlReplacement {
  regex: RegExp;
  line: string;
  fallbackUrl: string;
}

export interface PatchReplitMdUrlsOptions {
  replacements: ReplitMdUrlReplacement[];
  missingPlaceholderLabel: string;
  successMessage: string;
}

export async function patchReplitMdUrls(
  options: PatchReplitMdUrlsOptions,
): Promise<void> {
  const { replacements, missingPlaceholderLabel, successMessage } = options;

  const repoRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
  );
  const replitMdPath = resolve(repoRoot, "replit.md");
  const before = await readFile(replitMdPath, "utf8");

  const after = replacements.reduce(
    (text, { regex, line }) => text.replace(regex, line),
    before,
  );

  if (after === before) {
    const fallbackBlock = replacements
      .map(({ fallbackUrl }) => `  ${fallbackUrl}`)
      .join("\n");
    console.warn(
      `replit.md was not modified — could not find the ${missingPlaceholderLabel} placeholder lines. ` +
        "Paste these manually:\n" +
        fallbackBlock,
    );
    return;
  }

  await writeFile(replitMdPath, after, "utf8");
  console.log(successMessage);
}
