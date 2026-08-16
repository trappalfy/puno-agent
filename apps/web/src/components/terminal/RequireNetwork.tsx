"use client";

import type { ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import type { NetworkKey } from "@puno/shared";
import { networkGuardVerdict } from "@/lib/networkGuard";
import { Button } from "../ui/Button";

/**
 * Blocks a subtree until the wallet is on the chain that subtree acts on.
 *
 * Replaces `NetworkGuard`, which wrapped **all** of `/app/*` and compared
 * against one hardcoded network. That shape stopped being possible the moment
 * the product spanned two chains at once: the free tier lives on testnet
 * permanently while paid agents trade on mainnet, so the same account
 * legitimately holds both, and a global gate would hide half of someone's
 * agents on account of the other half.
 *
 * The requirement is therefore declared per surface, next to the thing that
 * needs it, and most surfaces need nothing — the dashboard makes no contract
 * calls, and every read elsewhere is pinned to an explicit `chainId` and
 * resolves over that chain's own transport whatever the wallet is doing. What
 * genuinely needs a gate is a **write**, because a write follows the wallet.
 *
 * `variant="inline"` replaces a single control; `"page"` replaces a whole view.
 */
export function RequireNetwork({
  network,
  variant = "page",
  children,
}: {
  network: NetworkKey;
  variant?: "page" | "inline" | undefined;
  children: ReactNode;
}) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, error } = useSwitchChain();

  const verdict = networkGuardVerdict({
    required: network,
    isConnected,
    walletChainId: chainId,
  });

  if (verdict.state === "ok") return <>{children}</>;

  const action = (
    <Button onClick={() => switchChain({ chainId: verdict.requiredChainId })}>
      Switch to {verdict.requiredName}
    </Button>
  );

  // Surfaced rather than swallowed. A wallet that does not have Robinhood Chain
  // added rejects the request, and the old guard rendered nothing at all for
  // that — a button that visibly did nothing, which is the worst state to leave
  // someone in at the moment they are trying to fix a network problem.
  const failure = error ? (
    <p className="text-app-body-sm text-signal-red">{error.message}</p>
  ) : null;

  if (variant === "inline") {
    return (
      <div className="flex flex-col items-start gap-[var(--spacing-8)]">
        <span className="text-app-body-sm text-white-muted">
          On {verdict.walletLabel} — this needs {verdict.requiredName}.
        </span>
        {action}
        {failure}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
      <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">Wrong network</h2>
      {/* Names both sides. The old copy could only name ours, because the badge
          it used renders exactly two chains — so a wallet on Ethereum was told
          to switch without being told what it was switching from. */}
      <p className="max-w-sm text-app-body text-white-muted">
        Your wallet is on {verdict.walletLabel}. This runs on {verdict.requiredName} (chain{" "}
        {verdict.requiredChainId}).
      </p>
      {action}
      {failure}
    </div>
  );
}
