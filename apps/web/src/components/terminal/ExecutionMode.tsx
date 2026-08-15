"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useSetPaperMode } from "@/lib/hooks/useAgentDetail";

/// Paper or live, and the control to move between them.
///
/// Renders in the page header beside the kill switch rather than inside a
/// disclosure, for the same reason that one does: whether an agent can spend
/// real money is not a detail someone should have to expand a section to learn.
/// The dashboard shows the same fact as a DRY RUN badge, so this is the only
/// place it can be acted on.
///
/// The asymmetry between the two directions is deliberate. Going live is what
/// the confirmation is for; going back to paper takes effect on the next click,
/// because a control that argues with you about becoming *safer* is a control
/// people learn to route around.
export function ExecutionMode({ agentId, dryRun }: { agentId: string; dryRun: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate, isPending, error } = useSetPaperMode(agentId);

  return (
    <div className="flex flex-col items-end gap-[var(--spacing-4)]">
      <div className="flex items-center gap-[var(--spacing-12)]">
        {/* Labelled, not a colour. DESIGN.md's accessibility rule, and the
            state it encodes is "is this real money" — the last thing in the
            product that should depend on distinguishing two greens. */}
        <span
          className={`rounded-[var(--radius-tags)] border px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm font-jetbrains-mono ${
            dryRun
              ? "border-moss-border text-white-muted"
              : "border-lime-phosphor text-lime-phosphor"
          }`}
        >
          {dryRun ? "Paper" : "Live"}
        </span>
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => (dryRun ? setConfirmOpen(true) : mutate(true))}
        >
          {isPending ? "Switching…" : dryRun ? "Go live" : "Back to paper"}
        </Button>
      </div>

      {error && <p className="text-app-body-sm text-signal-red">{(error as Error).message}</p>}

      <ConfirmDialog
        open={confirmOpen}
        title="Let this agent trade for real?"
        // Says "may" rather than "will" on purpose. runTick ORs this column
        // with the worker's process-wide DRY_RUN, and execute.ts checks that
        // flag last of all, so clearing it permits a broadcast rather than
        // commanding one — and the vault's pause() still outranks both.
        // Promising live execution here would be a promise this switch cannot
        // keep on its own.
        body="From the next tick, trades this agent decides on may be broadcast on-chain and settled with real funds, inside the limits the vault enforces. Pausing the vault or switching back to paper stops it again."
        confirmLabel="Go live"
        danger
        pending={isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() =>
          mutate(false, {
            onSuccess: () => setConfirmOpen(false),
          })
        }
      />
    </div>
  );
}
