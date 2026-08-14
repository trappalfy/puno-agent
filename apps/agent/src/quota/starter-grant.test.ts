import test from "node:test";
import assert from "node:assert/strict";
import { PRICES_USD, STARTER_GRANT_USD } from "@puno/shared";
import { evaluateBalance } from "./gate.js";

/// The free tier is a product promise — "connect a wallet and watch the agent
/// think, once" — and it is enforced by two numbers in different packages that
/// nothing otherwise ties together: STARTER_GRANT_USD in shared/pricing.ts and
/// the L2 reservation in loop/tick.ts.
///
/// They have drifted apart before. The $1.00 grant was documented as buying two
/// decisions and bought one, because the L2 gate reserves the trade fee up front
/// and the $0.24 remainder could not clear it. Arithmetic on the decision price
/// alone will not catch that, so this walks the real gates in the real order.

interface RunResult {
  decisions: number;
  trades: number;
  balanceLeft: number;
}

/// Mirrors the gate order in loop/tick.ts: the L1 reservation, then the L2 one,
/// which drops the trade fee in paper mode because paper can never produce the
/// `confirmed` trade that is the only thing ever charged.
function runTicks(grantUsd: number, paper: boolean, maxTicks = 20): RunResult {
  let balance = grantUsd;
  let decisions = 0;
  let trades = 0;

  for (let i = 0; i < maxTicks; i++) {
    if (!evaluateBalance(balance, PRICES_USD.screen).allowed) break;
    balance -= PRICES_USD.screen;

    const l2Reservation = PRICES_USD.decision + (paper ? 0 : PRICES_USD.trade);
    if (!evaluateBalance(balance, l2Reservation).allowed) break;
    balance -= PRICES_USD.decision;
    decisions++;

    if (!paper) {
      balance -= PRICES_USD.trade;
      trades++;
    }
  }

  return { decisions, trades, balanceLeft: Math.round(balance * 1e6) / 1e6 };
}

test("the starter grant buys exactly one paper decision", () => {
  const run = runTicks(STARTER_GRANT_USD, true);
  assert.equal(run.decisions, 1);
  assert.equal(run.trades, 0);
});

test("the starter grant leaves nothing stranded", () => {
  // A remainder too small to buy anything reads to the user as money taken and
  // not honoured, which is why the grant is screen + decision exactly.
  assert.equal(runTicks(STARTER_GRANT_USD, true).balanceLeft, 0);
});

test("the grant is exactly the cost of the run it funds", () => {
  assert.equal(STARTER_GRANT_USD, PRICES_USD.screen + PRICES_USD.decision);
});

test("a grant one cent short buys no decision at all", () => {
  // Guards the guard: if the reservation were satisfied by any balance, the
  // tests above would pass no matter what the grant was set to.
  const run = runTicks(STARTER_GRANT_USD - 0.01, true);
  assert.equal(run.decisions, 0);
});

test("the grant cannot fund a live run, which is what the tariff is for", () => {
  // Live mode reserves decision + trade, so the free grant stops at the L2
  // gate. Deliberate: free is one look at the agent's reasoning, not a trade.
  const run = runTicks(STARTER_GRANT_USD, false);
  assert.equal(run.decisions, 0);
});
