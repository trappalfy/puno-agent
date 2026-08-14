/// Pay-per-action pricing. There is one plan: you top up a balance with PUNO
/// and every billable thing the agent does draws it down.
///
/// Prices are canonical in **USD**, not in tokens. Our costs (Anthropic, gas)
/// are dollar-denominated, so pegging the token price and letting the dollar
/// price float would put the margin at the mercy of the exchange rate. The user
/// still sees prices in PUNO — the conversion happens on our side, at the rate
/// in force when it's shown or charged.

export const PRICES_USD = {
  /// L1 Haiku screening. Fires on every triggered tick, so it is priced close
  /// to cost: the user never sees this call, and a visible per-screen charge
  /// would read as billing for nothing happening.
  screen: 0.01,
  /// L2 Opus decision — the thesis the user actually reads in the console.
  decision: 0.5,
  /// A trade that confirmed on-chain. Covers ~$0.02 of gas we pay from the
  /// agent wallet and carries the margin.
  trade: 0.25,
} as const;

export type BillableEvent = keyof typeof PRICES_USD;

/// Granted once, at first sign-in. Deliberately small — enough to watch the
/// agent reason twice before deciding to fund it, not enough to run a strategy
/// for free.
///
/// This is the one cost that never recovers: it is paid in real dollars to
/// Anthropic and returns nothing to the treasury, for every account that ever
/// signs in, converting or not. Cut from $3.00 to $1.00 on 2026-08-14 for
/// exactly that reason — at $0.50 a decision it buys two, which is enough to
/// see the agent think and not enough to be an acquisition budget.
export const STARTER_GRANT_USD = 1.0;

/// Below this a top-up costs more in gas and indexing than it delivers.
export const MIN_DEPOSIT_USD = 5.0;

/// Balance at or below this triggers the "top up soon" state in the UI. Not a
/// hard stop: the real gate is `balance >= price` at call time.
export const LOW_BALANCE_WARNING_USD = 1.0;

export function priceOf(event: BillableEvent): number {
  return PRICES_USD[event];
}

/// How many full decisions a balance still covers. The console's headline
/// number, because "$2.40 left" means nothing to someone deciding whether to
/// top up, and "4 decisions left" does.
export function decisionsRemaining(balanceUsd: number): number {
  if (balanceUsd <= 0) return 0;
  return Math.floor(balanceUsd / PRICES_USD.decision);
}

const MICRO = 1_000_000n;

/// Raw on-chain token amount -> USD, at `tokenUsdPrice`.
///
/// Scales down to micro-units *before* converting to a float. A raw 18-decimal
/// balance passes `Number.MAX_SAFE_INTEGER` at about 0.01 tokens, and this
/// result is written to the ledger as money — not rendered as a label — so the
/// precision loss would be real.
export function tokensToUsd(rawAmount: bigint, tokenUsdPrice: number, decimals: number): number {
  if (rawAmount <= 0n) return 0;
  const micros = (rawAmount * MICRO) / 10n ** BigInt(decimals);
  return (Number(micros) / 1e6) * tokenUsdPrice;
}

/// USD -> raw on-chain token amount, at `tokenUsdPrice`.
///
/// Rounds **up**. This is used to tell someone what to send for a $5 top-up;
/// rounding down would quote an amount that trips `PunoCredits: below minimum`
/// on the last wei.
export function usdToTokens(usdAmount: number, tokenUsdPrice: number, decimals: number): bigint {
  if (usdAmount <= 0) return 0n;
  if (!(tokenUsdPrice > 0)) {
    throw new Error("usdToTokens: token price must be positive");
  }
  const micros = BigInt(Math.ceil((usdAmount / tokenUsdPrice) * 1e6));
  const scale = 10n ** BigInt(decimals);
  const raw = (micros * scale) / MICRO;
  // Integer division above truncates; add one unit back so the result is never
  // a hair under the requested value.
  return (raw * MICRO) / scale < micros ? raw + 1n : raw;
}
