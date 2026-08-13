"use client";

import type { ReactNode } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { getNetwork } from "@puno/shared";
import { NetworkBadge } from "../ui/NetworkBadge";

const EXPECTED = getNetwork("testnet"); // testnet-only until a separate mainnet decision (plan 2.5 #1)

/// DESIGN.md Layout: "при неверной сети интерфейс данных заблокирован" — on
/// the wrong chain, the data interface itself is blocked, not just warned
/// about, since every read/write on this page targets a specific chain ID.
export function NetworkGuard({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) return <>{children}</>;

  if (chainId !== EXPECTED.chainId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
        <NetworkBadge
          network="testnet"
          wrongNetwork
          onSwitch={() => switchChain({ chainId: EXPECTED.chainId })}
        />
        <h1 className="text-app-heading font-denim-ink font-semibold text-white">Wrong network</h1>
        <p className="max-w-sm text-app-body text-white-muted">
          Your wallet is connected to a different chain. Switch to {EXPECTED.name} (chain{" "}
          {EXPECTED.chainId}) to see your agents.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
