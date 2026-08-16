import { PRICES_USD, MIN_DEPOSIT_USD, TOP_UP_PRESETS_USD, usdToTokens } from "@puno/shared";

/// The largest factor a hand-typed rate may move by in one step before the
/// script insists on `--force`.
///
/// Aimed at the typo, not at the market: the mistake this catches is a dropped
/// or added zero, which is always a factor of ten. Four leaves room for a real
/// move — a launching token doubling or halving inside a day is unremarkable —
/// while still catching every slip of a decimal point.
///
/// This is the only check standing between a keystroke and the rate every
/// deposit is valued at, which is the same position the visual address check
/// occupies after the clipboard incident. Both exist because there is no second
/// system to disagree with the number.
export const MAX_RATE_JUMP = 4;

/// `token_price_overrides.price_usd` is `numeric(24, 12)`: twelve digits after
/// the point, twelve before. A value below the scale rounds to zero on the way
/// in, and `resolveTokenPrice` then rejects it as "not a usable price" — the
/// failure would surface on the first deposit rather than here, and would look
/// like a bug rather than a typo.
export const MIN_REPRESENTABLE_USD = 1e-12;
export const MAX_REPRESENTABLE_USD = 1e12;

export interface SetRateArgs {
  priceUsd: number;
  note: string;
  force: boolean;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/// Reads the command line, and nothing else — no database, no clock, no
/// environment. Split from the runnable script for the same reason
/// `parseCreateAgentBody` is split from its route: the rules below are the part
/// worth testing, and they should not need a Postgres to exercise.
///
/// Accepts `--note "why"` and `--note=why` both, because the second is what
/// anyone reaching for shell history will type.
export function parseSetRateArgs(argv: string[]): Parsed<SetRateArgs> {
  let price: string | null = null;
  let note: string | null = null;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    // pnpm forwards the `--` separator rather than consuming it, so the
    // documented invocation arrives here as ["--", "0.001", "--note", ...].
    // Skipped rather than treated as POSIX end-of-options: everything after it
    // is exactly the flags the user meant to pass.
    if (arg === "--") continue;

    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--note") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, error: "--note needs a value" };
      }
      note = next;
      i++;
      continue;
    }
    if (arg.startsWith("--note=")) {
      note = arg.slice("--note=".length);
      continue;
    }
    if (arg.startsWith("--")) {
      return { ok: false, error: `unknown flag ${arg}` };
    }
    if (price !== null) {
      return { ok: false, error: `unexpected extra argument "${arg}"` };
    }
    price = arg;
  }

  if (price === null) return { ok: false, error: "a price in USD is required" };

  const priceUsd = Number(price);
  if (!Number.isFinite(priceUsd)) {
    return { ok: false, error: `"${price}" is not a number` };
  }
  if (priceUsd <= 0) {
    return { ok: false, error: "the price must be above zero" };
  }
  if (priceUsd < MIN_REPRESENTABLE_USD) {
    return {
      ok: false,
      error:
        `${priceUsd} is below the ${MIN_REPRESENTABLE_USD} the price column can store ` +
        "(numeric(24, 12)) — it would round to zero and be rejected on the first deposit",
    };
  }
  if (priceUsd >= MAX_REPRESENTABLE_USD) {
    return {
      ok: false,
      error: `${priceUsd} is beyond what the price column can store (numeric(24, 12))`,
    };
  }

  // Required, not optional. The table is append-only, so these rows are the
  // only record of why the rate is what it is — and the question "why did we
  // credit at that number" is asked after the fact, when whoever typed it is
  // not available to answer.
  const trimmed = note?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, error: '--note is required, e.g. --note "launch price, pool seeded at X"' };
  }

  return { ok: true, value: { priceUsd, note: trimmed, force } };
}

/// Whether this rate may be written, given what the last one was.
export function checkRateChange(input: {
  priceUsd: number;
  previousUsd: number | null;
  force: boolean;
}): { ok: true; warning: string | null } | { ok: false; error: string } {
  const { priceUsd, previousUsd, force } = input;

  if (previousUsd === null || previousUsd <= 0) {
    // Nothing to compare against. The first rate is unguarded by construction,
    // which is worth knowing rather than papering over: the preview is the only
    // check on it, so it should be read rather than skipped.
    return { ok: true, warning: null };
  }

  const factor = Math.max(priceUsd / previousUsd, previousUsd / priceUsd);
  if (factor <= MAX_RATE_JUMP) return { ok: true, warning: null };

  const direction = priceUsd > previousUsd ? "up" : "down";
  const described =
    `${factor.toFixed(1)}x ${direction} from $${previousUsd} to $${priceUsd} ` +
    `(limit ${MAX_RATE_JUMP}x)`;

  if (force) {
    // Allowed, but never quiet: --force is for a real move, and a real move is
    // exactly when someone should be able to find this line afterwards.
    return { ok: true, warning: `rate moved ${described} — allowed by --force` };
  }

  return {
    ok: false,
    error:
      `refusing this change: ${described}. A dropped or added zero looks exactly like this. ` +
      "If the market really moved that far, re-run with --force.",
  };
}

export interface PreviewRow {
  label: string;
  usd: number;
  tokens: bigint;
}

/// What this rate turns the product's prices into.
///
/// Computed with the same `usdToTokens` that bills and that the top-up card
/// quotes — not a second formula. A preview derived independently would be
/// reassuring and wrong, which is worse than no preview: the round-up
/// correction on that helper's last line is precisely the sort of detail a
/// re-implementation drops.
export function ratePreview(priceUsd: number, decimals: number): PreviewRow[] {
  const rows: { label: string; usd: number }[] = [
    { label: "Market check", usd: PRICES_USD.screen },
    { label: "Decision", usd: PRICES_USD.decision },
    { label: "Executed trade", usd: PRICES_USD.trade },
    { label: "Minimum deposit", usd: MIN_DEPOSIT_USD },
    // The first preset *is* the minimum deposit, so listing it twice would put
    // the same row under two labels. Filtered rather than hardcoded past,
    // because which presets coincide is TOP_UP_PRESETS_USD's business.
    ...TOP_UP_PRESETS_USD.filter((usd) => usd !== MIN_DEPOSIT_USD).map((usd) => ({
      label: "Top-up",
      usd,
    })),
  ];

  return rows.map(({ label, usd }) => ({
    label,
    usd,
    tokens: usdToTokens(usd, priceUsd, decimals),
  }));
}
