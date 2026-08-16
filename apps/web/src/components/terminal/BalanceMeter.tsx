"use client";

import Link from "next/link";
import { Card } from "../ui/Card";
import { ButtonLink } from "../ui/ButtonLink";
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

  // The headline is decisions, which is what the module comment above always
  // said it should be — the dollar figure was sitting in that slot and pushing
  // the real answer into faint text underneath.
  //
  // Not PUNO, even though every price in the product is now quoted in PUNO. A
  // price is a menu and may re-price; a balance is a stored amount, and in PUNO
  // it would drop every time the token rose, with nothing spent. Decisions moves
  // only when the agent has done something.
  return (
    <Card className={empty ? "border border-signal-red" : ""}>
      <div className="flex items-center justify-between">
        <span className="text-num-xs uppercase text-white-faint font-jetbrains-mono">Credit</span>
        <span className={`text-num-sm font-jetbrains-mono tabular-nums ${amountColor}`}>
          {usesOwnKey && decisionsRemaining === 0
            ? "own key"
            : `${decisionsRemaining} decision${decisionsRemaining === 1 ? "" : "s"}`}
        </span>
      </div>

      <p className="mt-[var(--spacing-8)] text-num-xs text-white-faint font-jetbrains-mono tabular-nums">
        {usesOwnKey
          ? `own key — ${decisionsRemaining > 0 ? "trades only" : "trades billed"}`
          : empty
            ? "top up to keep deciding"
            : "paid in PUNO, spent per action"}
      </p>

      {empty && (
        <div className="mt-[var(--spacing-16)]">
          <p className="text-app-body-sm text-signal-red">
            {hasAgents
              ? "Out of credit — your agent stays in protective mode (stop-loss and take-profit still run), but makes no new decisions until you top up."
              : "Out of credit. You have no agent running yet — top up and create one to put it to work."}
          </p>
          {/* Was a hand-copy of the primary button's classes, which is the
              duplication ButtonLink exists to end (see its module comment).
              It had already been corrected here to the app type scale by
              hand — the shared button now gets that from a density token, so
              this can stop restating it and start inheriting it. */}
          <ButtonLink href="/pricing" className="mt-[var(--spacing-12)] w-full">
            Top up
          </ButtonLink>
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
