"use client";

import { use } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { getNetwork } from "@puno/shared";
import { useAgentDetail } from "@/lib/hooks/useAgentDetail";
import { StatusDot, type AgentStatus } from "@/components/ui/StatusDot";
import { NetworkBadge } from "@/components/ui/NetworkBadge";
import { AddressChip } from "@/components/ui/AddressChip";
import { MetricTile } from "@/components/ui/MetricTile";
import { PnlValue } from "@/components/ui/PnlValue";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Disclosure } from "@/components/ui/Disclosure";
import { ForbiddenError } from "@/lib/hooks/fetchJson";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { KillSwitch } from "@/components/terminal/KillSwitch";
import { MarketBanner } from "@/components/terminal/MarketBanner";
import { SessionKeyCard } from "@/components/terminal/SessionKeyCard";
import { RiskLimitsPanel } from "@/components/terminal/RiskLimitsPanel";
import { PositionsTable } from "@/components/terminal/PositionsTable";
import { TradesTable } from "@/components/terminal/TradesTable";
import { LatestDecision, ReasoningHistory } from "@/components/terminal/ReasoningCard";
import { sumPositionsPnlUsd } from "@/lib/pnl";

/// Sequenced verdict-first — see UI-DENSITY-2026-08-14.md.
///
/// This page used to render seven expanded sections at once: ~30 fixed data
/// points, ten risk-limit rows and every signal ever recorded, none of them
/// carrying more weight than any other. The question someone actually opens an
/// agent to answer — what did it just decide, and why — was the furthest thing
/// down the page, below the limits and the positions table.
///
/// Now: status and the stop control in the header, three numbers, the latest
/// decision in full, and everything else behind a summary line worth reading
/// on its own.
export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isConnected } = useAccount();
  const { data, isLoading, isError, error } = useAgentDetail(id);

  if (!isConnected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
        <h1 className="text-app-heading font-denim-ink font-semibold text-white">
          Connect a wallet to view this agent
        </h1>
        <ConnectWalletButton />
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-[var(--radius-cards)] bg-vault-floor" />;
  }

  // A 403 here means the vault is not this account's — the trial agent, an old
  // bookmark, someone else's id. It is a different sentence from a failure, and
  // it needs somewhere to go: the one agent a person can hold without owning
  // its vault is the trial one, and its results live in the console.
  if (error instanceof ForbiddenError) {
    return (
      <Card>
        <h1 className="text-app-heading-sm font-denim-ink font-semibold text-white">
          This agent&apos;s vault isn&apos;t yours
        </h1>
        <p className="mt-[var(--spacing-8)] max-w-xl text-app-body text-white-muted">
          Free runs happen on our shared demo vault, so there is no position or key here to show
          you. Your run and what the agent decided are in the trial console.
        </p>
        <div className="mt-[var(--spacing-24)] flex flex-wrap gap-[var(--spacing-12)]">
          <ButtonLink href="/app/try">Open the trial console</ButtonLink>
          <ButtonLink href="/app" variant="ghost">
            Back to agents
          </ButtonLink>
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-app-body text-signal-red">
        {(error as Error | undefined)?.message ?? "Couldn't load this agent."}
      </p>
    );
  }

  const { agent, vault, limits, positions, trades, signals, navUsd } = data;
  const pnlUsd = sumPositionsPnlUsd(positions);
  const explorerBaseUrl = getNetwork(vault.network).explorerUrl;

  // Newest first — the API orders by createdAt desc.
  const [latest, ...earlier] = signals;
  const positionsValueUsd = positions.reduce((sum, p) => sum + Number(p.valueUsd), 0);
  const confirmedTrades = trades.filter((t) => t.status === "confirmed").length;

  return (
    <div className="flex flex-col gap-[var(--layout-section-gap)]">
      <div className="flex flex-wrap items-start justify-between gap-[var(--spacing-16)]">
        <div>
          <div className="flex items-center gap-[var(--spacing-16)]">
            <h1 className="text-app-heading font-denim-ink font-semibold text-white">
              {agent.name}
            </h1>
            <StatusDot status={agent.status as AgentStatus} />
            <NetworkBadge network={vault.network} />
          </div>
          <div className="mt-[var(--spacing-8)] flex items-center gap-[var(--spacing-16)]">
            <span className="text-app-body-sm text-white-muted">Vault</span>
            <AddressChip address={vault.address} explorerBaseUrl={explorerBaseUrl} />
          </div>
        </div>
        <KillSwitch vaultAddress={vault.address as Address} />
      </div>

      {/* Above the numbers, because "why is nothing happening" outranks every
          figure on this page when the answer is "it is Saturday". */}
      <MarketBanner vaultAddress={vault.address as Address} quoteToken={vault.quoteToken} />

      <div className="grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-3">
        <MetricTile
          label="NAV"
          value={`$${navUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <MetricTile label="Unrealized P&L" value={<PnlValue usd={pnlUsd} size="num-lg" />} />
        <MetricTile
          label="Last tick"
          value={agent.lastTickAt ? new Date(agent.lastTickAt).toLocaleTimeString() : "Never"}
        />
      </div>

      {latest ? (
        <LatestDecision signal={latest} />
      ) : (
        <Card>
          <p className="text-app-body-sm text-white-muted">
            No decisions yet. The agent posts one here the first time a tick escalates.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-[var(--layout-element-gap)]">
        {earlier.length > 0 && (
          <Disclosure title="Earlier decisions" summary={`${earlier.length} earlier`}>
            <ReasoningHistory signals={earlier} />
          </Disclosure>
        )}

        <Disclosure
          title="Positions"
          summary={`${positions.length} · $${positionsValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        >
          <PositionsTable positions={positions} />
        </Disclosure>

        <Disclosure
          title="Trade history"
          summary={trades.length === 0 ? "none" : `${trades.length} · ${confirmedTrades} confirmed`}
        >
          <TradesTable trades={trades} explorerBaseUrl={explorerBaseUrl} />
        </Disclosure>

        <RiskLimitsPanel vaultAddress={vault.address as Address} offChainLimits={limits} />

        <SessionKeyCard
          vaultAddress={vault.address as Address}
          agentAddress={agent.agentAddress as Address}
          explorerBaseUrl={explorerBaseUrl}
        />
      </div>
    </div>
  );
}
