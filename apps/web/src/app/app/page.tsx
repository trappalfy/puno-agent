"use client";

import { useAgents } from "@/lib/hooks/useAgents";
import { AgentCard } from "@/components/terminal/AgentCard";
import { MetricTile } from "@/components/ui/MetricTile";
import { PnlValue } from "@/components/ui/PnlValue";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Card } from "@/components/ui/Card";
import { WalletGate } from "@/components/WalletGate";

/// The gate covers "connected" and "signed in" separately. Checking only the
/// first let a connected-but-unsigned visitor fall through to a fetch that
/// answered 401 instantly, which then retried and surfaced as "Couldn't load
/// your agents" — a wrong diagnosis delivered slowly.
export default function DashboardPage() {
  return (
    <WalletGate>
      <Dashboard />
    </WalletGate>
  );
}

function Dashboard() {
  const { data, isLoading, isError } = useAgents();

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
    return (
      <p className="text-app-body text-signal-red">Couldn&apos;t load your agents. Try again.</p>
    );
  }

  // The trial agent runs on the *shared* demo vault. Folding it into these
  // totals told a user who had done nothing but press the free-run button that
  // they held a NAV and a P&L — someone else's, on a vault they cannot
  // withdraw from. A portfolio total has to mean the money that is actually
  // theirs, so the split happens before any arithmetic.
  const live = data.agents.filter((a) => a.kind !== "trial");
  const trials = data.agents.filter((a) => a.kind === "trial");

  const totalNav = live.reduce((sum, a) => sum + a.navUsd, 0);
  const totalPnl = live.reduce((sum, a) => sum + a.pnlUsd, 0);

  if (live.length === 0 && trials.length === 0) {
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
      {live.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-3">
            <MetricTile
              label="Total NAV"
              value={`$${totalNav.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <MetricTile label="Unrealized P&L" value={<PnlValue usd={totalPnl} size="num-lg" />} />
            <MetricTile label="Agents" value={String(live.length)} />
          </div>

          <div>
            <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">Agents</h2>
            <div className="mt-[var(--layout-element-gap)] grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-2 xl:grid-cols-3">
              {live.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
        </>
      )}

      {trials.length > 0 && (
        <div>
          <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">Free run</h2>
          <div className="mt-[var(--layout-element-gap)] grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-2 xl:grid-cols-3">
            {trials.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>
      )}

      {live.length === 0 && (
        <Card>
          <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">
            Nothing of yours is trading yet
          </h2>
          <p className="mt-[var(--spacing-8)] max-w-xl text-app-body text-white-muted">
            The run above happened on our demo vault. Create your own and the agent works on real
            prices, inside limits you set on-chain, with only your wallet able to withdraw.
          </p>
          <div className="mt-[var(--spacing-24)]">
            <ButtonLink href="/app/agents/new">Create an agent</ButtonLink>
          </div>
        </Card>
      )}
    </div>
  );
}
