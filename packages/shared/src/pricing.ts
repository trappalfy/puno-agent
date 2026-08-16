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

/// Granted once, at first sign-in. Buys **exactly one** paper decision — the
/// free tier exists so someone can watch the agent think once, and for nothing
/// else. Real trading is what the tariff is for.
///
/// The number is `screen + decision`, not a round figure, and it is deliberate:
/// a paper run never reaches a billable trade (only a `confirmed` trade is
/// charged — loop/tick.ts), so $0.51 is the exact cost of one full free run and
/// the balance lands on zero. Earlier values left a remainder that could not buy
/// anything, which reads to the user as money we took and did not honour.
///
/// History: $3.00 → $1.00 (2026-08-14) → $0.51. The $1.00 comment claimed it
/// bought two decisions; it bought one, because the L2 gate reserves
/// `decision + trade` up front and $0.24 could not clear it. Verified by
/// simulating the real gates against the real prices, not by arithmetic on the
/// decision price alone.
///
/// This is the one cost that never recovers: paid in real dollars to Anthropic,
/// returning nothing to the treasury, for every account that ever signs in —
/// converting or not. Our measured cost for one screen + one decision is about
/// $0.034, so the grant is priced above what it costs us and the exposure per
/// signup is a few cents, not a dollar.
export const STARTER_GRANT_USD = PRICES_USD.screen + PRICES_USD.decision;

/// Below this a top-up costs more in gas and indexing than it delivers.
export const MIN_DEPOSIT_USD = 5.0;

/// The amounts the top-up card offers. Shared rather than local to that card
/// because `set-rate` previews what a proposed rate turns them into, and a
/// preview of amounts the user is never offered would be answering a different
/// question than the one being decided.
///
/// `readonly number[]` rather than `as const`: the literal types `as const`
/// produces narrow `useState(PRESETS[0])` to `useState<5>`, so selecting any
/// other preset stops typechecking. These are amounts, not a closed set of tags.
export const TOP_UP_PRESETS_USD: readonly number[] = [MIN_DEPOSIT_USD, 20, 50];

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

/// Raw on-chain token amount -> a string for a person to read.
///
/// Lives here rather than in either app because prices are now quoted in PUNO
/// on the marketing site as well as in the product, and two formatters would
/// eventually disagree about the same number on two pages describing the same
/// price.
///
/// Deliberately not `Intl.NumberFormat` on a divided float: a raw 18-decimal
/// amount exceeds `Number.MAX_SAFE_INTEGER` at about 0.01 tokens, so the whole
/// part is taken in bigint and only the small fraction becomes a Number.
export function formatTokens(raw: bigint, decimals: number, maxFractionDigits = 0): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  const wholeStr = whole.toLocaleString("en-US");
  if (frac === 0n || maxFractionDigits === 0) return wholeStr;
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

/// Same amount, shortened, for places where the full figure will not fit.
///
/// Needed because quoting in PUNO makes the numbers long in a way dollars never
/// were: a $50 top-up is "125,000 PUNO" at the launch rate, and three of those
/// side by side is exactly the button-overflow this UI was already fixed for
/// once. The exact amount is always shown somewhere less cramped.
export function formatTokensCompact(raw: bigint, decimals: number): string {
  const whole = raw / 10n ** BigInt(decimals);
  if (whole >= 1_000_000n) return `${trimZeros(Number(whole / 1_000n) / 1_000)}M`;
  if (whole >= 10_000n) return `${trimZeros(Number(whole) / 1_000)}K`;
  return whole.toLocaleString("en-US");
}

function trimZeros(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
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
