import "server-only";
import { and, eq, desc, sql } from "drizzle-orm";
import { schema, getNetwork, PRICES_USD, FREE_TIER_NETWORK } from "@puno/shared";
import { db } from "./db";

/// The free tier lives on testnet. Mainnet's `demoVault` is deliberately null:
/// a free run costs us model tokens and nothing else only because it never
/// broadcasts, and pointing it at a mainnet vault would spend real gas on
/// simulations for people who have not paid for anything.
///
/// Re-exported rather than re-declared: `/demo` had its own copy of this same
/// literal, which made the two a pair that could drift with nothing failing —
/// the public page would list one network's agents while runs happened on
/// another. One decision, one constant, in `@puno/shared`.
export const TRIAL_NETWORK = FREE_TIER_NETWORK;

/// What one free run costs the account. A paper run cannot reach a billable
/// trade (only a `confirmed` trade is charged), so this is screen + decision —
/// and it is exactly STARTER_GRANT_USD, by construction rather than by
/// coincidence. See packages/shared/src/pricing.ts.
export const TRIAL_COST_USD = PRICES_USD.screen + PRICES_USD.decision;

export type TrialAvailability =
  | { available: true; agentId: string }
  | {
      available: false;
      agentId: string | null;
      reason: "no_demo_vault" | "already_used" | "insufficient_credit" | "in_flight";
    };

/// Finds the shared demo vault's row, creating it on first use.
///
/// The vault exists on chain either way — this only mirrors it so agents can
/// reference it by FK. `ownerAddress` is the deployer, not the trial user:
/// nobody who takes a free run owns anything, and recording otherwise would
/// make the dashboard offer them a withdrawal they cannot perform.
async function getOrCreateDemoVaultRow(): Promise<{ id: string; agent: string } | null> {
  const network = getNetwork(TRIAL_NETWORK);
  const demo = network.demoVault;
  if (!demo) return null;

  const [existing] = await db
    .select({ id: schema.vaults.id })
    .from(schema.vaults)
    .where(and(eq(schema.vaults.address, demo.address), eq(schema.vaults.network, TRIAL_NETWORK)))
    .limit(1);

  if (existing) return { id: existing.id, agent: demo.agent };

  const [created] = await db
    .insert(schema.vaults)
    .values({
      address: demo.address,
      ownerAddress: demo.address.toLowerCase(),
      // Read live from VaultFactory at deploy time; the tick re-reads it from
      // chain anyway, so this column is a label rather than a source of truth.
      quoteToken: network.tokens.usdg,
      network: TRIAL_NETWORK,
    })
    .returning({ id: schema.vaults.id });

  return { id: created!.id, agent: demo.agent };
}

/// The account's trial agent, created on first use.
///
/// `kind: "trial"` keeps it out of the worker's interval loop — a free run
/// happens once, when the user asks for it, and must never bill them again on
/// a timer. `dryRun: true` is what runTick reads to keep the run on paper.
async function getOrCreateTrialAgent(accountId: string): Promise<string | null> {
  const [existing] = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.kind, "trial")))
    .limit(1);
  if (existing) return existing.id;

  const vault = await getOrCreateDemoVaultRow();
  if (!vault) return null;

  const [agent] = await db
    .insert(schema.agents)
    .values({
      accountId,
      vaultId: vault.id,
      name: "Trial agent",
      // Must equal the vault's on-chain agent or guard() refuses the run. It is
      // a public address; a paper run signs nothing, so no key is involved.
      agentAddress: vault.agent,
      kind: "trial",
      status: "armed",
      dryRun: true,
    })
    .returning({ id: schema.agents.id });

  // maxCallsPerHour is 1: the free tier is one decision, and the rate limit is
  // a second, independent wall in front of it. If the balance check were ever
  // wrong, this still stops a trial agent from making a second model call.
  await db.insert(schema.limits).values({
    agentId: agent!.id,
    maxCallsPerHour: 1,
    // A trigger has to fire for L1 to run at all. The free user pressed a
    // button and expects the agent to look, so the review interval is zero —
    // "it has been long enough since the last review" is always true.
    maxReviewIntervalHours: 0,
  });

  return agent!.id;
}

/// Whether this account may take a free run right now, and why not if not.
///
/// "Used up" means **a decision was produced**, not a run was attempted. L1 can
/// legitimately decline to escalate — it is a screening model whose job is to
/// say "nothing here worth an Opus call" — and a user who pressed the button
/// and got only "I looked, nothing needed attention" has not seen the thing we
/// promised them. Charging a cent for that is fine; spending their whole free
/// tier on it is not, so they may go again.
///
/// That is bounded without a second counter: each retry still charges for its
/// screen, so the balance runs out on its own, and no retry can reach L2
/// without leaving a decision behind and closing the door. Worst case is a few
/// cents of screening.
export async function checkTrialAvailability(
  accountId: string,
  balanceUsd: number,
): Promise<TrialAvailability> {
  const agentId = await getOrCreateTrialAgent(accountId);
  if (!agentId) return { available: false, agentId: null, reason: "no_demo_vault" };

  const [priorDecision] = await db
    .select({ id: schema.decisions.id })
    .from(schema.decisions)
    .where(eq(schema.decisions.agentId, agentId))
    .limit(1);
  if (priorDecision) return { available: false, agentId, reason: "already_used" };

  // One at a time. Without this a user could queue the button and be charged
  // once per press for runs they never watched.
  const [inFlight] = await db
    .select({ id: schema.trialRuns.id })
    .from(schema.trialRuns)
    .where(
      and(
        eq(schema.trialRuns.accountId, accountId),
        sql`${schema.trialRuns.status} in ('pending','running')`,
      ),
    )
    .limit(1);
  if (inFlight) return { available: false, agentId, reason: "in_flight" };

  if (balanceUsd < TRIAL_COST_USD) {
    return { available: false, agentId, reason: "insufficient_credit" };
  }

  return { available: true, agentId };
}

export async function latestTrialRun(accountId: string) {
  const [row] = await db
    .select()
    .from(schema.trialRuns)
    .where(eq(schema.trialRuns.accountId, accountId))
    .orderBy(desc(schema.trialRuns.createdAt))
    .limit(1);
  return row ?? null;
}
