"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchJson, retryUnlessUnauthorized } from "./fetchJson";

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
  contracts: { punoToken: string | null; punoCredits: string | null };
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
    retry: retryUnlessUnauthorized,
    // Deposits are credited by an out-of-process watcher, so the page has no
    // event to react to — polling is what makes a top-up appear without a
    // manual refresh.
    refetchInterval: 15_000,
  });
}

/// Formats a raw 18-decimal token amount for display, without pulling in a
/// bignum library: whole tokens plus at most `maxFractionDigits`.
export function formatTokens(raw: string | null, maxFractionDigits = 2): string {
  if (raw === null) return "—";
  const value = BigInt(raw);
  const scale = 10n ** 18n;
  const whole = value / scale;
  const frac = value % scale;
  if (frac === 0n || maxFractionDigits === 0) return whole.toLocaleString("en-US");
  const fracStr = frac.toString().padStart(18, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString("en-US")}.${fracStr}` : whole.toLocaleString("en-US");
}
