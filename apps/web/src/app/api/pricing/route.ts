import { NextResponse } from "next/server";
import {
  PRICES_USD,
  MIN_DEPOSIT_USD,
  TOP_UP_PRESETS_USD,
  usdToTokens,
  tryGetPunoUsdPrice,
  creditsNetwork,
  type BillableEvent,
} from "@puno/shared";
import { db } from "@/lib/db";

/// Public, unauthenticated prices — in PUNO, which is the unit the product
/// quotes in everywhere now.
///
/// It exists because `apps/site` is a static Vite build with no session and no
/// database, and the rate it needs lives in Postgres rather than in config. The
/// alternative was baking a rate into the site's build, which would have been a
/// second source of truth for the one number the whole billing path turns on —
/// the same mistake the `NEXT_PUBLIC_MAINNET_OPEN` flag would have been.
///
/// Distinct from `/api/billing/balance`, which is `requireAccount`-gated and
/// carries a person's balance and ledger. Everything here is on the public
/// pricing page already; nothing is per-account, and in particular the BYOK
/// discount is not applied, because that is a property of an account.
export const dynamic = "force-dynamic";

export async function GET() {
  const network = creditsNetwork();
  const decimals = network?.punoDecimals ?? 18;

  // The display window, not the crediting one: a marketing page showing a
  // day-old rate beside the date it was set is better than one showing nothing.
  // Nobody is charged from this response.
  const tokenPrice = await tryGetPunoUsdPrice(db);
  const rate = tokenPrice?.priceUsd ?? null;

  const toTokens = (usd: number): string | null =>
    rate && rate > 0 ? usdToTokens(usd, rate, decimals).toString() : null;

  const pricesTokens = Object.fromEntries(
    (Object.keys(PRICES_USD) as BillableEvent[]).map((event) => [
      event,
      toTokens(PRICES_USD[event]),
    ]),
  ) as Record<BillableEvent, string | null>;

  return NextResponse.json(
    {
      pricesUsd: PRICES_USD,
      pricesTokens,
      minDepositUsd: MIN_DEPOSIT_USD,
      minDepositTokens: toTokens(MIN_DEPOSIT_USD),
      topUpPresets: TOP_UP_PRESETS_USD.map((usd) => ({ usd, tokens: toTokens(usd) })),
      punoDecimals: decimals,
      tokenPrice: tokenPrice
        ? { priceUsd: tokenPrice.priceUsd, source: tokenPrice.source, at: tokenPrice.at }
        : null,
    },
    {
      headers: {
        // The marketing site is a different origin by design (`apps/site` is
        // deployed separately), and this data is public by definition.
        "Access-Control-Allow-Origin": "*",
        // Long enough that a burst on the landing page does not become a burst
        // of database reads, short enough that a rate change shows up quickly.
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
