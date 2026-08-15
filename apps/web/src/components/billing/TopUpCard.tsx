"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, punoCreditsAbi } from "@puno/shared";
import type { Address } from "viem";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { useBalance, formatTokens } from "@/lib/hooks/useBalance";

const PRESETS_USD = [5, 20, 50];

/// Top-up is two transactions — approve, then deposit — and the card says so
/// up front rather than surprising someone with a second wallet prompt halfway
/// through. `approve` is scoped to the exact amount, not unlimited: this
/// contract only ever needs to pull what is being deposited right now.
export function TopUpCard() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const { data: balance } = useBalance();
  const [selectedUsd, setSelectedUsd] = useState(PRESETS_USD[0]!);
  const [status, setStatus] = useState<string | null>(null);

  const punoToken = balance?.contracts.punoToken as Address | undefined;
  const punoCredits = balance?.contracts.punoCredits as Address | undefined;
  const configured = !!punoToken && !!punoCredits;
  const rate = balance?.tokenPrice?.priceUsd ?? null;

  // Derived from the same USD→token helper the API uses, so what the button
  // sends always matches what the page quoted.
  const amountRaw =
    rate && rate > 0 ? BigInt(Math.ceil((selectedUsd / rate) * 1e6)) * 10n ** 12n : null;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: punoToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && punoCredits ? [address, punoCredits] : undefined,
    query: { enabled: configured && !!address },
  });

  const { data: tokenBalance } = useReadContract({
    address: punoToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: configured && !!address },
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  const needsApproval =
    amountRaw !== null && allowance !== undefined && (allowance as bigint) < amountRaw;
  const insufficientTokens =
    amountRaw !== null && tokenBalance !== undefined && (tokenBalance as bigint) < amountRaw;
  const busy = isPending || isConfirming;

  if (!configured) {
    return (
      <Card>
        <h3 className="text-app-heading-sm font-denim-ink font-semibold text-white">Top up</h3>
        <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
          PUNO hasn&rsquo;t launched yet, so there&rsquo;s nothing to pay with. Every new account
          starts with a small credit — enough to watch the agent reason a few times.
        </p>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card>
        <h3 className="text-app-heading-sm font-denim-ink font-semibold text-white">Top up</h3>
        <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
          Connect a wallet to add credit.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-app-heading-sm font-denim-ink font-semibold text-white">Top up</h3>
      <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
        Send PUNO, get credit. Two wallet prompts: one to approve the amount, one to pay.
      </p>

      <div className="mt-[var(--spacing-16)] flex gap-[var(--spacing-8)]">
        {PRESETS_USD.map((usd) => (
          <button
            key={usd}
            type="button"
            onClick={() => setSelectedUsd(usd)}
            className={`flex-1 rounded-[var(--radius-tags)] border px-[var(--spacing-12)] py-[var(--spacing-8)] text-num-sm font-jetbrains-mono tabular-nums transition-colors ${
              selectedUsd === usd
                ? "border-lime-phosphor text-lime-phosphor"
                : "border-white/25 text-white-muted hover:border-white/50"
            }`}
          >
            ${usd}
          </button>
        ))}
      </div>

      <div className="mt-[var(--spacing-16)] flex items-baseline justify-between">
        <span className="text-app-body-sm text-white-muted">You send</span>
        <span className="text-num-sm text-white font-jetbrains-mono tabular-nums">
          {amountRaw !== null
            ? `${formatTokens(amountRaw.toString(), 4)} PUNO`
            : "rate unavailable"}
        </span>
      </div>
      {tokenBalance !== undefined && (
        <div className="mt-[var(--spacing-4)] flex items-baseline justify-between">
          <span className="text-num-xs text-white-faint font-jetbrains-mono">Wallet</span>
          <span className="text-num-xs text-white-faint font-jetbrains-mono tabular-nums">
            {formatTokens((tokenBalance as bigint).toString(), 2)} PUNO
          </span>
        </div>
      )}

      <Button
        variant="primary"
        className="mt-[var(--spacing-16)] w-full"
        disabled={busy || amountRaw === null || insufficientTokens}
        onClick={() => {
          if (amountRaw === null) return;
          setStatus(null);

          if (needsApproval) {
            writeContract(
              {
                address: punoToken,
                abi: erc20Abi,
                functionName: "approve",
                args: [punoCredits, amountRaw],
              },
              {
                onSuccess: () => {
                  setStatus("Approved. Confirm the payment to finish.");
                  void refetchAllowance();
                  reset();
                },
                onError: (err) => setStatus(err.message),
              },
            );
            return;
          }

          writeContract(
            {
              address: punoCredits,
              abi: punoCreditsAbi,
              functionName: "deposit",
              args: [amountRaw],
            },
            {
              onSuccess: async (hash) => {
                setStatus("Payment sent — crediting…");
                // The watcher would pick this up within a few seconds anyway;
                // claiming directly just makes the balance appear now instead
                // of on the next poll. Crediting is idempotent, so both paths
                // running is harmless.
                const res = await fetch("/api/billing/claim", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ txHash: hash }),
                });
                const json = await res.json();
                setStatus(res.ok ? "Credit added." : (json.error ?? "Couldn't credit yet."));
                void queryClient.invalidateQueries({ queryKey: ["balance", address] });
                void refetchAllowance();
              },
              onError: (err) => setStatus(err.message),
            },
          );
        }}
      >
        {busy
          ? "Confirming…"
          : insufficientTokens
            ? "Not enough PUNO"
            : needsApproval
              ? `Approve ${selectedUsd} USD of PUNO`
              : `Pay $${selectedUsd}`}
      </Button>

      {status && (
        <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">{status}</p>
      )}
    </Card>
  );
}
