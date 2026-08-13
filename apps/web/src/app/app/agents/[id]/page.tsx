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
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { KillSwitch } from "@/components/terminal/KillSwitch";
import { SessionKeyCard } from "@/components/terminal/SessionKeyCard";
import { RiskLimitsPanel } from "@/components/terminal/RiskLimitsPanel";
import { PositionsTable } from "@/components/terminal/PositionsTable";
import { TradesTable } from "@/components/terminal/TradesTable";
import { ReasoningCard } from "@/components/terminal/ReasoningCard";
import { sumPositionsPnlUsd } from "@/lib/pnl";

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
      </div>

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

      <div className="grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-2">
        <KillSwitch vaultAddress={vault.address as Address} />
        <SessionKeyCard
          vaultAddress={vault.address as Address}
          agentAddress={agent.agentAddress as Address}
          explorerBaseUrl={explorerBaseUrl}
        />
      </div>

      <RiskLimitsPanel vaultAddress={vault.address as Address} offChainLimits={limits} />

      <div>
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">Positions</h2>
        <div className="mt-[var(--layout-element-gap)]">
          <PositionsTable positions={positions} />
        </div>
      </div>

      <div>
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">
          Reasoning — accepted and rejected alike
        </h2>
        <div className="mt-[var(--layout-element-gap)] flex flex-col gap-[var(--layout-element-gap)]">
          {signals.length === 0 ? (
            <p className="text-app-body-sm text-white-muted">No signals yet.</p>
          ) : (
            signals.map((signal) => <ReasoningCard key={signal.id} signal={signal} />)
          )}
        </div>
      </div>

      <div>
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">
          Trade history
        </h2>
        <div className="mt-[var(--layout-element-gap)]">
          <TradesTable trades={trades} explorerBaseUrl={explorerBaseUrl} />
        </div>
      </div>
    </div>
  );
}
