import { latestPriceOverride, type CreditsDb } from "./db/credits.js";

export type TokenPriceSource = "twap" | "override";

export interface TokenPrice {
  priceUsd: number;
  source: TokenPriceSource;
  /// When this rate was established — pool observation time, or when someone
  /// entered the manual override.
  at: Date;
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

/// A manual rate older than this is treated as no rate at all. Crediting a
/// deposit at a week-stale hand-typed price is worse than failing: the failure
/// is recoverable, the mis-credit is not.
export const MAX_OVERRIDE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PriceInputs {
  twap: { priceUsd: number; at: Date } | null;
  override: { priceUsd: number; at: Date } | null;
  now: Date;
}

/// The precedence and validity rules, with no I/O — this is where every
/// decision about whether a rate may be used for money lives, so it is unit
/// tested directly rather than through a database (same split as
/// apps/agent's quota gate.ts vs service.ts).
export function resolveTokenPrice({ twap, override, now }: PriceInputs): TokenPrice {
  if (twap) {
    if (!(twap.priceUsd > 0)) {
      throw new TokenPriceUnavailableError(
        `Pool TWAP returned ${twap.priceUsd}, which is not a usable price.`,
      );
    }
    return { priceUsd: twap.priceUsd, source: "twap", at: twap.at };
  }

  if (!override) {
    throw new TokenPriceUnavailableError(
      "No PUNO/USD rate available: no pool TWAP and no manual override has ever been set.",
    );
  }

  const ageMs = now.getTime() - override.at.getTime();
  if (ageMs > MAX_OVERRIDE_AGE_MS) {
    const days = Math.floor(ageMs / 86_400_000);
    throw new TokenPriceUnavailableError(
      `Manual PUNO/USD rate is ${days} days old (max ${MAX_OVERRIDE_AGE_MS / 86_400_000}); refusing to credit deposits at a stale rate.`,
    );
  }

  if (!(override.priceUsd > 0)) {
    throw new TokenPriceUnavailableError(
      `Manual PUNO/USD rate is ${override.priceUsd}, which is not a usable price.`,
    );
  }

  return { priceUsd: override.priceUsd, source: "override", at: override.at };
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

/// PUNO/USD, preferring the market over our own opinion of it.
export async function getPunoUsdPrice(db: CreditsDb, now = new Date()): Promise<TokenPrice> {
  const [twap, override] = await Promise.all([readPoolTwap(), latestPriceOverride(db)]);
  return resolveTokenPrice({ twap, override, now });
}

/// Same as getPunoUsdPrice but returns null instead of throwing. For read-only
/// display paths — a pricing page should render "rate unavailable" rather than
/// 500, while the crediting path must still refuse to proceed.
export async function tryGetPunoUsdPrice(
  db: CreditsDb,
  now = new Date(),
): Promise<TokenPrice | null> {
  try {
    return await getPunoUsdPrice(db, now);
  } catch (err) {
    if (err instanceof TokenPriceUnavailableError) return null;
    throw err;
  }
}
