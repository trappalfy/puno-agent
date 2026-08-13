import { Card } from "../ui/Card";
import { TxStatusPill } from "../ui/TxStatusPill";
import { AddressChip } from "../ui/AddressChip";
import type { AgentDetail } from "@/lib/hooks/useAgentDetail";

export function TradesTable({
  trades,
  explorerBaseUrl,
}: {
  trades: AgentDetail["trades"];
  explorerBaseUrl: string;
}) {
  if (trades.length === 0) {
    return (
      <Card>
        <p className="text-app-body-sm text-white-muted">No trades yet.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] border-collapse">
        <thead className="sticky top-0 bg-vault-floor">
          <tr className="border-b border-moss-border/40 text-num-xs uppercase text-white-faint font-jetbrains-mono">
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-left">When</th>
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-left">Notional</th>
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-left">Status</th>
            <th className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-left">Tx</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-moss-border/20 hover:bg-row-hover">
              <td className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-num-sm text-white-muted font-jetbrains-mono">
                {new Date(t.createdAt).toLocaleString()}
              </td>
              <td className="px-[var(--spacing-16)] py-[var(--spacing-12)] text-num text-white font-jetbrains-mono tabular-nums">
                $
                {Number(t.notionalUsd).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="px-[var(--spacing-16)] py-[var(--spacing-12)]">
                <TxStatusPill status={t.status} />
                {t.simulateError && (
                  <div className="mt-[var(--spacing-4)] max-w-xs text-num-xs text-signal-red">
                    {t.simulateError}
                  </div>
                )}
              </td>
              <td className="px-[var(--spacing-16)] py-[var(--spacing-12)]">
                {t.txHash ? (
                  <AddressChip address={t.txHash} explorerBaseUrl={explorerBaseUrl} kind="tx" />
                ) : (
                  <span className="text-white-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
