"use client";

import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { TxStatusPill, type TradeStatus } from "../ui/TxStatusPill";
import { useStartTrial, useTrial, type TrialStatus } from "@/lib/hooks/useTrial";

/// The free tier, end to end: one paper decision against the shared demo vault.
///
/// Everything shown here is real except the broadcast — live prices, a real
/// screening call, a real Opus decision, the real risk engine, and a real
/// eth_call simulation against the deployed vault. Saying so plainly matters
/// more than it looks: an agent that "would have" traded is only persuasive if
/// the reader believes the run was not a mock, and this is the moment they
/// decide whether to trust the product at all.

const STAGES = [
  { key: "queued", label: "Queued" },
  { key: "screening", label: "Screening the market" },
  { key: "deciding", label: "Forming a thesis" },
  { key: "risk", label: "Checking risk limits" },
  { key: "done", label: "Done" },
] as const;

function currentStage(status: TrialStatus): number {
  if (!status.run) return -1;
  if (status.run.status === "pending") return 0;
  if (status.run.status === "done" || status.run.status === "failed") return 4;
  // While running, the artefacts land in order, so their presence *is* the
  // progress. No separate progress column to drift out of step with reality.
  if (status.decision) return 3;
  if (status.signal) return 2;
  return 1;
}

export function TrialConsole() {
  const { data, isLoading, isError } = useTrial();
  const start = useStartTrial();

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-[var(--radius-cards)] bg-vault-floor" />;
  }
  if (isError || !data) {
    return <p className="text-app-body text-signal-red">Couldn&apos;t load the trial. Try again.</p>;
  }

  const inFlight = data.run?.status === "pending" || data.run?.status === "running";
  const stage = currentStage(data);

  return (
    <div className="flex flex-col gap-[var(--layout-element-gap)]">
      <Card elevated>
        <div className="flex flex-wrap items-start justify-between gap-[var(--spacing-16)]">
          <div>
            <h1 className="text-app-heading font-denim-ink font-semibold text-white">
              Watch the agent think
            </h1>
            <p className="mt-[var(--spacing-8)] max-w-xl text-app-body text-white-muted">
              One decision, free, on testnet. The agent reads a real portfolio at live prices,
              screens it, forms a thesis, checks it against the vault&apos;s on-chain risk limits
              and simulates the trade against the deployed contract. The only thing it does not do
              is broadcast.
            </p>
          </div>
          {data.canRun && !inFlight && (
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? "Starting…" : "Run the agent"}
            </Button>
          )}
        </div>

        {start.isError && (
          <p className="mt-[var(--spacing-16)] text-app-body-sm text-signal-red">
            {start.error.message}
          </p>
        )}

        {!data.canRun && !inFlight && <BlockedNotice status={data} />}
      </Card>

      {data.run && <StageList stage={stage} failed={data.run.status === "failed"} />}

      {data.run?.status === "failed" && data.run.error && (
        <Card>
          <p className="text-app-body text-signal-red">The run stopped: {data.run.error}</p>
          <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
            You were only charged for the calls that actually happened.
          </p>
        </Card>
      )}

      {data.signal && <ScreeningCard signal={data.signal} />}
      {data.decision && <DecisionCard decision={data.decision} trade={data.trade} />}

      {data.decision && !inFlight && <Paywall />}
    </div>
  );
}

