# Worker image. Build from the repo root:
#   docker build -f apps/worker/Dockerfile -t buildly-worker .
#   docker run --rm --cpus=1 --memory=2g buildly-worker pnpm checker:selftest
#
# The foundation's node_modules (React Native, Expo, and TypeScript types) is installed
# at build time, so each generation's type check only symlinks it (SPIKES.md S4).
FROM node:22-bookworm-slim

ENV CI=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CHECKER_NODE_MODULES=/app/packages/foundation/node_modules
RUN corepack enable

WORKDIR /app

# Download every locked package from the lockfile alone; this layer changes only when
# pnpm-lock.yaml does.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack install && pnpm fetch --frozen-lockfile

COPY . .
# The checker and its workspace dependencies, including the foundation.
RUN pnpm install --offline --frozen-lockfile --filter "@buildly/checker..." \
 && test -x packages/foundation/node_modules/typescript/bin/tsc

# Placeholder until the worker main loop exists (TODO 3.4.2).
CMD ["pnpm", "checker:selftest"]
