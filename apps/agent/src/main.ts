import { schema } from "@puno/shared";
import { db } from "./db/client.js";
import { runTick } from "./loop/tick.js";
import { runDepositWatcher } from "./billing/watcher.js";
import { config } from "./config.js";

async function tickAllAgents(): Promise<void> {
  const agents = await db
    .select({ id: schema.agents.id, name: schema.agents.name })
    .from(schema.agents);
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

async function main(): Promise<void> {
  console.log(
    `Puno agent worker starting — network=${config.network.key} dryRun=${config.dryRun} tickIntervalMs=${config.tickIntervalMs}`,
  );
  console.log(
    config.dryRun
      ? "DRY_RUN=true — the full pipeline runs (including real LLM calls) but no transaction is ever broadcast."
      : "DRY_RUN=false — LIVE mode: accepted trades WILL be sent to the chain.",
  );

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

  await tickAllAgents();
  setInterval(() => {
    tickAllAgents().catch((err) => console.error("[main] tickAllAgents failed:", err));
  }, config.tickIntervalMs);
}

main().catch((err) => {
  console.error("[main] fatal error during startup:", err);
  process.exit(1);
});
