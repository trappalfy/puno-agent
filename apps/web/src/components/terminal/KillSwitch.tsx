"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { agentVaultAbi } from "@puno/shared";
import type { Address } from "viem";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/// DESIGN.md #21 — the one place red is a large element. Reads `paused()`
/// live (never trusts a cached DB value for this) and calls the vault's own
/// `pause`/`unpause` directly — the same functions the plan's safety story
/// rests on (2.5 #4: "kill switch останавливает и контракт... и воркер").
/// Owner-only on-chain, so this renders nothing for anyone else.
///
/// Renders inline in the page header rather than as a card in the body, and
/// it is the one thing on this page that is deliberately *not* collapsed. The
/// density pass folded everything else away; a stop control behind a
/// disclosure triangle would be a worse product than a cluttered one. The
/// explanation this used to carry as body prose now lives in the confirmation
/// dialog, which is where someone actually needs to read it.
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
    <div className="flex items-center gap-[var(--spacing-12)]">
      {/* Paused is a state someone must not be able to miss, and DESIGN.md's
          accessibility rule forbids leaving it to colour — so it is a labelled
          chip, not a red tint on the button. */}
      {isPaused && (
        <span className="rounded-[var(--radius-tags)] border border-signal-red px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm text-signal-red font-jetbrains-mono">
          Paused on-chain
        </span>
      )}
      <Button variant={isPaused ? "primary" : "danger"} onClick={() => setConfirmOpen(true)}>
        {isPaused ? "Resume trading" : "Pause trading"}
      </Button>

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
    </div>
  );
}
