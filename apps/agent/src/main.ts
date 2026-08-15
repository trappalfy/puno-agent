import { eq } from "drizzle-orm";
import { schema } from "@puno/shared";
import { db } from "./db/client.js";
import { runTick } from "./loop/tick.js";
import { runDepositWatcher } from "./billing/watcher.js";
import { runTrialQueue } from "./trial/runner.js";
import { refreshDemoFeeds } from "./testnet/price-keeper.js";
import { getAgentAddress } from "./chain/client.js";
import { serviceAgentMismatch } from "./chain/serviceAgent.js";
import { config } from "./config.js";

async function tickAllAgents(): Promise<void> {
  // `kind = 'live'` only. Free-tier agents run once, on request, from the
  // trial queue — ticking them here would bill someone for a decision they
  // never asked for, on a timer, until their grant was gone.
  const agents = await db
    .select({ id: schema.agents.id, name: schema.agents.name })
    .from(schema.agents)
    .where(eq(schema.agents.kind, "live"));
  for (const agent of agents) {
    try {
      await runTick(agent.id);
    } catch (err) {
      // One agent's failure must never take down the process or block
      // other agents' ticks — see loop/tick.ts's own module comment.
      console.error(`[main] tick failed for agent ${agent.name} (${agent.id}):`, err);
    }
  }
}

async function pollDeposits(): Promise<void> {
  try {
    const result = await runDepositWatcher();
    if (result.credited > 0 || result.skipped > 0) {
      console.log(
        `[credits] pass complete: ${result.credited} credited, ${result.skipped} skipped, scanned to block ${result.scannedTo}`,
      );
    }
  } catch (err) {
    // Never fatal. An RPC hiccup must not take the worker down — the cursor
    // did not advance, so the next pass picks up exactly where this one left.
    console.error("[credits] deposit watcher pass failed:", err);
  }
}

async function pollTrials(): Promise<void> {
  try {
    const result = await runTrialQueue();
    if (result.ran > 0 || result.failed > 0) {
      console.log(`[trial] pass complete: ${result.ran} run, ${result.failed} failed`);
    }
  } catch (err) {
    // Same rule as the deposit watcher: never fatal. Unclaimed rows stay
    // pending and the next pass picks them up.
    console.error("[trial] queue pass failed:", err);
  }
}

async function pollPriceKeeper(): Promise<void> {
  try {
    const result = await refreshDemoFeeds();
    if (result.refreshed > 0) {
      console.log(`[keeper] refreshed ${result.refreshed} testnet feed(s)`);
    }
  } catch (err) {
    // Never fatal. A missed refresh only means the next pass does the work; the
    // trial runner forces its own refresh before every free run regardless.
    console.error("[keeper] pass failed:", err);
  }
}

async function main(): Promise<void> {
  console.log(
    `Puno agent worker starting — network=${config.network.key} dryRun=${config.dryRun} tickIntervalMs=${config.tickIntervalMs}`,
  );
  console.log(
    config.dryRun
      ? "DRY_RUN=true — the full pipeline runs (including real LLM calls) but no transaction is ever broadcast."
      : "DRY_RUN=false — LIVE mode: accepted trades WILL be sent to the chain.",
  );

  // Before anything else touches the chain. Every vault this network creates is
  // armed with `serviceAgent`, so a worker holding a different key produces the
  // most expensive possible failure: it screens, decides, bills the user for the
  // decision, passes risk, and reverts on chain with "not authorized" — once per
  // agent, per tick, until someone notices. Refusing to boot costs a restart.
  const mismatch = serviceAgentMismatch(config.network.serviceAgent, getAgentAddress(), {
    dryRun: config.dryRun,
  });
  if (mismatch) {
    throw new Error(`Agent key does not match this network's service agent. ${mismatch}`);
  }
  if (config.network.serviceAgent) {
    // The address only. Printing it is what makes the clipboard rule checkable
    // at the moment of use — see the security incident in CLAUDE.md.
    console.log(`Signing as ${config.network.serviceAgent} — the address vaults are armed with.`);
  }

  if (config.network.punoCredits) {
    console.log(`Deposit watcher enabled — PunoCredits at ${config.network.punoCredits}`);
  } else {
    console.log(
      "Deposit watcher idle — no PunoCredits address configured for this network " +
        "(packages/shared/src/network/config.ts). Balances can only be topped up manually.",
    );
  }

  // Deliberately on its own interval, not inside tickAllAgents: crediting a
  // deposit must not wait on a slow agent tick, and a failing tick must not
  // stop someone's payment from landing.
  await pollDeposits();
  setInterval(() => {
    void pollDeposits();
  }, config.creditsPollIntervalMs);

  if (config.network.isTestnet && config.network.demoVault && config.testnetPriceKeeper) {
    console.log(
      "Testnet price keeper enabled — mock oracles are refreshed so the demo " +
        "agent has a fresh mark to trade against. Writes to mock feeds only, " +
        "never to a vault (see testnet/price-keeper.ts).",
    );
    await pollPriceKeeper();
    setInterval(() => {
      void pollPriceKeeper();
    }, config.testnetPriceKeeperIntervalMs);
  }

  // Its own interval too, and the fastest one: a free run has a person waiting
  // on it, while the trading tick has nobody watching any given pass.
  await pollTrials();
  setInterval(() => {
    void pollTrials();
  }, config.trialPollIntervalMs);

  await tickAllAgents();
  setInterval(() => {
    tickAllAgents().catch((err) => console.error("[main] tickAllAgents failed:", err));
  }, config.tickIntervalMs);
}

main().catch((err) => {
  console.error("[main] fatal error during startup:", err);
  process.exit(1);
});
