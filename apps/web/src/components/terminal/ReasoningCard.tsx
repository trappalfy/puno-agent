import { Card } from "../ui/Card";
import type { AgentDetail } from "@/lib/hooks/useAgentDetail";

type Signal = AgentDetail["signals"][number];

/// DESIGN.md #15 — "rejected signals render with the same visual weight as
/// accepted ones, never grayed out or hidden." This is the trust mechanism
/// the whole plan calls the primary one, so verdict chips differ only in
/// color/label, never in opacity or size.
///
/// The history now collapses (see ReasoningHistory below) and this rule was
/// re-checked against that change: what collapses is decided by *recency*
/// alone, never by verdict. The newest decision is always expanded, accepted
/// or rejected alike, and a collapsed row carries the same chip at the same
/// size either way. A rejection is never the thing that gets folded away.
export function ReasoningCard({ signal }: { signal: Signal }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-num-sm text-white-faint font-jetbrains-mono">
          {new Date(signal.createdAt).toLocaleString()}
        </span>
        <VerdictChip escalate={signal.escalate} decision={signal.decision} />
      </div>
      <ReasoningBody signal={signal} />
    </Card>
  );
}

/// The newest decision, given the weight the page's whole question deserves:
/// someone opening an agent wants to know what it just decided and why, and
/// before this that answer sat below the risk limits and the positions table.
export function LatestDecision({ signal }: { signal: Signal }) {
  return (
    <Card elevated>
      <div className="flex flex-wrap items-center justify-between gap-[var(--spacing-12)]">
        <span className="text-num-xs uppercase text-white-faint font-jetbrains-mono">
          Latest decision · {new Date(signal.createdAt).toLocaleString()}
        </span>
        <VerdictChip escalate={signal.escalate} decision={signal.decision} />
      </div>
      <ReasoningBody signal={signal} headline />
    </Card>
  );
}

/// Older signals as one row each: timestamp, what was decided, the verdict.
/// Opening a row reveals exactly the same body the latest decision shows —
/// nothing is summarised away, only deferred.
export function ReasoningHistory({ signals }: { signals: Signal[] }) {
  return (
    <div className="flex flex-col">
      {signals.map((signal) => (
        <details key={signal.id} className="group border-b border-moss-border/20 last:border-b-0">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-[var(--spacing-16)] py-[var(--spacing-12)] transition-colors hover:bg-row-hover [&::-webkit-details-marker]:hidden">
            <span className="text-num-sm text-white-faint font-jetbrains-mono tabular-nums">
              {new Date(signal.createdAt).toLocaleString()}
            </span>
            <span className="text-app-body-sm font-semibold text-white">
              {signal.decision
                ? `${signal.decision.action.toUpperCase()} ${signal.decision.ticker}`
                : "No decision"}
            </span>
            <span className="ml-auto">
              <VerdictChip escalate={signal.escalate} decision={signal.decision} />
            </span>
          </summary>
          <div className="pb-[var(--spacing-16)]">
            <ReasoningBody signal={signal} />
          </div>
        </details>
      ))}
    </div>
  );
}

/// Shared by all three surfaces above so a collapsed row and an expanded card
/// can never drift into showing different things about the same signal.
function ReasoningBody({ signal, headline = false }: { signal: Signal; headline?: boolean }) {
  const { decision } = signal;

  return (
    <>
      <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">
        Trigger: {signal.triggerReasons.join(", ")}
      </p>
      <p className="mt-[var(--spacing-8)] text-app-body text-white">{signal.reason}</p>

      {decision && (
        <div className="mt-[var(--spacing-16)] border-t border-moss-border/40 pt-[var(--spacing-16)]">
          <div className="flex items-center gap-[var(--spacing-12)]">
            <span
              className={
                headline
                  ? "text-app-heading-sm font-denim-ink font-semibold text-white"
                  : "text-app-body font-semibold text-white"
              }
            >
              {decision.action.toUpperCase()} {decision.ticker}
            </span>
            {decision.action !== "hold" && (
              <span className="text-num-sm text-white-muted font-jetbrains-mono tabular-nums">
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
    </>
  );
}

function VerdictChip({ escalate, decision }: { escalate: boolean; decision: Signal["decision"] }) {
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
