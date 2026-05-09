#!/bin/bash
set -e

pnpm install --frozen-lockfile

# Warn about required secrets that must be set manually.
# On a fresh account these will be absent and the API server will fail
# at startup with confusing errors if they are missing.
MISSING=()
if [ -z "${SESSION_SECRET}" ]; then
  MISSING+=("SESSION_SECRET  — generate with: openssl rand -hex 32")
fi
if [ -z "${AI_INTEGRATIONS_OPENAI_API_KEY}" ]; then
  MISSING+=("AI_INTEGRATIONS_OPENAI_API_KEY  — connect the Replit OpenAI integration")
fi

if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "WARNING: The following required secrets are not set:"
  for item in "${MISSING[@]}"; do
    echo "   * $item"
  done
  echo ""
  echo "   See the 'New account setup' section in replit.md for instructions."
  echo ""
fi

pnpm --filter db push
