"use client";

import { useAccount } from "wagmi";
import { useAgents } from "@/lib/hooks/useAgents";
import { AgentCard } from "@/components/terminal/AgentCard";
import { MetricTile } from "@/components/ui/MetricTile";
import { PnlValue } from "@/components/ui/PnlValue";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const { data, isLoading, isError } = useAgents();

  if (!isConnected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
        <span className="h-2 w-2 rounded-full bg-lime-phosphor" aria-hidden />
        <h1 className="text-app-heading font-denim-ink font-semibold text-white">
          Connect a wallet to see your agents
        </h1>
        <p className="max-w-sm text-app-body text-white-muted">
          Every vault is scoped to its owner's wallet — connect to view or create one.
        </p>
        <ConnectWalletButton />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-[var(--radius-cards)] bg-vault-floor"
          />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-app-body text-signal-red">Couldn't load your agents. Try again.</p>;
  }

  const totalNav = data.agents.reduce((sum, a) => sum + a.navUsd, 0);
  const totalPnl = data.agents.reduce((sum, a) => sum + a.pnlUsd, 0);

  if (data.agents.length === 0) {
    // The free run leads, and creating a vault is the secondary action.
    // Sending someone who has never seen the agent work straight into four
    // signed transactions and a funding step asks them to pay in effort before
    // they have any reason to.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
        <span className="h-2 w-2 rounded-full bg-lime-phosphor" aria-hidden />
        <h1 className="text-app-heading font-denim-ink font-semibold text-white">No agents yet</h1>
        <p className="max-w-sm text-app-body text-white-muted">
          Watch the agent make one real decision first — free, on testnet, with nothing to deploy.
          Then create a vault of your own and set its limits.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-[var(--spacing-12)]">
          <ButtonLink href="/app/try">Try the agent free</ButtonLink>
          <ButtonLink href="/app/agents/new" variant="ghost">
            Create an agent
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--layout-section-gap)]">
      <div className="grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-3">
        <MetricTile
          label="Total NAV"
          value={`$${totalNav.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <MetricTile label="Unrealized P&L" value={<PnlValue usd={totalPnl} size="num-lg" />} />
        <MetricTile label="Agents" value={String(data.agents.length)} />
      </div>

      <div>
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">Agents</h2>
        <div className="mt-[var(--layout-element-gap)] grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-2 xl:grid-cols-3">
          {data.agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  );
}
