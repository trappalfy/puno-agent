import type { Address } from "viem";
import { agentVaultAbi, erc20Abi, aggregatorV3Abi } from "@puno/shared";
import { publicClient } from "./client.js";

export interface VaultIdentity {
  owner: Address;
  quoteToken: Address;
  agent: Address;
  agentExpiry: bigint;
  paused: boolean;
}

export interface VaultPolicy {
  maxNotionalPerTrade: bigint; // 1e18-scaled USD
  maxDailyNotional: bigint; // 1e18-scaled USD
  maxPositionBps: bigint;
  minSecondsBetweenTrades: bigint;
  maxSlippageBps: bigint;
  lastTradeTimestamp: bigint;
  allowedTokens: Address[];
  allowedRouters: Address[];
}

export interface TokenMeta {
  decimals: number;
  aggregator: Address;
  priceDecimals: number;
  /// This token's own staleness window, in seconds. Per-feed rather than one
  /// vault-wide constant: a dollar peg on a 24h heartbeat and an equity feed
  /// that republishes every few minutes cannot share a threshold.
  maxStalenessSeconds: bigint;
}

export interface PriceReading {
  answer: bigint; // raw, in the feed's own decimals
  priceDecimals: number;
  updatedAt: bigint; // unix seconds
}

async function readAgentVault<T>(
  vault: Address,
  functionName: string,
  args: readonly unknown[] = [],
) {
  return publicClient.readContract({
    address: vault,
    abi: agentVaultAbi,
    functionName: functionName as never,
    args: args as never,
  }) as Promise<T>;
}

export async function readVaultIdentity(vault: Address): Promise<VaultIdentity> {
  const [owner, quoteToken, agent, agentExpiry, paused] = await Promise.all([
    readAgentVault<Address>(vault, "owner"),
    readAgentVault<Address>(vault, "quoteToken"),
    readAgentVault<Address>(vault, "agent"),
    readAgentVault<bigint>(vault, "agentExpiry"),
    readAgentVault<boolean>(vault, "paused"),
  ]);
  return { owner, quoteToken, agent, agentExpiry, paused };
}

export async function readVaultPolicy(vault: Address): Promise<VaultPolicy> {
  const [
    maxNotionalPerTrade,
    maxDailyNotional,
    maxPositionBps,
    minSecondsBetweenTrades,
    maxSlippageBps,
    lastTradeTimestamp,
    routersLen,
    tokensLen,
  ] = await Promise.all([
    readAgentVault<bigint>(vault, "maxNotionalPerTrade"),
    readAgentVault<bigint>(vault, "maxDailyNotional"),
    readAgentVault<bigint>(vault, "maxPositionBps"),
    readAgentVault<bigint>(vault, "minSecondsBetweenTrades"),
    readAgentVault<bigint>(vault, "maxSlippageBps"),
    readAgentVault<bigint>(vault, "lastTradeTimestamp"),
    readAgentVault<bigint>(vault, "allowedRoutersLength"),
    readAgentVault<bigint>(vault, "allowedTokensLength"),
  ]);

  // No verified Multicall3 deployment on Robinhood Chain testnet — sequential
  // reads here are deliberate, not an oversight (see contracts/script/DeployTestnet.s.sol
  // for the same reasoning applied to router addresses). Lists are short
  // (allowlisted tickers), so this stays well within one tick's time budget.
  const allowedRouters: Address[] = [];
  for (let i = 0n; i < routersLen; i++) {
    allowedRouters.push(await readAgentVault<Address>(vault, "allowedRouters", [i]));
  }
  const allowedTokens: Address[] = [];
  for (let i = 0n; i < tokensLen; i++) {
    allowedTokens.push(await readAgentVault<Address>(vault, "allowedTokens", [i]));
  }

  return {
    maxNotionalPerTrade,
    maxDailyNotional,
    maxPositionBps,
    minSecondsBetweenTrades,
    maxSlippageBps,
    lastTradeTimestamp,
    allowedTokens,
    allowedRouters,
  };
}

export async function readTokenMeta(vault: Address, token: Address): Promise<TokenMeta> {
  const [decimals, feed] = await Promise.all([
    readAgentVault<number>(vault, "tokenDecimals", [token]),
    readAgentVault<[Address, number, number]>(vault, "priceFeeds", [token]),
  ]);
  return {
    decimals,
    aggregator: feed[0],
    priceDecimals: feed[1],
    maxStalenessSeconds: BigInt(feed[2]),
  };
}

export async function readPrice(aggregator: Address): Promise<PriceReading> {
  const [, answer, , updatedAt] = await publicClient.readContract({
    address: aggregator,
    abi: aggregatorV3Abi,
    functionName: "latestRoundData",
  });
  const priceDecimals = await publicClient.readContract({
    address: aggregator,
    abi: aggregatorV3Abi,
    functionName: "decimals",
  });
  return { answer, priceDecimals, updatedAt };
}

export async function readNav(vault: Address): Promise<bigint> {
  return readAgentVault<bigint>(vault, "nav");
}

/// The vault's ceiling on any single feed's window. Not the threshold used to
/// judge a price — that is per-feed and comes back in readTokenMeta — this is
/// only the bound setPriceFeed enforces, exposed for tooling and diagnostics.
export async function readMaxStalenessLimitSeconds(vault: Address): Promise<bigint> {
  return readAgentVault<bigint>(vault, "MAX_STALENESS_LIMIT");
}

export async function readTokenBalance(token: Address, owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

export async function readTokenSymbol(token: Address): Promise<string> {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" });
}

/// Chainlink price scaled to 1e18, mirroring AgentVault._normalizedPrice exactly.
export function normalizePriceTo1e18(reading: PriceReading): bigint {
  return reading.answer * 10n ** BigInt(18 - reading.priceDecimals);
}
