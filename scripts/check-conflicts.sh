#!/usr/bin/env sh
# Scan source files for unresolved git merge conflict markers.
# Fails with a non-zero exit code if any are found.

DIRS="artifacts/urban-explorer artifacts/api-server lib scripts"
ROOT_CONFIGS="package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.base.json"
PATTERN='^(<<<<<<<|=======|>>>>>>>)'
EXTENSIONS='--include=*.ts --include=*.tsx --include=*.js --include=*.mjs --include=*.jsx --include=*.json --include=*.yaml --include=*.yml --include=*.md --include=*.sh --include=*.css --include=*.scss --include=*.toml --include=*.env --include=*.env.*'

if grep -rn -E $EXTENSIONS "$PATTERN" $DIRS $ROOT_CONFIGS; then
  echo ""
  echo "ERROR: Unresolved merge conflict markers found in the files listed above." >&2
  echo "       Resolve all conflicts before committing." >&2
  exit 1
fi

echo "No merge conflict markers found."
