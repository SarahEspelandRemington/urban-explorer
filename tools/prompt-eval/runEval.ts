/**
 * tools/prompt-eval/runEval.ts
 *
 * Non-runtime prompt-eval harness foundation (Task M, Phase 4). Loads a
 * frozen, saved fixture, builds the exact production copy-gen request via
 * the shared pure builder (lib/copyGenRequestBuilder.ts), optionally applies
 * a registered post-processing variant transform (variants.ts), calls the
 * OpenAI API directly (never the production integrations-openai-ai-server
 * package, which is wired for the server's own lifecycle), and writes one
 * result record per run to the git-ignored results/ directory.
 *
 * Never imports server runtime config/env/logger/DB/cache code, and never
 * re-runs live OSM/Wikipedia selection — fixtures are read-only, frozen
 * inputs to the payload shaper.
 *
 * Must be run from the repo root, e.g.:
 *   scripts/node_modules/.bin/tsx tools/prompt-eval/runEval.ts \
 *     --fixture tools/prompt-eval/fixtures/example-enriched.json \
 *     --variant control --runs 1
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertSafeEvalEnvironment } from "./safetyGuards";
import { loadFixture, fixtureToRequestParams } from "./loadFixture";
import {
  buildCopyGenRequest,
  type CopyGenChatRequest,
} from "../../artifacts/api-server/src/lib/copyGenRequestBuilder";
import { VARIANTS } from "./variants";
import { hashPrompt } from "./promptHash";

const TOOL_DIR = join(process.cwd(), "tools", "prompt-eval");
const RESULTS_DIR = join(TOOL_DIR, "results");

interface RunOptions {
  fixturePath: string;
  variantName: string;
  runs: number;
}

function parseArgs(argv: string[]): RunOptions {
  let fixturePath: string | undefined;
  let variantName = "control";
  let runs = 1;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fixture") fixturePath = argv[++i];
    else if (arg === "--variant") variantName = argv[++i];
    else if (arg === "--runs") runs = Number(argv[++i]);
  }
  if (!fixturePath) {
    throw new Error("Missing required --fixture <path-to-fixture.json>");
  }
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  return { fixturePath, variantName, runs };
}

async function callOpenAi(request: CopyGenChatRequest): Promise<{
  content: string | undefined;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}> {
  const apiKey = process.env.EVAL_OPENAI_API_KEY!;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `OpenAI eval call failed: HTTP ${res.status} — ${bodyText.slice(0, 300)}`,
    );
  }
  const data = JSON.parse(bodyText) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return { content: data.choices?.[0]?.message?.content, usage: data.usage };
}

async function main(): Promise<void> {
  assertSafeEvalEnvironment();

  const opts = parseArgs(process.argv.slice(2));
  const fixture = loadFixture(opts.fixturePath);
  const params = fixtureToRequestParams(fixture);

  // Control = unmodified production builder output. The production builder
  // itself has no variant parameter; any treatment variant is applied below
  // as a pure post-processing transform only.
  const controlRequest = buildCopyGenRequest(params);
  const variantFn = VARIANTS[opts.variantName];
  if (!variantFn) {
    throw new Error(
      `Unknown variant "${opts.variantName}". Known variants: ${Object.keys(VARIANTS).join(", ")}`,
    );
  }
  const request = variantFn(controlRequest);
  const promptHash = hashPrompt(request.messages);

  mkdirSync(RESULTS_DIR, { recursive: true });

  for (let runNumber = 1; runNumber <= opts.runs; runNumber++) {
    const timestamp = new Date().toISOString();
    const { content, usage } = await callOpenAi(request);
    const record = {
      fixtureName: fixture.name,
      model: request.model,
      promptHash,
      variantName: opts.variantName,
      runNumber,
      timestamp,
      rawContent: content,
      usage,
    };
    const fileSafeTimestamp = timestamp.replace(/[:.]/g, "-");
    const fileName = `${fixture.name}.${opts.variantName}.run${runNumber}.${fileSafeTimestamp}.json`;
    writeFileSync(join(RESULTS_DIR, fileName), JSON.stringify(record, null, 2));
    console.log(`Wrote ${join("tools/prompt-eval/results", fileName)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
