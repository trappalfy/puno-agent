import { Card } from "../ui/Card";
import type { AgentDetail } from "@/lib/hooks/useAgentDetail";

/// DESIGN.md #15 — "rejected signals render with the same visual weight as
/// accepted ones, never grayed out or hidden." This is the trust mechanism
/// the whole plan calls the primary one, so verdict chips differ only in
/// color/label, never in opacity or size.
export function ReasoningCard({ signal }: { signal: AgentDetail["signals"][number] }) {
  const { decision } = signal;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-num-sm text-white-faint font-jetbrains-mono">
          {new Date(signal.createdAt).toLocaleString()}
        </span>
        <VerdictChip escalate={signal.escalate} decision={decision} />
      </div>

      <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">
        Trigger: {signal.triggerReasons.join(", ")}
      </p>
      <p className="mt-[var(--spacing-8)] text-app-body text-white">{signal.reason}</p>

      {decision && (
        <div className="mt-[var(--spacing-16)] border-t border-moss-border/40 pt-[var(--spacing-16)]">
          <div className="flex items-center gap-[var(--spacing-12)]">
            <span className="text-app-body font-semibold text-white">
              {decision.action.toUpperCase()} {decision.ticker}
            </span>
            {decision.action !== "hold" && (
              <span className="text-num-sm text-white-muted font-jetbrains-mono">
                {Number(decision.sizePct).toFixed(1)}%
              </span>
            )}
          </div>

          <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
            {decision.thesis}
          </p>

          <div className="mt-[var(--spacing-12)]">
            <div className="flex items-center justify-between text-num-xs text-white-faint font-jetbrains-mono">
              <span>Confidence</span>
              <span>{(Number(decision.confidence) * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-[var(--spacing-4)] h-1 rounded-[var(--radius-pills)] bg-moss-border/40">
              <div
                className="h-1 rounded-[var(--radius-pills)] bg-lime-phosphor"
                style={{ width: `${Number(decision.confidence) * 100}%` }}
              />
            </div>
          </div>

          {decision.riskFlags.length > 0 && (
            <div className="mt-[var(--spacing-12)] flex flex-wrap gap-[var(--spacing-8)]">
              {decision.riskFlags.map((flag) => (
                <span
                  key={flag}
                  className="rounded-[var(--radius-tags)] border border-signal-amber/60 px-[var(--spacing-8)] py-[var(--spacing-4)] text-num-xs text-signal-amber font-jetbrains-mono"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}

          {decision.riskVerdict === "rejected" && decision.riskReason && (
            <p className="mt-[var(--spacing-12)] text-app-body-sm text-signal-red">
              Rejected: {decision.riskReason}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function VerdictChip({
  escalate,
  decision,
}: {
  escalate: boolean;
  decision: AgentDetail["signals"][number]["decision"];
}) {
  if (!escalate) {
    return (
      <span className="rounded-[var(--radius-tags)] border border-white/25 px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm text-white-muted font-jetbrains-mono">
        not escalated
      </span>
    );
  }
  if (!decision) {
    return (
      <span className="rounded-[var(--radius-tags)] border border-signal-amber px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm text-signal-amber font-jetbrains-mono">
        escalated
      </span>
    );
  }
  const accepted = decision.riskVerdict === "accepted";
  return (
    <span
      className={`rounded-[var(--radius-tags)] border px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm font-jetbrains-mono ${
        accepted ? "border-lime-phosphor text-lime-phosphor" : "border-signal-red text-signal-red"
      }`}
    >
      {accepted ? "accepted" : "rejected"}
    </span>
  );
}
