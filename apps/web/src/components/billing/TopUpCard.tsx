"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  erc20Abi,
  punoCreditsAbi,
  usdToTokens,
  formatTokensCompact,
  creditsNetwork,
  TOP_UP_PRESETS_USD,
} from "@puno/shared";
import type { Address } from "viem";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { RequireNetwork } from "../terminal/RequireNetwork";
import { useBalance, formatTokens } from "@/lib/hooks/useBalance";

// Shared with `set-rate`'s preview, which shows what a proposed PUNO rate turns
// these into. Previously a local `[5, 20, 50]`; the 5 silently duplicated
// MIN_DEPOSIT_USD and would have drifted from it.
const PRESETS_USD = TOP_UP_PRESETS_USD;

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
  // The chain those addresses live on. Every read and write below is pinned to
  // it rather than inheriting the wallet's chain: an `approve` sent to the other
  // network hits an address with no code, which **succeeds silently** and spends
  // the gas, and at a colliding address (same deployer, same nonce, different
  // chain — the collision this repo already documents) the selector lands on
  // some other contract entirely.
  const chainId = balance?.contracts.chainId ?? undefined;
  const configured = !!punoToken && !!punoCredits && chainId !== undefined;
  // Same selection the API made, resolved locally because `RequireNetwork`
  // names a network rather than a chain id. Falls back to the free tier's
  // network only to satisfy the type when nothing sells credit — in that case
  // the card has already returned the "PUNO hasn't launched" branch above.
  const creditsNetworkKey = creditsNetwork()?.key ?? "testnet";
  const rate = balance?.tokenPrice?.priceUsd ?? null;
  const decimals = balance?.contracts.punoDecimals ?? 18;

  // A rate can be fresh enough to *show* and too old to *charge against* — the
  // display and crediting windows differ deliberately (token-price.ts). This
  // card is the one place where the difference has to be honoured rather than
  // rendered: "send 5,000 PUNO for $5" is a transaction instruction, not a
  // price label, and a deposit is valued at whatever rate is current when the
  // indexer finally processes it. Quoting an amount off a rate we have already
  // decided not to bill at would be a promise we cannot keep.
  const rateTooStaleToCharge = balance?.tokenPrice?.usableForCredit === false;

  // The shared helper, not a copy of it. This used to be an inline
  // `BigInt(Math.ceil((usd / rate) * 1e6)) * 10n ** 12n`, which hardcoded 18
  // decimals and dropped the round-up correction `usdToTokens` applies on its
  // last line — so the card could quote a hair under the minimum and the deposit
  // would revert with "below minimum" on the final wei. The comment here claimed
  // it was "derived from the same helper the API uses"; it was not.
  const amountRaw =
    rate && rate > 0 && !rateTooStaleToCharge ? usdToTokens(selectedUsd, rate, decimals) : null;

  /// A preset's PUNO amount, shortened for the chip. Null when there is no
  /// usable rate, in which case the chips fall back to dollars — a preset the
  /// user cannot read is worse than one in the wrong unit, and the pay button
  /// is already disabled in that state.
  const presetTokens = (usd: number): string | null =>
    rate && rate > 0 && !rateTooStaleToCharge
      ? formatTokensCompact(usdToTokens(usd, rate, decimals), decimals)
      : null;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: punoToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && punoCredits ? [address, punoCredits] : undefined,
    chainId,
    query: { enabled: configured && !!address },
  });

  const { data: tokenBalance } = useReadContract({
    address: punoToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: configured && !!address },
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId,
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
            // min-h is --min-tap-target: 12px mono on 8px padding landed at
            // ~30px, just under the floor the design system declares.
            className={`inline-flex min-h-[var(--min-tap-target)] flex-1 items-center justify-center rounded-[var(--radius-tags)] border px-[var(--spacing-12)] py-[var(--spacing-8)] text-num-sm font-jetbrains-mono tabular-nums transition-colors ${
              selectedUsd === usd
                ? "border-lime-phosphor text-lime-phosphor"
                : "border-white/25 text-white-muted hover:border-white/50"
            }`}
          >
            {/* Compact, because quoting in PUNO made these long in a way
                dollars never were: "$50" became "125,000" at the launch rate,
                and three of those side by side is the button overflow this UI
                was already fixed for once. The exact figure is on the "You
                send" row below, which has a whole line to itself. */}
            {presetTokens(usd) ?? `$${usd}`}
          </button>
        ))}
      </div>

      <div className="mt-[var(--spacing-16)] flex items-baseline justify-between">
        <span className="text-app-body-sm text-white-muted">You send</span>
        <span className="text-num-sm text-white font-jetbrains-mono tabular-nums">
          {amountRaw !== null
            ? `${formatTokens(amountRaw.toString(), 4, decimals)} PUNO`
            : "rate unavailable"}
        </span>
      </div>
      {tokenBalance !== undefined && (
        <div className="mt-[var(--spacing-4)] flex items-baseline justify-between">
          <span className="text-num-xs text-white-faint font-jetbrains-mono">Wallet</span>
          <span className="text-num-xs text-white-faint font-jetbrains-mono tabular-nums">
            {formatTokens((tokenBalance as bigint).toString(), 2, decimals)} PUNO
          </span>
        </div>
      )}

      {/* Says what is actually wrong. "Rate unavailable" alone reads as a bug
          on our side that might clear on refresh; this is a deliberate refusal
          with a known remedy, and the money is better left in the wallet until
          it clears. */}
      {rateTooStaleToCharge && (
        <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">
          The PUNO rate is too old to charge against, so we won&rsquo;t quote an amount to send
          right now — a deposit would be credited at whatever rate is current when it lands, not the
          one shown here. It usually clears within a few hours.
        </p>
      )}

      {/* The two writes below are the only place in this app where being on the
          wrong chain costs money rather than causing confusion, and this card
          was never behind the old global guard — it renders on /pricing, outside
          /app/*. `approve` sent to the other network lands on an address with no
          code, which succeeds silently and spends the gas; at a colliding
          address (same deployer, same nonce, different chain) the selector hits
          some other contract entirely.

          Inline and around the action only: the reads above are pinned to
          `chainId` and are correct whatever the wallet is on, so there is no
          reason to blank the prices and the balance too. */}
      <div className="mt-[var(--spacing-16)]">
        <RequireNetwork network={creditsNetworkKey} variant="inline">
          <Button
            variant="primary"
            className="w-full"
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
                    chainId,
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
                  chainId,
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
            {/* Both labels named dollars for an amount the wallet will prompt
                for in PUNO — "Approve 5 USD of PUNO" asked the user to
                reconcile two units mid-transaction. Compact, because the
                button is one line and 125,000 is not the part that needs to
                be exact here; the full figure is on the "You send" row. */}
            {busy
              ? "Confirming…"
              : insufficientTokens
                ? "Not enough PUNO"
                : amountRaw === null
                  ? "Rate unavailable"
                  : needsApproval
                    ? `Approve ${formatTokensCompact(amountRaw, decimals)} PUNO`
                    : `Pay ${formatTokensCompact(amountRaw, decimals)} PUNO`}
          </Button>
        </RequireNetwork>
      </div>

      {status && (
        <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">{status}</p>
      )}
    </Card>
  );
}
