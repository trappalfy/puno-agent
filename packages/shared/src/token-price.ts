import { latestPriceOverride, type CreditsDb } from "./db/credits.js";

export type TokenPriceSource = "twap" | "override";

export interface TokenPrice {
  priceUsd: number;
  source: TokenPriceSource;
  /// When this rate was established — pool observation time, or when someone
  /// entered the manual override.
  at: Date;
  /// False when this rate is only good enough to *show* — old enough that the
  /// crediting path would refuse it (see the two windows below).
  ///
  /// Exists because the split between the windows creates a state that did not
  /// exist before: a rate the pricing page will display and the indexer will
  /// not credit at. Quoting "send 5,000 PUNO for $5" from such a rate is a
  /// promise we would not keep — the deposit is credited at whatever rate is
  /// fresh when the indexer finally values it, not at the one on screen. Better
  /// to carry the fact than to let each caller rediscover it from `at`.
  usableForCredit: boolean;
}

/// Thrown rather than returning a fallback number. This rate decides how much
/// credit real money buys; guessing it would quietly mis-bill every deposit
/// until someone noticed, whereas a failed credit is visible and replayable
/// (the deposit is still on-chain, and the watcher re-processes it).
export class TokenPriceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenPriceUnavailableError";
  }
}

/// How old a hand-typed rate may be and still be used to **credit money**.
///
/// A deposit is valued at the rate in force when the indexer processes it, so a
/// rate that has drifted from the market mis-prices every deposit that arrives
/// in the meantime. In the direction where ours is the high one it is also
/// simply buyable: acquire PUNO at the market price, deposit it at ours. The
/// damage is bounded — credit is spend-only, there is no path that takes it
/// back out of the system — but the bound is our Anthropic bill, not zero.
///
/// Failing closed is what makes a short window affordable: the deposit stays
/// on-chain, the indexer refuses to advance its cursor past an event it could
/// not value, and everything replays once a rate is set. Users wait; nothing is
/// lost. Was 7 days, which is far longer than a launching token holds a price.
///
/// **72 hours, and the number is a schedule rather than a risk appetite**
/// (widened from 24 h on 2026-08-17). Until `readPoolTwap` reads a real pool,
/// this rate is written by a human running `set-rate`, and what actually matters
/// operationally is not the window but the slack: `window − refresh interval`.
/// At 24 h with a daily refresh the slack is **zero** — forget once and crediting
/// stops. At 72 h the same daily habit absorbs two consecutive misses, which is
/// what an unstaffed weekend or one sick day looks like.
///
/// It is not longer than that because a stale rate is not only *our* exposure.
/// In the direction where ours is the low one the depositor is short-changed:
/// the top-up card asks for tokens worth $60 at the current market and credits
/// $20, and during a launch week a token moves multiples. That harm has no
/// bound, unlike the buy-cheap-deposit-high direction above, and a week-long
/// window is where it starts being measured in someone else's money.
///
/// Setting the rate does not have to wait for expiry — the age is measured from
/// the newest row, so writing it resets the clock. Refresh on a schedule and
/// this window is never approached; the warning below is then a backstop rather
/// than an alarm clock.
export const MAX_OVERRIDE_AGE_MS = 72 * 60 * 60 * 1000;

/// How old a rate may be and still be **shown**.
///
/// Deliberately much longer than the crediting window, because the two failures
/// are not comparable. Refusing to credit at a stale rate protects money;
/// refusing to *display* one only blanks the public pricing page — "PUNO rate
/// pending" where a number should be — which is worse than showing a day-old
/// number next to the date it was set.
///
/// Same shape as the contract's QUOTE_STALENESS vs EQUITY_STALENESS: a single
/// threshold cannot serve two readers with different costs of being wrong, so
/// the strict one goes where value moves and not everywhere.
export const MAX_DISPLAY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/// How much of the crediting window may remain before the worker starts saying
/// the rate is about to expire.
///
/// Billing that stops silently is the worst of the available failures and it is
/// the *default* one — nothing else in the system mentions the rate until a
/// deposit fails to value.
///
/// **A full day of margin, not half the window.** It was half (12 h of 24 h),
/// and scaling that rule to the 72 h window would warn at 36 h remaining — which
/// under the daily refresh habit the window is sized for means warning while two
/// thirds of it is still unused. A warning that fires on a healthy schedule is
/// one an operator learns to skip, and then the real one goes with it. At 24 h
/// remaining the rate has already gone a full cycle unrefreshed, which is the
/// first moment something is actually wrong, and there is still a whole day to
/// act.
export const OVERRIDE_WARNING_AGE_MS = 24 * 60 * 60 * 1000;

export interface PriceInputs {
  twap: { priceUsd: number; at: Date } | null;
  override: { priceUsd: number; at: Date } | null;
  now: Date;
  /// Defaults to the crediting window, so a caller that forgets to think about
  /// it gets the strict answer. Display paths opt into MAX_DISPLAY_AGE_MS.
  maxOverrideAgeMs?: number | undefined;
}

