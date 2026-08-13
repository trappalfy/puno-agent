import Link from "next/link";
import { Card } from "../ui/Card";
import { StatusDot, type AgentStatus } from "../ui/StatusDot";
import { PnlValue } from "../ui/PnlValue";
import { NetworkBadge } from "../ui/NetworkBadge";
import type { AgentListItem } from "@/lib/hooks/useAgents";

/// DESIGN.md #14, trimmed: Pause/Kill live on the detail page (the one place
/// that also has the session-key/vault context they need), not duplicated
/// here — this card is a summary + link, not a second place to take action.
export function AgentCard({ agent }: { agent: AgentListItem }) {
  return (
    <Link href={`/app/agents/${agent.id}`}>
      <Card className="transition-colors hover:bg-canopy-mid">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-app-heading-sm font-denim-ink font-semibold text-white">
              {agent.name}
            </div>
            <div className="mt-[var(--spacing-8)] flex items-center gap-[var(--spacing-12)]">
              <StatusDot status={agent.status as AgentStatus} />
              <NetworkBadge network={agent.network} />
              {agent.dryRun && (
                <span className="text-num-sm text-white-faint font-jetbrains-mono">DRY RUN</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-[var(--spacing-24)] grid grid-cols-2 gap-[var(--spacing-16)]">
          <div>
            <div className="text-num-xs uppercase text-white-faint font-jetbrains-mono">
              Vault NAV
            </div>
            <div className="mt-[var(--spacing-4)] text-num text-white font-jetbrains-mono tabular-nums">
              $
              {agent.navUsd.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div>
            <div className="text-num-xs uppercase text-white-faint font-jetbrains-mono">
              Unrealized P&amp;L
            </div>
            <div className="mt-[var(--spacing-4)]">
              <PnlValue usd={agent.pnlUsd} size="num" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
