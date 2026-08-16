"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchJson, retryUnlessDenied } from "./fetchJson";

export type BillableEventKey = "screen" | "decision" | "trade";

export interface LedgerEntry {
  id: string;
  kind: "grant" | "deposit" | "charge" | "refund" | "adjustment";
  amountUsd: number;
  refType: "model_call" | "trade" | "deposit" | "manual" | null;
  txHash: string | null;
  createdAt: string;
}

export interface BalanceResponse {
  balanceUsd: number;
  decisionsRemaining: number;
  lowBalance: boolean;
  usesOwnKey: boolean;
  pricesUsd: Record<BillableEventKey, number>;
  /// Raw 18-decimal token amounts as strings — bigints don't survive JSON, and
  /// parsing them to Number would lose precision on the low end of a cheap token.
  pricesTokens: Record<BillableEventKey, string> | null;
  minDepositUsd: number;
  minDepositTokens: string | null;
  tokenPrice: { priceUsd: number; source: "twap" | "override"; at: string } | null;
  /// The billing contracts and, crucially, **the chain they live on**. Exactly
  /// one network sells credit at a time (`creditsNetworkFrom`), and the browser
  /// has to pin its `approve`/`deposit` to `chainId` rather than sending to
  /// whatever chain the wallet happens to be on — a call to an address with no
  /// code succeeds silently and spends the gas anyway.
  contracts: {
    punoToken: string | null;
    punoCredits: string | null;
    chainId: number | null;
    networkName: string | null;
    punoDecimals: number;
  };
  ledger: LedgerEntry[];
}

/// Shared by the console meter and the top-up card so both read one balance —
/// two independent fetches would visibly disagree for a few seconds after a
/// deposit lands.
export function useBalance() {
  const { address, isConnected } = useAccount();

  return useQuery({
    queryKey: ["balance", address],
    queryFn: () => fetchJson<BalanceResponse>("/api/billing/balance"),
    enabled: isConnected && !!address,
    retry: retryUnlessDenied,
    // Deposits are credited by an out-of-process watcher, so the page has no
    // event to react to — polling is what makes a top-up appear without a
    // manual refresh.
    refetchInterval: 15_000,
  });
}

/// Formats a raw token amount for display, without pulling in a bignum
/// library: whole tokens plus at most `maxFractionDigits`.
///
/// `decimals` is a parameter rather than a baked-in 18 because this was the
/// fifth and last place the token's scale was hardcoded. It defaults to 18 so
/// callers that genuinely cannot know it still render, but every caller here
/// passes the network's own `punoDecimals`.
export function formatTokens(raw: string | null, maxFractionDigits = 2, decimals = 18): string {
  if (raw === null) return "—";
  const value = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const frac = value % scale;
  if (frac === 0n || maxFractionDigits === 0) return whole.toLocaleString("en-US");
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString("en-US")}.${fracStr}` : whole.toLocaleString("en-US");
}
