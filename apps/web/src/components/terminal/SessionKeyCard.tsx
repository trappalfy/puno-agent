"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { agentVaultAbi, type NetworkKey } from "@puno/shared";
import type { Address } from "viem";
import { Disclosure } from "../ui/Disclosure";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AddressChip } from "../ui/AddressChip";
import { RequireNetwork } from "./RequireNetwork";

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
/// `chainId` is the vault's chain — see KillSwitch for why it is required. The
/// expiry countdown is the reason it matters here specifically: read against the
/// wrong chain it would show a confident number belonging to a different
/// contract, and the card's whole job is to say when this key stops working.
export function SessionKeyCard({
  vaultAddress,
  agentAddress,
  explorerBaseUrl,
  chainId,
  network,
}: {
  vaultAddress: Address;
  agentAddress: Address;
  explorerBaseUrl: string;
  chainId: number;
  network: NetworkKey;
}) {
  const { address } = useAccount();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: owner } = useReadContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "owner",
    chainId,
  });
  const { data: expiry, refetch: refetchExpiry } = useReadContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "agentExpiry",
    chainId,
  });
  const { data: onChainAgent, refetch: refetchAgent } = useReadContract({
    address: vaultAddress,
    abi: agentVaultAbi,
    functionName: "agent",
    chainId,
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId,
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
          {/* The expiry and the addresses above stay readable on any chain —
              they are pinned reads. Only revoking needs the wallet to be on the
              vault's network, because only revoking is a transaction. */}
          <RequireNetwork network={network} variant="inline">
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Revoke key
            </Button>
          </RequireNetwork>
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
            { address: vaultAddress, abi: agentVaultAbi, functionName: "revokeAgent", chainId },
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
