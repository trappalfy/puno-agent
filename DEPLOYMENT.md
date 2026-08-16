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

| Variable                       | web | worker | Notes                                                                           |
| ------------------------------ | :-: | :----: | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                 |  ●  |   ●    | The only variable the worker actually requires                                  |
| `SESSION_SECRET`               |  ●  |        | Regenerate; the pre-reinstall value is compromised                              |
| `ENCRYPTION_KEY`               |  ●  |        | Encrypts users' own Anthropic keys at rest                                      |
| `ANTHROPIC_API_KEY`            |     |   ●    | Ours, for users without their own                                               |
| `AGENT_PRIVATE_KEY`            |     |   ●    | **One per network.** Must derive to that network's `serviceAgent`               |
| `NETWORK`                      |     |   ●    | In `fly.testnet.toml`, not a secret                                             |
| `DRY_RUN`                      |     |   ●    | In `fly.testnet.toml`. Unset or empty = simulate; unrecognised = refuse to boot |
| `CREDITS_WATCHER_START_BLOCK`  |     |   ●    | Per network. Unset means "from the head"                                        |
| `RPC_URL_MAINNET` / `_TESTNET` |  ○  |        | Optional; falls back to the public RPC in `config.ts`                           |
| `RPC_URL`                      |     |   ○    | The worker's own, single-network                                                |
| `VITE_APP_URL`                 |     |        | `apps/site` only — the product app's origin                                     |

`RPC_URL_MAINNET` is optional but worth setting: the public mainnet RPC sits behind Cloudflare and
rejects batched JSON-RPC POSTs, returning an HTML interstitial. A paid endpoint removes a class of
failure that will otherwise look like random RPC errors.

Both apps load the monorepo-root `.env` explicitly (`next.config.ts`, `agent/src/config.ts`). That
file does not exist on either platform, and dotenv treats a missing path as a no-op without
overwriting anything already set — so the platform's own variables win and neither line needs a
special case for production.

## The owner's walkthrough

Every click and every command, in order. Roughly 40 minutes. Nothing here is reversible in a way
that matters — a wrong value is a re-paste, not a redeploy from scratch.

Two secrets have to be **generated**, two have to be **copied from the local `.env`**, and one
comes from Anthropic. That distinction matters, so it is called out at each step.

### Step 1 — Postgres on Neon

1. Open <https://neon.tech> and sign up with GitHub.
2. **Create project.** Name `puno`. Pick the region closest to you; leave the Postgres version at
   the default.
3. On the project page find **Connection string**. Switch the toggle to **Pooled connection** —
   serverless functions open many short-lived connections, and the direct string will exhaust the
   limit.
4. Copy it. It looks like `postgresql://user:password@host/db?sslmode=require`.

**This string contains a password. Do not paste it into a chat, an issue, or a file in this
repository.** It goes only into Fly's and Vercel's secret stores, in the steps below.

### Step 2 — generate the two web secrets

