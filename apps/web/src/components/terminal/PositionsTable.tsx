import { Card } from "../ui/Card";
import { PnlValue } from "../ui/PnlValue";
import { computePositionPnlUsd } from "@/lib/pnl";
import type { AgentDetail } from "@/lib/hooks/useAgentDetail";

/// DESIGN.md #1 — sticky header, zebra via row-hover, numeric columns
/// right-aligned in JetBrains Mono, horizontal scroll contained in the
/// table's own box.
export function PositionsTable({ positions }: { positions: AgentDetail["positions"] }) {
  if (positions.length === 0) {
    return (
      <Card>
        <p className="text-app-body-sm text-white-muted">No positions yet.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] border-collapse">
        <thead className="sticky top-0 bg-vault-floor">
          <tr className="border-b border-moss-border/40 text-num-xs uppercase text-white-faint font-jetbrains-mono">
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-left">Token</th>
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-right">Balance</th>
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-right">
              Value (USD)
            </th>
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-right">
              Entry price
            </th>
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-right">
              Unrealized P&amp;L
            </th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const pnl = computePositionPnlUsd(p);
            const human = Number(p.rawBalance) / 10 ** p.decimals;
            return (
              <tr key={p.id} className="border-b border-moss-border/20 hover:bg-row-hover">
                <td className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-app-body-sm font-semibold text-white">
                  {p.tokenSymbol}
                </td>
                <td className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-right text-num text-white font-jetbrains-mono tabular-nums">
                  {human.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </td>
                <td className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-right text-num text-white font-jetbrains-mono tabular-nums">
                  $
                  {Number(p.valueUsd).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-right text-num text-white-muted font-jetbrains-mono tabular-nums">
                  {p.entryPriceUsd ? `$${Number(p.entryPriceUsd).toFixed(2)}` : "—"}
                </td>
                <td className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-right">
                  {pnl !== null ? (
                    <PnlValue usd={pnl} size="num-sm" />
                  ) : (
                    <span className="text-white-faint">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
