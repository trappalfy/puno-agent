import type { Address } from "viem";
import { readNav, readTokenBalance } from "../chain/vault.js";
import type { MarketPrice } from "./market.js";

export interface TokenPosition {
  token: Address;
  symbol: string;
  decimals: number;
  rawBalance: bigint;
  valueUsd1e18: bigint;
  stalePrice: boolean;
}

export interface Portfolio {
  // null when NAV is unavailable — AgentVault._nav() sums _valueOf() over
  // every allowed token unconditionally, so a single stale feed makes the
  // on-chain nav() call itself revert (fail-closed, not a degraded read).
  // We surface that as "unavailable" rather than silently computing a local
  // NAV that the contract itself would refuse to report.
  navUsd1e18: bigint | null;
  navError: string | null;
  positions: TokenPosition[];
  quoteToken: Address;
  quoteBalance: bigint;
}

export async function portfolio(
  vault: Address,
  quoteToken: Address,
  prices: MarketPrice[],
): Promise<Portfolio> {
  const [navResult, balances] = await Promise.all([
    readNav(vault)
      .then((v) => ({ ok: true as const, value: v }))
      .catch((err: unknown) => ({ ok: false as const, error: (err as Error).message })),
    Promise.all(prices.map((p) => readTokenBalance(p.token, vault))),
  ]);

  const positions: TokenPosition[] = prices.map((p, i) => {
    const rawBalance = balances[i] ?? 0n;
    const valueUsd1e18 =
      p.stale || rawBalance === 0n ? 0n : (rawBalance * p.priceUsd1e18) / 10n ** BigInt(p.decimals);
    return {
      token: p.token,
      symbol: p.symbol,
      decimals: p.decimals,
      rawBalance,
      valueUsd1e18,
      stalePrice: p.stale,
    };
  });

  const quotePosition = positions.find(
    (pos) => pos.token.toLowerCase() === quoteToken.toLowerCase(),
  );

  return {
    navUsd1e18: navResult.ok ? navResult.value : null,
    navError: navResult.ok ? null : navResult.error,
    positions,
    quoteToken,
    quoteBalance: quotePosition?.rawBalance ?? 0n,
  };
}
