import type { ReactNode } from "react";
import { Card } from "./Card";

/// DESIGN.md Agent Prompt Guide #3: 11px uppercase mono label, num-lg value,
/// optional delta below.
export function MetricTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
}) {
  return (
    <Card>
      <div className="text-num-xs uppercase tracking-wide text-white-faint font-jetbrains-mono">
        {label}
      </div>
      <div className="mt-[var(--spacing-8)] text-num-lg text-white font-jetbrains-mono tabular-nums">
        {value}
      </div>
      {delta && <div className="mt-[var(--spacing-4)]">{delta}</div>}
    </Card>
  );
}
