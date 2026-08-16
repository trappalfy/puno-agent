import { NextResponse } from "next/server";
import {
  PRICES_USD,
  MIN_DEPOSIT_USD,
  LOW_BALANCE_WARNING_USD,
  decisionsRemaining,
  usdToTokens,
  recentLedger,
  tryGetPunoUsdPrice,
  creditsNetwork,
  type BillableEvent,
} from "@puno/shared";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/auth";

/// Only a fallback for the window where no network sells credit yet — every
/// live conversion below uses the selected network's own `punoDecimals`.
const TOKEN_DECIMALS = 18;

/// Everything the console and the pricing page need to show what an action
/// costs and what's left. Prices are canonical in USD; the PUNO figures are
/// derived here so the client never has to hold a rate of its own.
export async function GET() {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const { account } = auth;

  // Whichever network is currently selling credit — exactly one at a time, and
  // never a process-wide `NETWORK`: this app serves both chains from one
  // deployment. See `creditsNetworkFrom` for why a union would let testnet's
  // free mock PUNO buy real credit.
  const network = creditsNetwork();
  const decimals = network?.punoDecimals ?? TOKEN_DECIMALS;

  // Read-only path: a missing rate renders as "unavailable" rather than a 500.
  // Crediting a deposit still refuses outright — see getPunoUsdPrice.
  const tokenPrice = await tryGetPunoUsdPrice(db);

  const balanceUsd = Number(account.creditBalanceUsd);
  const usesOwnKey = !!account.anthropicApiKeyEncrypted;

  const pricesUsd: Record<BillableEvent, number> = {
    // BYOK waives model charges but not execution — mirrors priceFor() in
    // apps/agent/src/quota/service.ts, which is what actually bills.
    screen: usesOwnKey ? 0 : PRICES_USD.screen,
    decision: usesOwnKey ? 0 : PRICES_USD.decision,
    trade: PRICES_USD.trade,
  };

  const pricesTokens = tokenPrice
    ? Object.fromEntries(
        Object.entries(pricesUsd).map(([event, usd]) => [
          event,
          usd === 0 ? "0" : usdToTokens(usd, tokenPrice.priceUsd, decimals).toString(),
        ]),
      )
    : null;

  const ledger = await recentLedger(db, account.id, 20);

  return NextResponse.json({
    balanceUsd,
    decisionsRemaining: decisionsRemaining(balanceUsd),
    lowBalance: balanceUsd <= LOW_BALANCE_WARNING_USD,
    usesOwnKey,
    pricesUsd,
    pricesTokens,
    minDepositUsd: MIN_DEPOSIT_USD,
    minDepositTokens: tokenPrice
      ? usdToTokens(MIN_DEPOSIT_USD, tokenPrice.priceUsd, decimals).toString()
      : null,
    tokenPrice: tokenPrice
      ? { priceUsd: tokenPrice.priceUsd, source: tokenPrice.source, at: tokenPrice.at }
      : null,
    contracts: {
      punoToken: network?.punoToken ?? null,
      punoCredits: network?.punoCredits ?? null,
      // The chain those two addresses live on, so the browser can pin its
      // `approve`/`deposit` to it instead of sending to wherever the wallet
      // happens to be. Without this the top-up card can spend gas approving a
      // testnet address on mainnet — a call to an address with no code
      // succeeds silently, and at a colliding address it lands on some other
      // contract entirely.
      chainId: network?.chainId ?? null,
      networkName: network?.name ?? null,
      punoDecimals: network?.punoDecimals ?? TOKEN_DECIMALS,
    },
    ledger: ledger.map((row) => ({
      id: row.id,
      kind: row.kind,
      amountUsd: Number(row.amountUsd),
      refType: row.refType,
      txHash: row.txHash,
      createdAt: row.createdAt,
    })),
  });
}