/// Largest unit that does not read as a rounding artefact. "26 hours" beats
/// "1 days" when the window it is being compared against is measured in hours.
function formatAge(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/// The precedence and validity rules, with no I/O — this is where every
/// decision about whether a rate may be used for money lives, so it is unit
/// tested directly rather than through a database (same split as
/// apps/agent's quota gate.ts vs service.ts).
export function resolveTokenPrice({
  twap,
  override,
  now,
  maxOverrideAgeMs = MAX_OVERRIDE_AGE_MS,
}: PriceInputs): TokenPrice {
  if (twap) {
    if (!(twap.priceUsd > 0)) {
      throw new TokenPriceUnavailableError(
        `Pool TWAP returned ${twap.priceUsd}, which is not a usable price.`,
      );
    }
    // A pool read is by construction current, so there is no window to fail.
    return { priceUsd: twap.priceUsd, source: "twap", at: twap.at, usableForCredit: true };
  }

  if (!override) {
    throw new TokenPriceUnavailableError(
      "No PUNO/USD rate available: no pool TWAP and no manual override has ever been set.",
    );
  }

  const ageMs = now.getTime() - override.at.getTime();
  if (ageMs > maxOverrideAgeMs) {
    throw new TokenPriceUnavailableError(
      `Manual PUNO/USD rate is ${formatAge(ageMs)} old (max ${formatAge(maxOverrideAgeMs)}); ` +
        `refusing to credit deposits at a stale rate.`,
    );
  }

  if (!(override.priceUsd > 0)) {
    throw new TokenPriceUnavailableError(
      `Manual PUNO/USD rate is ${override.priceUsd}, which is not a usable price.`,
    );
  }

  return {
    priceUsd: override.priceUsd,
    source: "override",
    at: override.at,
    // Always measured against the crediting window, whichever window this call
    // was allowed to *pass* — the flag answers "would the money path take
    // this?", and a display caller needs that answer precisely because it was
    // given a looser one.
    usableForCredit: ageMs <= MAX_OVERRIDE_AGE_MS,
  };
}

/// Reads a time-weighted average price from a PUNO/USDG pool.
///
/// Returns null until PUNO exists and has a pool worth reading. Deliberately a
/// real seam rather than a TODO: when the pool is live this is the only
/// function that changes, and `resolveTokenPrice` already prefers it over the
/// manual rate.
export async function readPoolTwap(): Promise<{ priceUsd: number; at: Date } | null> {
  return null;
}

/// A line for the worker log when the manual rate needs attention, or null when
/// it does not. Same shape as `whyClosed` in network/policy.ts: the predicate
/// returns the reason, so the message and the condition cannot drift apart.
///
/// This is checked on its own schedule rather than when a deposit arrives, and
/// that is the entire point. The crediting path only mentions the rate when it
/// has already failed to value someone's money — which, in a quiet week, is the
/// first anyone hears of it. The expiry is knowable in advance; nothing else in
/// the system says so out loud.
export function rateStalenessWarning(
  override: { priceUsd: number; at: Date } | null,
  now: Date,
): string | null {
  if (!override) {
    return (
      "No PUNO/USD rate has ever been set, so no deposit can be credited. " +
      'Set one with: pnpm --filter @puno/agent set-rate -- <price> --note "<why>"'
    );
  }

  const ageMs = now.getTime() - override.at.getTime();
  if (ageMs > MAX_OVERRIDE_AGE_MS) {
    return (
      `PUNO/USD rate expired ${formatAge(ageMs - MAX_OVERRIDE_AGE_MS)} ago ` +
      `(set ${formatAge(ageMs)} ago, at $${override.priceUsd}). Deposits are NOT being credited — ` +
      "they stay on-chain and replay once a fresh rate is set."
    );
  }

  const remainingMs = MAX_OVERRIDE_AGE_MS - ageMs;
  if (remainingMs <= OVERRIDE_WARNING_AGE_MS) {
    return (
      `PUNO/USD rate expires in ${formatAge(remainingMs)} (set ${formatAge(ageMs)} ago, ` +
      `at $${override.priceUsd}). Crediting stops when it does.`
    );
  }

  return null;
}

async function readSources(db: CreditsDb) {
  const [twap, override] = await Promise.all([readPoolTwap(), latestPriceOverride(db)]);
  return { twap, override };
}

/// PUNO/USD for charging against, preferring the market over our own opinion of
/// it. Throws on anything it will not bill at.
export async function getPunoUsdPrice(db: CreditsDb, now = new Date()): Promise<TokenPrice> {
  const { twap, override } = await readSources(db);
  return resolveTokenPrice({ twap, override, now });
}

/// PUNO/USD for showing. Tolerates a rate too old to charge against — such a
/// rate comes back with `usableForCredit: false` rather than as null, so a
/// caller can render the number and say how old it is.
///
/// Returns null only when there is no usable rate at all, so a pricing page
/// renders "rate unavailable" rather than 500. Deliberately not implemented in
/// terms of getPunoUsdPrice: the whole point is that it accepts what that one
/// refuses.
export async function tryGetPunoUsdPrice(
  db: CreditsDb,
  now = new Date(),
): Promise<TokenPrice | null> {
  try {
    const { twap, override } = await readSources(db);
    return resolveTokenPrice({ twap, override, now, maxOverrideAgeMs: MAX_DISPLAY_AGE_MS });
  } catch (err) {
    if (err instanceof TokenPriceUnavailableError) return null;
    throw err;
  }
}
