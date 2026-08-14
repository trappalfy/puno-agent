"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { agentVaultAbi } from "@puno/shared";
import type { Address } from "viem";
import { Disclosure } from "../ui/Disclosure";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AddressChip } from "../ui/AddressChip";

function formatCountdown(expirySec: bigint): string {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (expirySec <= nowSec) return "Expired";
  const remaining = Number(expirySec - nowSec);
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const minutes = Math.floor((remaining % 3600) / 60);
  return `${hours}h ${minutes}m remaining`;
}

/// DESIGN.md #20 — the agent key's scope, a countdown to expiry, a revoke
/// action. Revoke calls the vault's own revokeAgent() (owner-only).
export function SessionKeyCard({
  vaultAddress,
  agentAddress,
  explorerBaseUrl,
}: {
  vaultAddress: Address;
  agentAddress: Address;
  explorerBaseUrl: string;
}) {
  const { address } = useAccount();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: owner } = useReadContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "owner",
  });
  const { data: expiry, refetch: refetchExpiry } = useReadContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "agentExpiry",
  });
  const { data: onChainAgent, refetch: refetchAgent } = useReadContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "agent",
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  const revoked = onChainAgent && onChainAgent === "0x0000000000000000000000000000000000000000";

  // The countdown is the whole point of this card, so it *is* the summary —
  // an expiring key is something a person should learn without opening
  // anything, and the address and revoke action can wait until they do.
  const expirySummary = revoked ? "revoked" : expiry !== undefined ? formatCountdown(expiry) : "…";

  return (
    <Disclosure title="Session key" summary={expirySummary}>
      <div className="flex flex-col gap-[var(--spacing-8)]">
        <div className="flex items-center justify-between">
          <span className="text-app-body-sm text-white-muted">Agent address</span>
          <AddressChip address={agentAddress} explorerBaseUrl={explorerBaseUrl} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-app-body-sm text-white-muted">Expiry</span>
          <span className="text-num-sm text-white font-jetbrains-mono">
            {revoked ? "Revoked" : expiry !== undefined ? formatCountdown(expiry) : "…"}
          </span>
        </div>
      </div>

      {isOwner && !revoked && (
        <div className="mt-[var(--spacing-16)]">
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Revoke key
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Revoke the agent key?"
        body="The agent will immediately lose the ability to propose trades on this vault. This cannot be undone — you'd need to arm a new key to resume."
        confirmLabel="Revoke key"
        danger
        pending={isPending || isConfirming}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          writeContract(
            { address: vaultAddress, abi: agentVaultAbi, functionName: "revokeAgent" },
            {
              onSuccess: () => {
                setConfirmOpen(false);
                void refetchExpiry();
                void refetchAgent();
              },
            },
          );
        }}
      />
    </Disclosure>
  );
}
