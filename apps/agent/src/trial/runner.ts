import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { runTick } from "../loop/tick.js";

export interface TrialPassResult {
  ran: number;
  failed: number;
}

/// How many queued runs one pass will execute. A trial run makes an L2 call and
/// takes seconds, so this bounds how long a pass can block the worker's other
/// intervals — better to come back in a moment than to hold the loop open
/// while a queue drains.
const MAX_RUNS_PER_PASS = 5;

/// Claims one queued run, atomically.
///
/// `FOR UPDATE SKIP LOCKED` is the whole point: two workers (or a restart
/// overlapping its predecessor) must never both claim the same row. A read
/// followed by a write would let both see `pending` and both run — and a free
/// run costs the user real credit, so a double claim spends money that was
/// never authorised. SKIP LOCKED also means a second worker takes the *next*
/// row rather than blocking behind the first.
async function claimNextRun(): Promise<{ id: string; agentId: string } | null> {
  const claimed = await db.execute<{ id: string; agent_id: string }>(sql`
    UPDATE trial_runs
       SET status = 'running', started_at = now()
     WHERE id = (
       SELECT id FROM trial_runs
        WHERE status = 'pending'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING id, agent_id
  `);

  // postgres-js returns the rows as the result itself, not wrapped in `.rows`
  // the way node-postgres does.
  const row = claimed[0];
  return row ? { id: row.id, agentId: row.agent_id } : null;
}

async function finish(runId: string, error: string | null): Promise<void> {
  await db.execute(sql`
    UPDATE trial_runs
       SET status = ${error === null ? "done" : "failed"}::trial_run_status,
           error = ${error},
           finished_at = now()
     WHERE id = ${runId}::uuid
  `);
}

/// Drains the free-tier queue.
///
/// `paper: true` is passed explicitly even though every trial agent is stored
/// with `dry_run = true` and runTick would honour that on its own. The flags are
/// OR-ed, so this cannot loosen anything — it means a row edited by hand, or a
/// future default that flips, still cannot make a free run broadcast a trade.
///
/// A failing run is never fatal and never retried: the user was charged for the
/// model calls that did happen, and silently running again would charge them
/// twice for one press of a button. The row records why, and the UI says so.
export async function runTrialQueue(): Promise<TrialPassResult> {
  let ran = 0;
  let failed = 0;

  for (let i = 0; i < MAX_RUNS_PER_PASS; i++) {
    const claim = await claimNextRun();
    if (!claim) break;

    try {
      await runTick(claim.agentId, { paper: true });
      await finish(claim.id, null);
      ran++;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      console.error(`[trial] run ${claim.id} failed:`, err);
      await finish(claim.id, message);
      failed++;
    }
  }

  return { ran, failed };
}
