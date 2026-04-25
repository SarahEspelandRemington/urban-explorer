#!/bin/bash
# First-run setup after importing this project into a new Replit.
# Run this once from the Shell after the project opens.
set -e

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Pushing database schema..."
pnpm --filter @workspace/db run push

echo ""
echo "Setup complete."
echo ""
echo "Remaining manual steps:"
echo "  1. Add the OpenAI integration: open the Integrations tab and connect 'OpenAI'"
echo "     (this auto-sets AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY)"
echo "  2. Set SESSION_SECRET in Secrets to any long random string"
echo "     (e.g.: openssl rand -hex 32)"
echo "  3. Optional: set EXPO_PUBLIC_SENTRY_DSN to your Sentry project DSN"
echo "     (Settings → Projects → <project> → Client Keys in your Sentry dashboard)"
echo ""
echo "Then start the API server workflow and the Expo workflow."
