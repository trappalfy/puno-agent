"use client";

import Link from "next/link";
import { Card } from "../ui/Card";
import { useBalance } from "@/lib/hooks/useBalance";
import { useAgents } from "@/lib/hooks/useAgents";

/// DESIGN.md #22 — mono numbers, lime → amber when low → red at empty.
///
/// Replaces the old quota bar. There is no monthly ceiling to show a percentage
/// against any more, so the headline is what someone actually needs to decide
/// whether to top up: how many more decisions the balance buys.
export function BalanceMeter() {
  const { data } = useBalance();
  // Whether anything of the user's is actually running. The empty-balance copy
  // used to promise that "the agent stays in protective mode" to everyone at
  // zero, including someone who has just spent their free trial and owns no
  // vault at all. Nothing of theirs was running, so it was a false
  // reassurance — and a reassurance about stop-losses is the worst kind to get
  // wrong.
  const { data: agents } = useAgents();
  const hasAgents = (agents?.agents.length ?? 0) > 0;

  if (!data) return null;

  const { balanceUsd, decisionsRemaining, lowBalance, usesOwnKey } = data;
  const empty = balanceUsd <= 0;

  const amountColor = empty
    ? "text-signal-red"
    : lowBalance
      ? "text-signal-amber"
      : "text-lime-phosphor";

  return (
    <Card className={empty ? "border border-signal-red" : ""}>
      <div className="flex items-center justify-between">
        <span className="text-num-xs uppercase text-white-faint font-jetbrains-mono">Credit</span>
        <span className={`text-num-sm font-jetbrains-mono tabular-nums ${amountColor}`}>
          ${balanceUsd.toFixed(2)}
        </span>
      </div>

      <p className="mt-[var(--spacing-8)] text-num-xs text-white-faint font-jetbrains-mono tabular-nums">
        {usesOwnKey
          ? `own key — ${decisionsRemaining > 0 ? "trades only" : "trades billed"}`
          : `≈ ${decisionsRemaining} decision${decisionsRemaining === 1 ? "" : "s"}`}
      </p>

      {empty && (
        <div className="mt-[var(--spacing-16)]">
          <p className="text-app-body-sm text-signal-red">
            {hasAgents
              ? "Out of credit — your agent stays in protective mode (stop-loss and take-profit still run), but makes no new decisions until you top up."
              : "Out of credit. You have no agent running yet — top up and create one to put it to work."}
          </p>
          <Link
            href="/pricing"
            className="mt-[var(--spacing-12)] inline-flex w-full items-center justify-center rounded-[var(--radius-buttons)] bg-lime-phosphor px-[var(--button-padding-x)] py-[var(--button-padding-y)] text-app-body-sm font-denim-ink font-semibold text-vault-floor transition-opacity hover:opacity-90"
          >
            Top up
          </Link>
        </div>
      )}

      {!empty && lowBalance && (
        <p className="mt-[var(--spacing-12)] text-app-body-sm text-signal-amber">
          Running low.{" "}
          <Link href="/pricing" className="underline">
            Top up
          </Link>{" "}
          before the agent stops deciding.
        </p>
      )}
    </Card>
  );
}
