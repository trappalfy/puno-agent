import type { Address } from "viem";
import type { VaultPolicy } from "../chain/vault.js";
import type { Portfolio } from "./portfolio.js";
import type { MarketPrice } from "./market.js";
import type { DecisionOutput } from "../llm/schemas.js";
import { usd1e18ToNumber } from "../chain/money.js";

export interface RiskInput {
  decision: DecisionOutput;
  policy: VaultPolicy;
  portfolio: Portfolio;
  prices: MarketPrice[];
  quoteToken: Address;
  quoteDecimals: number;
  nowSec: bigint;
}

export interface ProposedTrade {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  // Assumed fill at the current oracle "fair" price — correct for
  // MockRouter (a test double the caller dictates the output of, not a real
  // AMM; see contracts/mocks/MockRouter.sol), and exactly what Phase 2's own
  // tests and deploy script do. A real DEX quote (Phase 4) replaces this.
  amountOut: bigint;
  minOut: bigint;
  router: Address;
  notionalUsd1e18: bigint;
}

export type RiskVerdict =
  | { verdict: "accepted"; trade: ProposedTrade | null } // null trade = hold
  | { verdict: "rejected"; reason: string };

const BPS_DENOMINATOR = 10_000n;

/// Deterministic veto — plan 2.3 step 8. Mirrors AgentVault.executeTrade's
/// checks as closely as off-chain state allows, but is deliberately NOT
/// bit-perfect: the rolling 24h notional window lives in a private array
/// with no public getter, so it cannot be reconstructed here without risking
/// silent drift from the real on-chain state. That one check — and only
/// that one — is left to simulate.ts's eth_call, which runs the actual
/// contract logic. Everything else (allowlist, cooldown, per-trade cap,
/// slippage floor, position-share estimate) is checked here first so an
/// obviously-invalid decision never costs an RPC round-trip.
export function assessRisk(input: RiskInput): RiskVerdict {
  const { decision, policy, portfolio, prices, quoteToken, quoteDecimals, nowSec } = input;

  if (decision.action === "hold") {
    return { verdict: "accepted", trade: null };
  }

  if (portfolio.navUsd1e18 === null) {
    return {
      verdict: "rejected",
      reason: `NAV unavailable — on-chain nav() would currently revert (${portfolio.navError ?? "unknown cause"})`,
    };
  }

  const priceMap = new Map(prices.map((p) => [p.token.toLowerCase(), p]));
  const tickerPrice = prices.find((p) => p.symbol.toLowerCase() === decision.ticker.toLowerCase());
  if (!tickerPrice) {
    return { verdict: "rejected", reason: `unknown ticker: ${decision.ticker}` };
  }
  if (!policy.allowedTokens.some((t) => t.toLowerCase() === tickerPrice.token.toLowerCase())) {
    return { verdict: "rejected", reason: `token not in vault allowlist: ${decision.ticker}` };
  }
  if (tickerPrice.stale) {
    return { verdict: "rejected", reason: `price feed stale for ${decision.ticker}` };
  }
  if (policy.allowedRouters.length === 0) {
    return { verdict: "rejected", reason: "no allowed router configured on vault" };
  }
  const router = policy.allowedRouters[0]!;

  if (nowSec < policy.lastTradeTimestamp + policy.minSecondsBetweenTrades) {
    return { verdict: "rejected", reason: "cooldown active" };
  }

  if (decision.sizePct <= 0) {
    return { verdict: "rejected", reason: "sizePct must be positive for buy/sell" };
  }

  const tokenIn = decision.action === "buy" ? quoteToken : tickerPrice.token;
  const tokenOut = decision.action === "buy" ? tickerPrice.token : quoteToken;

  const tokenInPrice = priceMap.get(tokenIn.toLowerCase());
  const tokenOutPrice = priceMap.get(tokenOut.toLowerCase());
  if (!tokenInPrice || !tokenOutPrice) {
    return { verdict: "rejected", reason: "missing price data for tokenIn or tokenOut" };
  }
  if (tokenInPrice.stale || tokenOutPrice.stale) {
    return { verdict: "rejected", reason: "stale price data for tokenIn or tokenOut" };
  }

  const sourceBalance =
    decision.action === "buy"
      ? portfolio.quoteBalance
      : (portfolio.positions.find((p) => p.token.toLowerCase() === tickerPrice.token.toLowerCase())
          ?.rawBalance ?? 0n);

  if (sourceBalance === 0n) {
    return { verdict: "rejected", reason: "no balance available for this side of the trade" };
  }

  // sizePct carries up to 3 decimal places (schema max 100.000).
  const sizePctMilli = BigInt(Math.round(decision.sizePct * 1000));
  const amountIn = (sourceBalance * sizePctMilli) / 100_000n;
  if (amountIn === 0n) {
    return { verdict: "rejected", reason: "computed trade size rounds to zero" };
  }

  const tokenInDecimals = decision.action === "buy" ? quoteDecimals : tickerPrice.decimals;
  const notionalUsd1e18 = (amountIn * tokenInPrice.priceUsd1e18) / 10n ** BigInt(tokenInDecimals);
  if (notionalUsd1e18 > policy.maxNotionalPerTrade) {
    return {
      verdict: "rejected",
      reason: `notional $${usd1e18ToNumber(notionalUsd1e18).toFixed(2)} exceeds per-trade cap of $${usd1e18ToNumber(policy.maxNotionalPerTrade).toFixed(2)}`,
    };
  }

  const tokenOutDecimals = decision.action === "buy" ? tickerPrice.decimals : quoteDecimals;
  const fairOut = (notionalUsd1e18 * 10n ** BigInt(tokenOutDecimals)) / tokenOutPrice.priceUsd1e18;
  const minOut = (fairOut * (BPS_DENOMINATOR - policy.maxSlippageBps)) / BPS_DENOMINATOR;
  const amountOut = fairOut;

  const currentTokenOutBalance =
    portfolio.positions.find((p) => p.token.toLowerCase() === tokenOut.toLowerCase())?.rawBalance ??
    0n;
  const postTradeTokenOutBalance = currentTokenOutBalance + amountOut;
  const postTradeTokenOutValueUsd1e18 =
    (postTradeTokenOutBalance * tokenOutPrice.priceUsd1e18) / 10n ** BigInt(tokenOutDecimals);
  if (
    postTradeTokenOutValueUsd1e18 * BPS_DENOMINATOR >
    policy.maxPositionBps * portfolio.navUsd1e18
  ) {
    return {
      verdict: "rejected",
      reason: `estimated post-trade position share of ${decision.ticker} exceeds max position bps`,
    };
  }

  return {
    verdict: "accepted",
    trade: { tokenIn, tokenOut, amountIn, amountOut, minOut, router, notionalUsd1e18 },
  };
}
