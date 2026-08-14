"use client";

import { TrialConsole } from "@/components/terminal/TrialConsole";
import { WalletGate } from "@/components/WalletGate";

/// The free tier's whole surface.
///
/// A wallet is the only thing asked of a visitor here — no vault, no faucet, no
/// deposit, no worker of their own. That is the point: everything between
/// "arrived" and "watched the agent think" is friction that loses the people
/// the free tier exists to convince.
///
/// The gate covers both halves of "has a wallet": connected, and proven by
/// signature. Checking only the first sent people into a fetch that answered
/// 401 and surfaced as a generic failure.
export default function TryPage() {
  return (
    <WalletGate>
      <TrialConsole />
    </WalletGate>
  );
}
