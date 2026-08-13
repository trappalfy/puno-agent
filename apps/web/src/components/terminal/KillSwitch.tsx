"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { agentVaultAbi } from "@puno/shared";
import type { Address } from "viem";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Card } from "../ui/Card";

/// DESIGN.md #21 — the one place red is a large element. Reads `paused()`
/// live (never trusts a cached DB value for this) and calls the vault's own
/// `pause`/`unpause` directly — the same functions the plan's safety story
/// rests on (2.5 #4: "kill switch останавливает и контракт... и воркер").
/// Owner-only on-chain, so this renders nothing for anyone else.
export function KillSwitch({ vaultAddress }: { vaultAddress: Address }) {
  const { address } = useAccount();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: paused, refetch } = useReadContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "paused",
  });
  const { data: owner } = useReadContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "owner",
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  if (!address || !owner || address.toLowerCase() !== owner.toLowerCase()) return null;

  const isPaused = paused === true;

  return (
    <Card className="border border-signal-red/40">
      <h3 className="text-app-heading-sm font-denim-ink font-semibold text-white">Kill switch</h3>
      <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
        {isPaused
          ? "Trading is paused on-chain. The agent cannot call executeTrade until you resume."
          : "Immediately blocks executeTrade on this vault, on-chain — independent of whether the worker is running."}
      </p>
      <div className="mt-[var(--spacing-16)]">
        <Button variant={isPaused ? "primary" : "danger"} onClick={() => setConfirmOpen(true)}>
          {isPaused ? "Resume trading" : "Pause trading"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={isPaused ? "Resume trading?" : "Pause trading?"}
        body={
          isPaused
            ? "The agent will be able to execute trades again as soon as this confirms."
            : "This stops executeTrade on-chain immediately. You can resume at any time."
        }
        confirmLabel={isPaused ? "Resume trading" : "Pause trading"}
        danger={!isPaused}
        pending={isPending || isConfirming}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          writeContract(
            {
              address: vaultAddress,
              abi: agentVaultAbi,
              functionName: isPaused ? "unpause" : "pause",
            },
            {
              onSuccess: () => {
                setConfirmOpen(false);
                void refetch();
              },
            },
          );
        }}
      />
    </Card>
  );
}
