"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { agentVaultAbi, aggregatorV3Abi, classifyMarket, type MarketSession } from "@puno/shared";

/// Whether this vault's oracles are currently publishing, read live from chain.
///
/// Read here rather than taken from the worker's last recorded state, and that
/// is the point: the page should say what is true *now*, not what was true the
/// last time a worker happened to run. A vault whose worker is stopped would
/// otherwise show a stale opinion about staleness.
///
/// Costs one read per allowlisted token plus one per feed. Acceptable for a
/// page a person is looking at; it is not on the trading path.
export function useMarketSession(
  vaultAddress: Address | undefined,
  quoteToken: string | undefined,
): MarketSession | null {
  const vault = { address: vaultAddress, abi: agentVaultAbi } as const;

  const { data: tokenCount } = useReadContract({
    ...vault,
    functionName: "allowedTokensLength",
    query: { enabled: !!vaultAddress },
  });

  const count = tokenCount === undefined ? 0 : Number(tokenCount);

  const { data: tokens } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      ...vault,
      functionName: "allowedTokens" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: !!vaultAddress && count > 0 },
  });

  const tokenAddresses = (tokens ?? [])
    .map((t) => t.result as Address | undefined)
    .filter((t): t is Address => !!t);

  // The vault stores each feed's own window, so the same read gives both the
  // aggregator and the threshold it must be judged against. One global
  // threshold would mark a healthy 24h-heartbeat quote feed stale — the exact
  // mistake the per-feed design exists to prevent.
  const { data: feeds } = useReadContracts({
    contracts: tokenAddresses.map((token) => ({
      ...vault,
      functionName: "priceFeeds" as const,
      args: [token] as const,
    })),
    query: { enabled: tokenAddresses.length > 0 },
  });

  const { data: symbols } = useReadContracts({
    contracts: tokenAddresses.map((token) => ({
      address: token,
      abi: [
        {
          type: "function",
          name: "symbol",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "string" }],
        },
      ] as const,
      functionName: "symbol" as const,
    })),
    query: { enabled: tokenAddresses.length > 0 },
  });

  const { data: rounds } = useReadContracts({
    contracts: (feeds ?? []).map((f) => ({
      address: (f.result as readonly [Address, number, number] | undefined)?.[0],
      abi: aggregatorV3Abi,
      functionName: "latestRoundData" as const,
    })),
    query: { enabled: (feeds?.length ?? 0) > 0 },
  });

  if (!vaultAddress || !quoteToken || !feeds || !rounds || !symbols) return null;
  if (tokenAddresses.length === 0) return classifyMarket({ quoteStale: false, equities: [] });

  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  const readings = tokenAddresses.map((token, i) => {
    const feed = feeds[i]?.result as readonly [Address, number, number] | undefined;
    const round = rounds[i]?.result as
      readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
    const symbol = (symbols[i]?.result as string | undefined) ?? token.slice(0, 8);

    // A feed that could not be read is stale by definition — the vault would
    // revert on it just the same, and guessing "fine" here would show a green
    // page for a vault that cannot trade.
    const stale = !feed || !round || nowSec - round[3] > BigInt(feed[2]) || round[1] <= 0n;

    return { token, symbol, stale };
  });

  const quote = readings.find((r) => r.token.toLowerCase() === quoteToken.toLowerCase());

  return classifyMarket({
    quoteStale: quote?.stale ?? false,
    equities: readings
      .filter((r) => r.token.toLowerCase() !== quoteToken.toLowerCase())
      .map((r) => ({ symbol: r.symbol, stale: r.stale })),
  });
}
