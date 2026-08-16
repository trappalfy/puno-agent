# Deployment

Written 2026-08-16. Until now the web app, the database and the worker all ran on one laptop —
there was no `Dockerfile`, no `vercel.json` and no CI, and `docker-compose.yml` starts Postgres
alone.

**Do this on testnet, well before the token launch.** The rehearsal is the point. T-0 should
change addresses, not architecture, and the largest product gap is the absence of a public track
record — which closes only by a worker running somewhere that stays on. Every day it does not is
a day missing from that record.

## What is in the repo, and what is not

| Artifact                      | State                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| `apps/agent/Dockerfile`       | Written. **Not built** — no Docker on the machine it was written on |
| `.dockerignore`               | Written                                                             |
| `apps/agent/fly.testnet.toml` | Written. Mainnet needs its own file, deliberately                   |
| `apps/web/vercel.json`        | Written. Dashboard settings below                                   |
| `apps/site/vercel.json`       | Written                                                             |
| CI                            | None. Not required to deploy                                        |
| Health endpoint               | None. See _Known gaps_                                              |

Everything above is unverified against a real platform. The first `fly deploy` is the test, and
the failures it finds should be corrected here rather than worked around.

## Secrets: the rule before the table

**Never paste a secret into a chat, an issue, or a commit — including `DATABASE_URL`, which
carries the password.** Put them straight into the platform's own store: `fly secrets set` and
Vercel's environment variables. Both encrypt at rest and neither round-trips through this repo.

The root `.env` currently holds the whole set in plaintext on one laptop. Once the platforms have
them, delete the local copies of anything that reaches production.

Which service needs what — verified by reading the code, not the old `.env.example`:

| Variable                       | web | worker | Notes                                                             |
| ------------------------------ | :-: | :----: | ----------------------------------------------------------------- |
| `DATABASE_URL`                 |  ●  |   ●    | The only variable the worker actually requires                    |
| `SESSION_SECRET`               |  ●  |        | Regenerate; the pre-reinstall value is compromised                |
| `ENCRYPTION_KEY`               |  ●  |        | Encrypts users' own Anthropic keys at rest                        |
| `ANTHROPIC_API_KEY`            |     |   ●    | Ours, for users without their own                                 |
| `AGENT_PRIVATE_KEY`            |     |   ●    | **One per network.** Must derive to that network's `serviceAgent` |
| `NETWORK`                      |     |   ●    | In `fly.testnet.toml`, not a secret                               |
| `DRY_RUN`                      |     |   ●    | In `fly.testnet.toml`. Defaults **true** if unset                 |
| `CREDITS_WATCHER_START_BLOCK`  |     |   ●    | Per network. Unset means "from the head"                          |
| `RPC_URL_MAINNET` / `_TESTNET` |  ○  |        | Optional; falls back to the public RPC in `config.ts`             |
| `RPC_URL`                      |     |   ○    | The worker's own, single-network                                  |
| `VITE_APP_URL`                 |     |        | `apps/site` only — the product app's origin                       |

`RPC_URL_MAINNET` is optional but worth setting: the public mainnet RPC sits behind Cloudflare and
rejects batched JSON-RPC POSTs, returning an HTML interstitial. A paid endpoint removes a class of
failure that will otherwise look like random RPC errors.

Both apps load the monorepo-root `.env` explicitly (`next.config.ts`, `agent/src/config.ts`). That
file does not exist on either platform, and dotenv treats a missing path as a no-op without
overwriting anything already set — so the platform's own variables win and neither line needs a
special case for production.

## Order

Databases before the things that read them, and the worker before the web app so the first
deploy's failures land somewhere nobody is looking at.

### 1. Managed Postgres

Neon or Supabase. Take the pooled connection string.

`CreditsDb` is driver-agnostic and the schema is plain Postgres, so nothing here is
provider-specific. Keep the credential in the platform store from the moment it is issued.

### 2. Migrations

