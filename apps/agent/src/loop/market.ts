import type { Address } from "viem";
import { readTokenMeta, readPrice, readTokenSymbol, normalizePriceTo1e18 } from "../chain/vault.js";

export interface MarketPrice {
  token: Address;
  symbol: string;
  decimals: number;
  priceUsd1e18: bigint;
  updatedAt: bigint;
  stale: boolean;
}

/// Reads the same Chainlink feeds AgentVault._normalizedPrice() reads, and
/// applies the same staleness rule client-side — so a "the market looks fine"
/// read here can never disagree with what executeTrade will actually accept.
/// No on-chain quoting exists for MockRouter (see contracts/mocks/MockRouter.sol
/// — it's a test double, not an AMM), so "market" here means oracle price
/// only; real DEX quotes are Phase 4 scope once a real router is wired in.
export async function market(vault: Address, tokens: Address[]): Promise<MarketPrice[]> {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  return Promise.all(
    tokens.map(async (token) => {
      const [meta, symbol] = await Promise.all([
        readTokenMeta(vault, token),
        readTokenSymbol(token),
      ]);
      const reading = await readPrice(meta.aggregator);
      // Each token is judged against its own configured window, exactly as
      // _normalizedPrice does on-chain. Using one threshold for all of them
      // would mark a healthy 24h-heartbeat quote feed stale here while the
      // vault happily traded on it — or the reverse, which is worse.
      const stale = nowSec - reading.updatedAt > meta.maxStalenessSeconds || reading.answer <= 0n;
      return {
        token,
        symbol,
        decimals: meta.decimals,
        priceUsd1e18: reading.answer > 0n ? normalizePriceTo1e18(reading) : 0n,
        updatedAt: reading.updatedAt,
        stale,
      };
    }),
  );
}
