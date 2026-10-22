/**
 * Start-up safety checks for tools/prompt-eval. Run before any network call
 * or fixture load. Refuses to start if anything suggests this process might
 * be running with production credentials or inside the production
 * environment.
 */

/** Any of these being set is treated as "this looks like a production shell". */
const PRODUCTION_KEY_VAR_NAMES = ["OPENAI_API_KEY"];

/** Render sets RENDER=true in every one of its runtimes; the others are
 * additional Render-specific markers that may also be present. DATABASE_URL
 * is the production Postgres connection string — its mere presence, even
 * unused, is refused. */
const PRODUCTION_ENV_MARKERS = [
  "DATABASE_URL",
  "RENDER",
  "RENDER_SERVICE_ID",
  "RENDER_SERVICE_NAME",
  "RENDER_EXTERNAL_HOSTNAME",
  "RENDER_EXTERNAL_URL",
];

export function assertSafeEvalEnvironment(): void {
  for (const name of PRODUCTION_KEY_VAR_NAMES) {
    if (process.env[name]) {
      throw new Error(
        `Refusing to start: ${name} is set in this environment. ` +
          `tools/prompt-eval must run with ONLY EVAL_OPENAI_API_KEY set — ` +
          `unset ${name} (or run in a clean shell) before retrying.`,
      );
    }
  }
  for (const name of PRODUCTION_ENV_MARKERS) {
    if (process.env[name]) {
      throw new Error(
        `Refusing to start: ${name} is set, which looks like a production ` +
          `or Render environment marker. tools/prompt-eval must never run ` +
          `against production.`,
      );
    }
  }
  if (!process.env.EVAL_OPENAI_API_KEY) {
    throw new Error(
      "EVAL_OPENAI_API_KEY is not set. tools/prompt-eval requires a " +
        "dedicated eval-only API key — never the production OPENAI_API_KEY.",
    );
  }
}