Handled by the release step in `fly.testnet.toml`, which runs on its own machine before the new
version takes traffic — a deploy whose migration fails does not half-replace a running worker.

To run one by hand: `pnpm --filter @puno/agent db:migrate`. The script is `db:migrate`, not
`migrate`. Thirteen tables when it is done.

### 3. The worker — Fly

```bash
fly launch --no-deploy -c apps/agent/fly.testnet.toml
fly secrets set DATABASE_URL=... ANTHROPIC_API_KEY=... AGENT_PRIVATE_KEY=... -a puno-worker-testnet
fly deploy -c apps/agent/fly.testnet.toml
```

Check the boot log for three lines that each catch a different mistake:

- `Signing as 0x…` — the address vaults are armed with. It refuses to boot on a mismatch, because
  a worker with the wrong key screens, decides, **bills the user**, and only then reverts on chain
  with "not authorized", once per agent per tick.
- `Deposit watcher enabled — PunoCredits at 0x…`, or `idle` if the network has no billing contract.
- `[rate]` — nothing at all means the PUNO/USD rate is fresh. A warning means crediting is about
  to stop, or already has.

**One machine, never two.** `tickAllAgents()` walks every live agent with no lease or lock, so a
second instance ticks the same agents concurrently: double screening charges against one balance,
and two racing trades out of one vault. Do not scale this to 2 without adding a lease first.

### 4. Web and site — Vercel

Two projects from one repository. Per project, in the dashboard:

| Setting                              | `apps/web` | `apps/site` |
| ------------------------------------ | ---------- | ----------- |
| Root Directory                       | `apps/web` | `apps/site` |
| Include files outside root directory | **on**     | **on**      |

That last one is not optional: both apps import `@puno/shared` from outside their own directory,
and the lockfile lives at the repo root. The `vercel.json` in each app supplies the framework,
install and build commands.

`@puno/shared` has no build step and needs none — `main` points at `./src/index.ts`. Next
transpiles it via `transpilePackages`, Vite handles it natively.

Leave `@electric-sql/pglite` in the devDependencies of both `web` and `agent`. It backs the tests
with real Postgres semantics, and removing it breaks `next build` with branded-type mismatches —
Vercel installs devDependencies during a build, so this works as it stands.

Set `VITE_APP_URL` on the site project to the product app's URL. Vite bakes it at build time, so
changing it later needs a redeploy. It is also what `/api/pricing` is fetched from — get it wrong
and the landing page silently falls back to quoting dollars.

### 5. Verify

- Both apps serve; `/demo` works with no session cookie.
- `https://<site>/` shows prices in PUNO, not dollars. Dollars mean the cross-origin fetch to
  `/api/pricing` failed — check `VITE_APP_URL` and the CORS header.
- A deposit on testnet credits end to end: deposit → indexer → ledger → `reconcile()`.
- Kill the worker machine and watch it come back. Restart is the only liveness signal there is.

## Known gaps

**No health endpoint.** The worker serves nothing, so Fly can only tell whether the process is
alive — a wedged-but-running worker looks healthy. Worth a small HTTP endpoint before this carries
paying users; deliberately not built now, since it is new surface for a service with none.

**No CI.** `pnpm -r typecheck && pnpm lint && pnpm test` and `forge test` run by hand. A push that
breaks them still deploys.

**`tickAllAgents()` is sequential** inside one `TICK_INTERVAL_MS` window. Fine at today's count; at
some N a pass outruns its own interval. Not a launch blocker, but the first thing that bends.

**The mainnet worker does not exist yet.** It is a second Fly app with its own
`fly.mainnet.toml`, its own `AGENT_PRIVATE_KEY` deriving to the mainnet `serviceAgent`, and
`CREDITS_WATCHER_START_BLOCK` set to the `PunoCredits` deployment block. Both workers run at once
and permanently — the free tier lives on testnet by product decision. Copying the testnet file is
the wrong way to make it: `DRY_RUN = "false"` is stated there because that file is testnet-only.
