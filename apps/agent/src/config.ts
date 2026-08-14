import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { getNetwork, type NetworkConfig } from "@puno/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
// Root .env is shared across the monorepo (see .env.example at repo root) —
// resolve relative to this file so `pnpm --filter @puno/agent dev` works
// regardless of the invoking shell's cwd.
loadEnv({ path: path.resolve(here, "../../../.env") });

const hexAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected a 0x-prefixed 20-byte address")
  .transform((v) => v as `0x${string}`);
const hexPrivateKey = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "expected a 0x-prefixed 32-byte private key")
  .transform((v) => v as `0x${string}`);

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see .env.example"),
  NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  DRY_RUN: boolFromString,
  AGENT_PRIVATE_KEY: z.union([hexPrivateKey, z.literal("")]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  VAULT_ADDRESS: z.union([hexAddress, z.literal("")]).optional(),
  TICK_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  // Fraction of L2 decisions that also get replayed through Haiku for the
  // divergence measurement. The replay is our own measurement and is never
  // billed (loop/tick.ts), so every one of them is cost with no revenue
  // against it: measured at $0.002819 a call against ~$0.019 of total model
  // cost per decision, sampling all of them inflated our unit cost by roughly
  // 15%. 0.1 keeps the measurement current across prompt changes at a tenth
  // of that. Raise it to 1 in development, where the point is to see it work.
  COMPARISON_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  RPC_URL: z.string().optional(),
  // Where a cold deposit watcher starts scanning. Unset means "from the current
  // head", which is right for a fresh deployment and wrong after downtime —
  // set it to the PunoCredits deployment block to backfill.
  CREDITS_WATCHER_START_BLOCK: z.coerce.bigint().nonnegative().optional(),
  // Deposits are money arriving, so this polls faster than the trading tick —
  // a user who just paid should not watch a spinner for a minute.
  CREDITS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  // The free-tier queue is the only path with someone actively waiting on it,
  // so it polls fastest. The claim is a single indexed UPDATE against a table
  // that is empty most of the time; two seconds of that costs nothing next to
  // the impression that pressing the button did nothing.
  TRIAL_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2_000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
}
const env = parsed.data;

// DRY_RUN defaults true unless explicitly disabled — a missing/malformed env
// var must never silently enable live trading (plan 2.5, safeguard #2).
const dryRun = env.DRY_RUN === undefined ? true : env.DRY_RUN;

if (!dryRun && !env.AGENT_PRIVATE_KEY) {
  throw new Error("AGENT_PRIVATE_KEY is required when DRY_RUN=false");
}

const network: NetworkConfig = getNetwork(env.NETWORK);

export const config = {
  databaseUrl: env.DATABASE_URL,
  network,
  // `||`, not `??`: .env.example ships `RPC_URL=` (empty), which is a valid
  // string and so survives `??`, leaving the transport with no URL at all.
  // Matches how agentPrivateKey/vaultAddress below treat the same empty-string
  // case.
  rpcUrl: env.RPC_URL || network.rpcUrl,
  dryRun,
  agentPrivateKey: env.AGENT_PRIVATE_KEY || undefined,
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  vaultAddress: env.VAULT_ADDRESS || undefined,
  tickIntervalMs: env.TICK_INTERVAL_MS,
  comparisonSampleRate: env.COMPARISON_SAMPLE_RATE,
  creditsWatcherStartBlock: env.CREDITS_WATCHER_START_BLOCK,
  creditsPollIntervalMs: env.CREDITS_POLL_INTERVAL_MS,
  trialPollIntervalMs: env.TRIAL_POLL_INTERVAL_MS,
} as const;

export type Config = typeof config;
