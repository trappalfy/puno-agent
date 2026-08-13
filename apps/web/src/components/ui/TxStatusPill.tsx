export type TradeStatus = "dry_run" | "simulated" | "pending" | "confirmed" | "failed" | "reverted";

const STATUS: Record<TradeStatus, { color: string; label: string }> = {
  dry_run: { color: "text-white-muted border-white/25", label: "Dry run" },
  simulated: { color: "text-white-muted border-white/25", label: "Simulated" },
  pending: { color: "text-tx-pending border-signal-amber", label: "Pending" },
  confirmed: { color: "text-tx-confirmed border-lime-phosphor", label: "Confirmed" },
  failed: { color: "text-tx-failed border-signal-red", label: "Failed" },
  reverted: { color: "text-tx-failed border-signal-red", label: "Reverted" },
};

export function TxStatusPill({ status }: { status: TradeStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pills)] border px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm font-jetbrains-mono ${s.color}`}
    >
      {s.label}
    </span>
  );
}
