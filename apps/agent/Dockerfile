# The trading worker.
#
# Nothing here is compiled ahead of time, and that is deliberate rather than an
# omission: `@puno/shared` publishes TypeScript source (`main: ./src/index.ts`)
# and every app in the repo consumes it without a build step. So **tsx is this
# image's runtime**, not a build tool — which is why it sits in `dependencies`.
# Left in `devDependencies`, an image built with `--prod` builds perfectly and
# then dies on start with "command not found", which is the worst shape a
# packaging bug can take: nothing fails until the thing is deployed.

FROM node:24-slim

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Pinned to the exact version in the root package.json's `packageManager`, so
# the image cannot resolve a lockfile with a different pnpm than the one that
# wrote it.
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /app

# Manifests before sources, so editing a .ts file does not reinstall the world.
#
# Every workspace manifest is copied even though only the agent is installed:
# `--frozen-lockfile` validates the lockfile against the whole workspace, and a
# missing package.json reads to pnpm as a lockfile that is out of date.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/agent/package.json apps/agent/
COPY apps/site/package.json apps/site/
COPY apps/web/package.json apps/web/

# `...` includes the package's own workspace dependencies. `--prod` drops
# drizzle-kit (only `db:generate` needs it — the migrator itself lives in
# drizzle-orm) and pglite, which backs the tests.
RUN pnpm install --frozen-lockfile --prod --filter @puno/agent...

# `packages/shared` is TypeScript that tsx transpiles at runtime, and
# `apps/agent/drizzle` holds the migration SQL that db:migrate reads off disk —
# both are runtime inputs here, not build inputs.
COPY packages/shared packages/shared
COPY apps/agent apps/agent

ENV NODE_ENV=production

# The worker resolves its own `.env` at ../../../.env, which does not exist in
# the image. dotenv treats a missing path as a no-op and never overwrites an
# already-set variable, so the platform's environment wins and that config line
# needs no special case. See apps/agent/src/config.ts.

USER node
WORKDIR /app/apps/agent

# Not `pnpm start`. That wraps the process in a shell inside a pnpm inside the
# container's init, and SIGTERM then has three layers to cross on every deploy
# — a worker mid-tick deserves to hear it. This makes node PID 1.
CMD ["node", "--import", "tsx", "src/main.ts"]
