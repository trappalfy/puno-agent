import type { Address } from "viem";
import { readVaultPolicy } from "../chain/vault.js";
import { usd1e18ToNumber } from "../chain/money.js";
import { guard } from "./guard.js";
import { market } from "./market.js";
import { portfolio } from "./portfolio.js";
import { protect } from "./protect.js";
import { evaluateTriggers } from "./triggers.js";
import { assessRisk, type ProposedTrade } from "./risk.js";
import { simulateTrade } from "./simulate.js";
import { executeTrade } from "./execute.js";
import {
  persistModelCall,
  persistSignal,
  persistDecision,
  persistTrade,
  linkDecisionTrade,
  upsertPositions,
  appendAuditLog,
  touchAgentTick,
  updateEntryPriceOnBuyFill,
} from "./persist.js";
import {
  getAgentContext,
  getPositionsWithEntryPrices,
  getLatestSignalContext,
  getLastL1CallTime,
} from "../db/queries.js";
import {
  checkBalanceBeforeCall,
  checkRateLimitBeforeCall,
  chargeForEvent,
  getAccountBilling,
  priceFor,
  type AccountBilling,
} from "../quota/service.js";
import { screen } from "../llm/screen.js";
import { decide, DECIDE_MODEL } from "../llm/decide.js";
import { replayWithHaiku } from "../compare/replay.js";
import type { DecisionContext } from "../llm/context.js";
import { config } from "../config.js";

const MIN_FREED_QUOTE_USD = 50;

async function simulateExecuteAndPersist(params: {
  agentId: string;
  accountId: string;
  billing: AccountBilling;
  vaultId: string;
  vault: Address;
  agentAddress: Address;
  decisionId: string | null;
  trade: ProposedTrade;
  action: "buy" | "sell";
  fillSymbol?: string | undefined;
  fillPriceUsd?: number | undefined;
  fillDecimals?: number | undefined;
}): Promise<void> {
  const sim = await simulateTrade(params.vault, params.agentAddress, params.trade);

  if (!sim.ok) {
    await persistTrade({
      agentId: params.agentId,
      decisionId: params.decisionId,
      tokenIn: params.trade.tokenIn,
      tokenOut: params.trade.tokenOut,
      amountIn: params.trade.amountIn,
      amountOut: null,
      minOut: params.trade.minOut,
      router: params.trade.router,
      notionalUsd1e18: params.trade.notionalUsd1e18,
      status: "simulated",
      txHash: null,
      simulateError: sim.error,
    });
    console.warn(`  [simulate] would revert on-chain: ${sim.error}`);
    return;
  }

  const exec = await executeTrade(params.vault, params.trade, sim.swapCalldata);
  if (exec.txHash) {
    console.log(`  [execute] ${exec.status}: ${config.network.explorerUrl}/tx/${exec.txHash}`);
  }
  const tradeId = await persistTrade({
    agentId: params.agentId,
    decisionId: params.decisionId,
    tokenIn: params.trade.tokenIn,
    tokenOut: params.trade.tokenOut,
    amountIn: params.trade.amountIn,
    amountOut: params.trade.amountOut,
    minOut: params.trade.minOut,
    router: params.trade.router,
    notionalUsd1e18: params.trade.notionalUsd1e18,
    status: exec.status,
    txHash: exec.txHash,
    simulateError: exec.error,
  });

  if (params.decisionId) {
    await linkDecisionTrade(params.decisionId, tradeId);
  }
  await touchAgentTick(params.agentId, { actionTaken: true });

  // Billed only on a trade that actually landed. A reverted or failed swap
  // costs the user nothing — they are paying for execution, and there wasn't
  // any. Keyed to tradeId, so a retry of this tick cannot double-charge it.
  if (exec.status === "confirmed") {
    const charge = await chargeForEvent({
      accountId: params.accountId,
      event: "trade",
      billing: params.billing,
      refType: "trade",
      refId: tradeId,
    });
    if (!charge.ok) {
      // Trade charges are allowed to go negative, so reaching here means
      // something structural (a missing account row), not a thin balance. It
      // must not be swallowed: the swap settled and nobody was billed for it.
      console.error(`  [billing] could not charge for trade ${tradeId}: ${charge.reason}`);
      await appendAuditLog({
        agentId: params.agentId,
        actorType: "system",
        action: "trade_charge_failed",
        details: { tradeId, reason: charge.reason },
      });
    }
  }

  if (
    exec.status === "confirmed" &&
    params.action === "buy" &&
    params.fillSymbol &&
    params.fillPriceUsd !== undefined &&
    params.fillDecimals !== undefined
  ) {
    await updateEntryPriceOnBuyFill({
      vaultId: params.vaultId,
      token: params.trade.tokenOut,
      symbol: params.fillSymbol,
      boughtRaw: params.trade.amountOut,
      fillPriceUsd: params.fillPriceUsd,
      decimals: params.fillDecimals,
    });
  }
}

