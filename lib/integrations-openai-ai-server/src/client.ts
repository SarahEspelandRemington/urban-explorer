import OpenAI from "openai";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  // TEMP diagnostic (remove after investigation window): surfaces per-attempt
  // status/duration and retry counts from the SDK's own request lifecycle at
  // 'info' level only — no prompt/body/header content at this level (verified
  // against openai@6.34.0 src/client.ts). Do NOT set to 'debug': that level
  // logs full request bodies (prompts + candidate coordinates).
  logLevel: process.env.OPENAI_DIAG_LOGGING === "true" ? "info" : undefined,
});
