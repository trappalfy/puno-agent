"use client";

import type { Address } from "viem";
import { describeMarket } from "@puno/shared";
import { useMarketSession } from "@/lib/hooks/useMarketSession";

/// Says why the agent is quiet, in a sentence a person can act on.
///
/// Before this, a closed equity market surfaced as *"NAV unavailable — on-chain
/// nav() would currently revert"*: accurate, useless, and reading as a fault in
/// our software rather than a Saturday. Equity oracles on this chain only
/// publish during the US session (EQUITY-FEED-HOURS-2026-08-15.md), so an idle
/// agent is the normal overnight and weekend state, not a symptom.
///
/// Silent when the market is open. A banner that is always on screen is
/// furniture, and stops being read exactly when it matters.
export function MarketBanner({
  vaultAddress,
  quoteToken,
}: {
  vaultAddress: Address;
  quoteToken: string;
}) {
  const session = useMarketSession(vaultAddress, quoteToken);
  if (!session || session.state === "open") return null;

  // Amber, never red: none of these is an error. A closed market is a clock, a
  // dead feed is somebody else's outage, and an empty allowlist is a setting.
  // Red is reserved for loss and for the kill switch (DESIGN.md).
  return (
    <div className="rounded-[var(--radius-cards)] border border-signal-amber/60 bg-vault-floor p-[var(--layout-card-padding)]">
      <div className="flex flex-wrap items-baseline gap-[var(--spacing-12)]">
        <span className="text-num-xs uppercase text-signal-amber font-jetbrains-mono">
          {session.state === "closed"
            ? "Market closed"
            : session.state === "no-equities"
              ? "Nothing allowlisted"
              : "Prices incomplete"}
        </span>
      </div>
      <p className="mt-[var(--spacing-8)] max-w-2xl text-app-body text-white-muted">
        {describeMarket(session)}
      </p>
    </div>
  );
}