/// One full pass of the plan 2.3 loop for a single agent: L0 (guard, market,
/// portfolio, protect, triggers) always runs; L1/L2 only run if a trigger
/// fired and the budget/rate-limit gates allow it. Exceptions from this
/// function are the caller's (main.ts) problem — a single agent's tick
/// failing must never take down the process or block other agents.
export async function runTick(agentId: string): Promise<void> {
  const agentCtx = await getAgentContext(agentId);
  if (!agentCtx) {
    console.error(`[tick] agent ${agentId} not found`);
    return;
  }
  const { agent, vault: vaultRow, limits } = agentCtx;
  const vault = vaultRow.address as Address;
  const agentAddress = agent.agentAddress as Address;
  const quoteToken = vaultRow.quoteToken as Address;
  const label = `[${agent.name}]`;

  // Loaded up front because the protect pass below can execute (and therefore
  // bill) a stop-loss before the model path is ever reached. The BYOK flag
  // can't change mid-tick; the balance is re-read on each charge.
  const billing = await getAccountBilling(agent.accountId);

  // ---- L0: guard ----
  const guardResult = await guard(vault, agentAddress);
  if (!guardResult.rpcHealthy) {
    console.error(`${label} RPC unreachable — skipping tick entirely:`, guardResult.reasons);
    return;
  }

  // ---- L0: market, portfolio ----
  const policy = await readVaultPolicy(vault);
  const prices = await market(vault, policy.allowedTokens);
  const port = await portfolio(vault, quoteToken, prices);

  const dbPositions = await getPositionsWithEntryPrices(vaultRow.id);
  const prevQuotePosition = dbPositions.find(
    (p) => p.token.toLowerCase() === quoteToken.toLowerCase(),
  );
  const entryPricesUsd = new Map(
    dbPositions
      .filter((p) => p.entryPriceUsd !== null)
      .map((p) => [p.token.toLowerCase(), Number(p.entryPriceUsd)]),
  );

  await upsertPositions(vaultRow.id, port.positions);
  await touchAgentTick(agentId, {});

  if (!guardResult.ok) {
    console.warn(`${label} guard blocked trading:`, guardResult.reasons);
    await appendAuditLog({
      agentId,
      actorType: "system",
      action: "guard_blocked",
      details: { reasons: guardResult.reasons },
    });
  }

  const quoteDecimals =
    prices.find((p) => p.token.toLowerCase() === quoteToken.toLowerCase())?.decimals ?? 18;
  const quotePriceUsd1e18 =
    prices.find((p) => p.token.toLowerCase() === quoteToken.toLowerCase())?.priceUsd1e18 ?? 0n;

  // ---- L0: protect — always evaluated; only acted on if guard.ok ----
  const breaches = protect({
    positions: port.positions,
    prices,
    entryPricesUsd,
    quoteToken,
    stopLossBps: limits?.stopLossBps ?? null,
    takeProfitBps: limits?.takeProfitBps ?? null,
  });

  for (const breach of breaches) {
    console.warn(
      `${label} PROTECT breach: ${breach.reason} on ${breach.symbol} (${(breach.pctChange * 100).toFixed(2)}%)`,
    );
    await appendAuditLog({
      agentId,
      actorType: "system",
      action: `protect_${breach.reason}`,
      details: breach,
    });

    if (!guardResult.ok) {
      console.warn(
        `${label} would close ${breach.symbol} but guard is blocking trades — logged only`,
      );
      continue;
    }

    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const verdict = assessRisk({
      decision: {
        action: "sell",
        ticker: breach.symbol,
        sizePct: 100,
        confidence: 1,
        thesis: `Automatic ${breach.reason === "stop_loss" ? "stop-loss" : "take-profit"}: ${breach.symbol} moved ${(breach.pctChange * 100).toFixed(2)}% from entry.`,
        riskFlags: ["protect_triggered"],
      },
      policy,
      portfolio: port,
      prices,
      quoteToken,
      quoteDecimals,
      nowSec,
    });

    if (verdict.verdict === "rejected") {
      console.warn(`${label} protect close rejected by risk engine: ${verdict.reason}`);
      await appendAuditLog({
        agentId,
        actorType: "system",
        action: "protect_close_rejected",
        details: { breach, reason: verdict.reason },
      });
      continue;
    }
    if (verdict.trade) {
      await simulateExecuteAndPersist({
        agentId,
        accountId: agent.accountId,
        billing,
        vaultId: vaultRow.id,
        vault,
        agentAddress,
        decisionId: null,
        trade: verdict.trade,
        action: "sell",
      });
    }
  }

  // ---- L0: triggers ----
  const latestSignal = await getLatestSignalContext(agentId);
  const lastL1CallAt = await getLastL1CallTime(agentId);
  const trigger = evaluateTriggers({
    prices,
    lastReviewedPricesUsd: latestSignal?.pricesByToken ?? new Map(),
    hasOpenPositions: port.positions.some(
      (p) => p.token.toLowerCase() !== quoteToken.toLowerCase() && p.rawBalance > 0n,
    ),
    lastL1CallAt,
    now: new Date(),
    quoteBalanceRaw: port.quoteBalance,
    prevQuoteBalanceRaw: prevQuotePosition ? BigInt(prevQuotePosition.rawBalance) : null,
    quoteDecimals,
    quotePriceUsd1e18,
    priceMoveTriggerBps: limits?.priceMoveTriggerBps ?? 300,
    maxReviewIntervalHours: limits?.maxReviewIntervalHours ?? 24,
    minFreedQuoteUsd: MIN_FREED_QUOTE_USD,
  });

  if (!guardResult.ok || !trigger.shouldTrigger) {
    return; // no-op tick (or trading is blocked) — nothing left to do
  }

  console.log(`${label} trigger fired:`, trigger.reasons);

  // ---- L1 ----
  const decisionCtx: DecisionContext = {
    triggerReasons: trigger.reasons,
    navUsd: port.navUsd1e18 !== null ? usd1e18ToNumber(port.navUsd1e18) : null,
    quoteBalanceUsd: usd1e18ToNumber(
      (port.quoteBalance * quotePriceUsd1e18) / 10n ** BigInt(quoteDecimals),
    ),
    prices: prices.map((p) => ({
      symbol: p.symbol,
      token: p.token,
      priceUsd: usd1e18ToNumber(p.priceUsd1e18),
      stale: p.stale,
    })),
    positions: port.positions.map((p) => ({
      symbol: p.symbol,
      token: p.token,
      valueUsd: usd1e18ToNumber(p.valueUsd1e18),
      entryPriceUsd: entryPricesUsd.get(p.token.toLowerCase()) ?? null,
    })),
    recentDecisionsSummary: "",
  };

  const budgetCheckL1 = await checkBalanceBeforeCall(
    agent.accountId,
    priceFor("screen", billing),
  );
  const rateLimitCheck = await checkRateLimitBeforeCall(agentId, limits?.maxCallsPerHour ?? 6);
  if (!budgetCheckL1.allowed || !rateLimitCheck.allowed) {
    const reason = !budgetCheckL1.allowed ? budgetCheckL1.reason : rateLimitCheck.reason;
    console.warn(`${label} L1 call blocked: ${reason}`);
    await appendAuditLog({
      agentId,
      actorType: "system",
      action: "l1_blocked",
      details: { reason },
    });
    if (!budgetCheckL1.allowed) {
      await touchAgentTick(agentId, { status: "quota_exhausted" });
    }
    return;
  }

  const screenResult = await screen(decisionCtx);
  const l1ModelCallId = await persistModelCall(screenResult.modelCall, agentId, agent.accountId);
  await chargeForEvent({
    accountId: agent.accountId,
    event: "screen",
    billing,
    refType: "model_call",
    refId: l1ModelCallId,
  });

  const signalId = await persistSignal({
    agentId,
    triggerReasons: trigger.reasons,
    marketSnapshot: decisionCtx.prices,
    escalate: screenResult.output.escalate,
    reason: screenResult.output.reason,
    modelCallId: l1ModelCallId,
  });

  console.log(
    `${label} L1: escalate=${screenResult.output.escalate} — ${screenResult.output.reason}`,
  );

  if (!screenResult.output.escalate) {
    return;
  }

  // ---- L2 ----
  // Gated on decision + trade together: escalating means the agent may well
  // trade, and charging for the thesis only to find the balance can't cover
  // execution would leave the user with a bill and no position.
  const budgetCheckL2 = await checkBalanceBeforeCall(
    agent.accountId,
    priceFor("decision", billing) + priceFor("trade", billing),
  );
  if (!budgetCheckL2.allowed) {
    console.warn(`${label} L2 call blocked: ${budgetCheckL2.reason}`);
    await appendAuditLog({
      agentId,
      actorType: "system",
      action: "l2_blocked",
      details: { reason: budgetCheckL2.reason },
    });
    await touchAgentTick(agentId, { status: "quota_exhausted" });
    return;
  }

  const decideResult = await decide(decisionCtx, {
    model: DECIDE_MODEL,
    useCache: true,
    useThinking: true,
    purpose: "decision",
  });
  const l2ModelCallId = await persistModelCall(decideResult.modelCall, agentId, agent.accountId);
  await chargeForEvent({
    accountId: agent.accountId,
    event: "decision",
    billing,
    refType: "model_call",
    refId: l2ModelCallId,
  });

  console.log(
    `${label} L2: ${decideResult.output.action} ${decideResult.output.ticker} sizePct=${decideResult.output.sizePct} confidence=${decideResult.output.confidence}`,
  );
  console.log(`${label} thesis: ${decideResult.output.thesis}`);

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const verdict = assessRisk({
    decision: decideResult.output,
    policy,
    portfolio: port,
    prices,
    quoteToken,
    quoteDecimals,
    nowSec,
  });

  const decisionId = await persistDecision({
    agentId,
    signalId,
    action: decideResult.output.action,
    ticker: decideResult.output.ticker,
    sizePct: decideResult.output.sizePct,
    confidence: decideResult.output.confidence,
    thesis: decideResult.output.thesis,
    riskFlags: decideResult.output.riskFlags,
    riskVerdict: verdict.verdict,
    riskReason: verdict.verdict === "rejected" ? verdict.reason : null,
    modelCallId: l2ModelCallId,
  });

  if (verdict.verdict === "rejected") {
    console.warn(`${label} risk rejected: ${verdict.reason}`);
  } else if (verdict.trade) {
    const tickerPrice = prices.find(
      (p) => p.symbol.toLowerCase() === decideResult.output.ticker.toLowerCase(),
    );
    await simulateExecuteAndPersist({
      agentId,
      accountId: agent.accountId,
      billing,
      vaultId: vaultRow.id,
      vault,
      agentAddress,
      decisionId,
      trade: verdict.trade,
      action: decideResult.output.action === "buy" ? "buy" : "sell",
      fillSymbol: tickerPrice?.symbol,
      fillPriceUsd: tickerPrice ? usd1e18ToNumber(tickerPrice.priceUsd1e18) : undefined,
      fillDecimals: tickerPrice?.decimals,
    });
  }

  // ---- Comparison replay (sampled) — plan 2.3 / 3.3.1 measurement ----
  // Never billed and never gated on the user's balance: this is our own
  // Haiku/Opus divergence measurement, not a service the account asked for.
  // It still writes a model_calls row, so its cost lands in our books.
  if (Math.random() < config.comparisonSampleRate) {
    try {
      const replayResult = await replayWithHaiku(decisionCtx, l2ModelCallId);
      await persistModelCall(replayResult.modelCall, agentId, agent.accountId);
      console.log(
        `${label} comparison replay: ${replayResult.output.action} ${replayResult.output.ticker} sizePct=${replayResult.output.sizePct}`,
      );
    } catch (err) {
      console.error(`${label} comparison replay failed:`, err);
    }
  }
}
