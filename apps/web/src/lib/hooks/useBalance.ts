"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { formatTokens as sharedFormatTokens } from "@puno/shared";
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
  /// `usableForCredit` is false when the rate is fresh enough to show but too
  /// old for the indexer to credit a deposit at. The card must not quote an
  /// amount to send in that state — the deposit would be valued at whatever
  /// rate is current when it is finally processed, not at the one on screen.
  tokenPrice: {
    priceUsd: number;
    source: "twap" | "override";
    at: string;
    usableForCredit: boolean;
  } | null;
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

/// Adapter over the shared formatter: the API sends raw amounts as strings
/// (bigints don't survive JSON) and null when there is no rate, so every call
/// site here would otherwise repeat the same two checks.
///
/// The formatting itself moved to `@puno/shared` when the marketing site
/// started quoting PUNO too — one implementation, so two pages describing the
/// same price cannot render it differently.
export function formatTokens(raw: string | null, maxFractionDigits = 2, decimals = 18): string {
  if (raw === null) return "—";
  return sharedFormatTokens(BigInt(raw), decimals, maxFractionDigits);
}
