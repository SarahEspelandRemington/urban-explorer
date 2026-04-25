#!/bin/bash
# First-run setup after importing this project into a new Replit.
# Run this once from the Shell after the project opens.
set -e

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Pushing database schema..."
pnpm --filter @workspace/db run push

echo "==> Verifying code quality (typecheck + lint + tests)..."
pnpm run typecheck && echo "  typecheck: OK"
pnpm run lint && echo "  lint: OK"
pnpm run lint:rules && echo "  lint:rules: OK"
pnpm --filter @workspace/urban-explorer run test && echo "  privacy-tests: OK"

echo ""
echo "=================================================="
echo "  Setup complete — verifications all passed."
echo "=================================================="
echo ""
echo "Remaining manual steps (in Replit's sidebar):"
echo ""
echo "  1. OpenAI integration — open the Integrations tab and connect 'OpenAI'."
echo "     This auto-sets AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY."
echo "     The API server will NOT start without these."
echo ""
echo "  2. SESSION_SECRET — open the Secrets tab (padlock icon) and add:"
echo "       SESSION_SECRET = <any long random string>"
echo "     Generate one with:  openssl rand -hex 32"
echo ""
echo "  3. Optional: Sentry crash reporting — add to Secrets tab:"
echo "       EXPO_PUBLIC_SENTRY_DSN = <your Sentry DSN>"
echo "     Find it at: sentry.io → Settings → Projects → <project> → Client Keys"
echo ""
echo "  4. Optional: Sentry source map uploads for EAS builds (set via eas-cli, NOT Replit secrets):"
echo "       eas secret:create --name SENTRY_AUTH_TOKEN --value <token>"
echo "       eas secret:create --name SENTRY_ORG        --value <org-slug>"
echo "       eas secret:create --name SENTRY_PROJECT    --value <project-slug>"
echo "     Token from: sentry.io → Settings → Developer Settings → Internal Integrations"
echo "     (needs project:releases + org:read scopes)"
echo ""
echo "Then start the 'API Server' and 'expo' workflows from the workflow panel."
echo ""
echo "To revert a feature: see the 'Reverting features using git' section in replit.md"
