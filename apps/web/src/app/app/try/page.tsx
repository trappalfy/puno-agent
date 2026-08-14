"use client";

import { useAccount } from "wagmi";
import { TrialConsole } from "@/components/terminal/TrialConsole";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";

/// The free tier's whole surface.
///
/// A wallet is the only thing asked of a visitor here — no vault, no faucet, no
/// deposit, no worker of their own. That is the point: everything between
/// "arrived" and "watched the agent think" is friction that loses the people
/// the free tier exists to convince.
export default function TryPage() {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
        <span className="h-2 w-2 rounded-full bg-lime-phosphor" aria-hidden />
        <h1 className="text-app-heading font-denim-ink font-semibold text-white">
          Connect a wallet to try the agent
        </h1>
        <p className="max-w-sm text-app-body text-white-muted">
          One free decision on testnet. Connecting only identifies you — nothing is deployed,
          nothing is spent, and you are not asked to sign a transaction.
        </p>
        <ConnectWalletButton />
      </div>
    );
  }

  return <TrialConsole />;
}