function StageList({ stage, failed }: { stage: number; failed: boolean }) {
  return (
    <Card>
      <ol className="flex flex-col gap-[var(--spacing-12)]">
        {STAGES.map((s, i) => {
          const done = i < stage;
          const active = i === stage && !failed;
          return (
            <li key={s.key} className="flex items-center gap-[var(--spacing-12)]">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  done || active ? "bg-lime-phosphor" : "bg-moss-border"
                } ${active ? "animate-pulse" : ""}`}
                aria-hidden
              />
              <span
                className={`text-num-sm font-jetbrains-mono ${
                  done || active ? "text-white" : "text-white-faint"
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function ScreeningCard({ signal }: { signal: NonNullable<TrialStatus["signal"]> }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-num-xs uppercase text-white-faint font-jetbrains-mono">
          Screening — Haiku
        </span>
        <span
          className={`rounded-[var(--radius-tags)] border px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm font-jetbrains-mono ${
            signal.escalate
              ? "border-signal-amber text-signal-amber"
              : "border-white/25 text-white-muted"
          }`}
        >
          {signal.escalate ? "escalated" : "not escalated"}
        </span>
      </div>
      <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">
        Trigger: {signal.triggerReasons.join(", ")}
      </p>
      <p className="mt-[var(--spacing-8)] text-app-body text-white">{signal.reason}</p>
      {!signal.escalate && (
        <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">
          The screening model decided this did not warrant a full decision, so nothing was spent on
          one. Run it again when the market has moved.
        </p>
      )}
    </Card>
  );
}

function DecisionCard({
  decision,
  trade,
}: {
  decision: NonNullable<TrialStatus["decision"]>;
  trade: TrialStatus["trade"];
}) {
  const accepted = decision.riskVerdict === "accepted";
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-num-xs uppercase text-white-faint font-jetbrains-mono">
          Decision — Opus
        </span>
        <span
          className={`rounded-[var(--radius-tags)] border px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm font-jetbrains-mono ${
            accepted ? "border-lime-phosphor text-lime-phosphor" : "border-signal-red text-signal-red"
          }`}
        >
          {accepted ? "risk accepted" : "risk rejected"}
        </span>
      </div>

      <div className="mt-[var(--spacing-12)] flex items-center gap-[var(--spacing-12)]">
        <span className="text-app-heading-sm font-denim-ink font-semibold text-white">
          {decision.action.toUpperCase()} {decision.ticker}
        </span>
        {decision.action !== "hold" && (
          <span className="text-num text-white-muted font-jetbrains-mono tabular-nums">
            {Number(decision.sizePct).toFixed(1)}% of free cash
          </span>
        )}
      </div>

      <p className="mt-[var(--spacing-12)] text-app-body text-white-muted">{decision.thesis}</p>

      <div className="mt-[var(--spacing-16)]">
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
        <div className="mt-[var(--spacing-16)] flex flex-wrap gap-[var(--spacing-8)]">
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

      {!accepted && decision.riskReason && (
        <p className="mt-[var(--spacing-12)] text-app-body-sm text-signal-red">
          Rejected by the vault&apos;s limits: {decision.riskReason}
        </p>
      )}

      {trade && (
        <div className="mt-[var(--spacing-16)] border-t border-moss-border/40 pt-[var(--spacing-16)]">
          <div className="flex items-center gap-[var(--spacing-12)]">
            <TxStatusPill status={trade.status as TradeStatus} />
            <span className="text-app-body-sm text-white-muted">
              {trade.simulateError
                ? "The simulation showed this would have reverted on-chain, so nothing was sent."
                : "Simulated against the deployed vault and it would have gone through. Nothing was broadcast — this is the free tier."}
            </span>
          </div>
          {trade.simulateError && (
            <p className="mt-[var(--spacing-8)] text-app-body-sm text-signal-red">
              {trade.simulateError}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function BlockedNotice({ status }: { status: TrialStatus }) {
  const copy: Record<string, string> = {
    already_used:
      "You have had your free decision. Top up to run an agent on a vault of your own.",
    insufficient_credit:
      "Your balance no longer covers a decision. Top up to keep the agent working.",
    in_flight: "A run is already going. One at a time.",
    no_demo_vault: "The free tier is not available on this network.",
  };
  return (
    <p className="mt-[var(--spacing-16)] text-app-body-sm text-white-muted">
      {copy[status.reason ?? ""] ?? "The free run is not available right now."}
    </p>
  );
}

function Paywall() {
  return (
    <Card elevated>
      <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">
        That was one decision. An agent makes them all day.
      </h2>
      <p className="mt-[var(--spacing-8)] max-w-xl text-app-body text-white-muted">
        On a vault of your own the agent runs continuously, on real prices, inside limits you set
        on-chain — and it executes rather than simulating. You keep custody throughout: the vault
        is yours, the agent key can only trade within your policy, and only your wallet can
        withdraw.
      </p>
      <div className="mt-[var(--spacing-24)] flex flex-wrap gap-[var(--spacing-12)]">
        <ButtonLink href="/app/settings">Top up with PUNO</ButtonLink>
        <ButtonLink href="/pricing" variant="ghost">
          See what actions cost
        </ButtonLink>
      </div>
    </Card>
  );
}
