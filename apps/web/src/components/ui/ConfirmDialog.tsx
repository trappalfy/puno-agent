"use client";

import { Button } from "./Button";

/// DESIGN.md #23 — for irreversible actions. The action's own text is
/// repeated on the confirm button so there's no ambiguity about what "OK"
/// does.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-forest-canopy/90 px-[var(--spacing-24)]"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-sm rounded-[var(--radius-cards)] bg-vault-floor p-[var(--layout-card-padding)]">
        <h3 className="text-app-heading-sm font-denim-ink font-semibold text-white">{title}</h3>
        <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">{body}</p>
        <div className="mt-[var(--spacing-24)] flex justify-end gap-[var(--spacing-12)]">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>
            {pending ? "Confirming…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