Run twice in a terminal, and keep the two outputs apart:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The first is `SESSION_SECRET` (signs login cookies), the second is `ENCRYPTION_KEY` (AES-256-GCM
over users' own Anthropic keys, 32-byte hex). Generate **fresh** ones rather than reusing the
local values: the production database starts empty, so no existing ciphertext depends on the old
key, and a development machine should not hold the key protecting users' secrets.

They are deliberately two different values — leaking the cookie signer must not implicate the key
protecting stored API keys.

### Step 3 — create the tables, and set a rate

The Neon database is empty, and the web app queries it on almost every page. Deploy before this
and every one of them is a 500.

Migrations normally run as Fly's `release_command`, so skipping Fly means running them by hand,
once, from this laptop. PowerShell has no inline environment prefix, so set the variable first:

```powershell
$env:DATABASE_URL = "<the Neon string>"
pnpm --filter @puno/agent db:migrate
pnpm --filter @puno/agent set-rate -- 0.000001 --note "testnet launch"
Remove-Item Env:\DATABASE_URL
```

In Git Bash the one-line form works instead: `DATABASE_URL="..." pnpm --filter @puno/agent db:migrate`.

The variable set in the shell wins over the root `.env` — dotenv never overwrites something
already present — so this cannot touch the local database by accident. Clear it afterwards so the
next command in that terminal does not silently talk to production.

Expect `Migrations applied.` and thirteen tables. The rate has to be set separately because it
lives in Postgres rather than in config, and without it `/api/pricing` returns `tokenPrice: null`
and every price falls back to dollars — the landing page would quietly stop quoting PUNO.

The script is `db:migrate`, not `migrate`.

### Step 4 — the worker on Fly

**Fly needs a card.** The permanent free tier ended in 2024; a new account gets a trial of two VM
hours or seven days, whichever runs out first, and after that every machine is billed. One
always-on `shared-cpu-1x` at 256 MB is about **$1.94/month**, at 512 MB about **$3.20**. There is
no monthly plan — it is per-second usage.

If that is not wanted yet, skip to steps 5 and 6: Vercel's free tier needs no card, so the public
product can go up without the worker. The cost of deferring is precise — the free-tier demo only
runs while a laptop is on, and the track record does not accumulate.

Install `flyctl` (PowerShell, once):

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Then, **from the repository root** — the build context is the working directory:

```bash
fly auth signup      # or: fly auth login
fly launch --no-deploy --ha=false -c apps/agent/fly.testnet.toml
```

`--ha=false` is not optional. Fly provisions **two** machines by default, and two workers tick the
same agents concurrently: two screening charges against one balance, two racing trades out of one
vault. There is no machine-count field in `fly.toml`, so the flag has to be on every `launch` and
every `deploy`.

`fly launch` asks a few questions. Say **no** to a Postgres database and **no** to Redis — Neon is
the database. Keep the app name `puno-worker-testnet` and accept the settings already in the file.

If `fly launch` fails with _"requested machine count exceeds organization limit"_, that is the
billing gate rather than the machine count: an organization with no payment method on file has a
limit of zero. `--ha=false` is still required, but it will not clear that error on its own.

Now the secrets. `AGENT_PRIVATE_KEY` is the one that cannot be regenerated: every testnet vault is
armed with a specific address, so the worker must hold that exact key. Take it from the
`AGENT_PRIVATE_KEY` line of the local root `.env` — verified 2026-08-16 to derive to
`0x389AA9c066854a1e1A62a9F49910760a8D010adD`, which is `NETWORKS.testnet.serviceAgent`.

```bash
fly secrets set -a puno-worker-testnet \
  DATABASE_URL="<from step 1>" \
  ANTHROPIC_API_KEY="<console.anthropic.com → API keys>" \
  AGENT_PRIVATE_KEY="<AGENT_PRIVATE_KEY from the local .env>"
```

Leave `CREDITS_WATCHER_START_BLOCK` unset. Unset means "start from the current head", which is
right for a database that begins empty; setting it to the old testnet block would replay months of
historical deposits into fresh accounts.

```bash
fly deploy --ha=false -c apps/agent/fly.testnet.toml
fly logs -a puno-worker-testnet
```

The log must contain `Signing as 0x389AA9c066854a1e1A62a9F49910760a8D010adD`. **Read that address
character by character** — it is the clipboard rule, and a mismatch here is expensive: a worker
with the wrong key screens, decides, bills the user, and only then reverts on chain.

If the process refuses to boot with a service-agent mismatch, the wrong key was pasted. That
refusal is the safeguard working.

### Step 5 — the product app on Vercel

1. Open <https://vercel.com>, sign up with GitHub, and grant access to `trappalfy/puno-agent`.
2. **Add New → Project**, import that repository.
3. **Root Directory**: click Edit, choose `apps/web`. In the same dialog turn **on** _Include
   files outside the root directory_. Without it the build cannot see `@puno/shared` or the
   lockfile, both of which live above `apps/web`.
4. Leave Framework, Build and Install commands alone — `apps/web/vercel.json` sets them.
5. **Environment Variables**, three of them, all for Production and Preview:

   | Name             | Value                |
   | ---------------- | -------------------- |
   | `DATABASE_URL`   | the string from Neon |
   | `SESSION_SECRET` | first value, step 2  |
   | `ENCRYPTION_KEY` | second value, step 2 |

6. **Deploy**, then copy the resulting URL — something like `https://puno-web.vercel.app`. Step 5
   needs it.

Nothing needs to be set for SIWE: the login message takes its domain from the request URL, so it
follows whatever hostname the app is served on.

### Step 6 — the landing page on Vercel

1. **Add New → Project**, and import **the same repository again**. Two projects from one repo is
   the intended shape, not a mistake.
2. **Root Directory**: `apps/site`. _Include files outside the root directory_ **on**, same reason.
3. One environment variable:

   | Name           | Value                                  |
   | -------------- | -------------------------------------- |
   | `VITE_APP_URL` | the URL from step 5, no trailing slash |

   Vite bakes this at build time, so changing it later needs a redeploy. It is also where the
   landing page fetches `/api/pricing` from — wrong, and prices silently fall back to dollars.

4. **Deploy.**

### Step 7 — check it worked

| Check                              | Where               | What wrong looks like                               |
| ---------------------------------- | ------------------- | --------------------------------------------------- |
| Prices show **PUNO**, not dollars  | the landing page    | dollars → `VITE_APP_URL` wrong, or the web app down |
| `/demo` opens with no wallet       | `<web>/demo`        | a login prompt                                      |
| Rate is being served               | `<web>/api/pricing` | `tokenPrice: null` → no rate in this database       |
| Worker is signing as the right key | `fly logs`          | any other address                                   |
| Worker restarts cleanly            | `fly apps restart`  | it does not come back                               |

`tokenPrice: null` here means step 3 was skipped or ran against the wrong database — the rate
lives in Postgres, not in config. Re-run the `set-rate` line from step 3.

### What is not needed yet

Do **not** create the mainnet worker, and do not put mainnet keys anywhere. `NETWORKS.mainnet` has
no `punoCredits`, so mainnet stays closed by construction — see `whyClosed()`. The second Fly app
belongs to T-0.

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
fly deploy --ha=false -c apps/agent/fly.testnet.toml
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
