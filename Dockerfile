# Dedicated OSM-import worker environment.
#
# This image is used ONLY by a separate Render background_worker service that
# runs tools/osm-import (manually via `render jobs create`, later as a
# scheduled cron job). It is NOT used by the production API web service
# (srv-d95t19rtqb8s73f926s0), whose own build/image is untouched by this file
# — that service's runtime is "node", not "docker", so it never looks at this
# Dockerfile.
#
# Base image pins Node 24 (matches .github/workflows/ci.yml's
# `node-version: 24`, the repo's de facto supported Node version — there is
# no .nvmrc/engines field) on Debian 12 "bookworm", the same Debian release
# already confirmed inside Render's existing one-off job containers. Pinning
# the OS release this way lets osmium-tool's resolved version be reported and
# reproduced, even though Debian's bookworm repo doesn't expose a separate
# exact apt-version pin for it (see the osmium-tool install step below).
FROM node:24-bookworm

# osmium-tool via Debian bookworm's own apt repo — not an unofficial binary
# download, not a curl-to-shell install. Debian release-frozen package repos
# mean the resolved version is reproducible for as long as this base image
# tag is used; `osmium --version` is reported after the worker is built.
RUN apt-get update && \
    apt-get install -y --no-install-recommends osmium-tool ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# pnpm pinned to the exact version in the repo's root package.json
# ("packageManager": "pnpm@10.26.1") via Corepack, not a floating "latest".
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# Dark by default: this worker does nothing on its own. The actual importer
# (tools/osm-import) and any verification commands are invoked via a manual
# `render jobs create` one-off job against this service — the same mechanism
# already used for Local OSM Package 2A/2B — not by this CMD.
CMD ["sleep", "infinity"]
