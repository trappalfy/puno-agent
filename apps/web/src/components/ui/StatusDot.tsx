export type AgentStatus =
  "idle" | "armed" | "running" | "paused" | "error" | "halted" | "quota_exhausted";

const STATUS: Record<AgentStatus, { color: string; label: string; pulse?: boolean }> = {
  idle: { color: "bg-white-faint", label: "Idle" },
  armed: { color: "bg-fern", label: "Armed" },
  running: { color: "bg-lime-phosphor", label: "Running", pulse: true },
  paused: { color: "bg-signal-amber", label: "Paused" },
  error: { color: "bg-signal-red", label: "Error" },
  halted: { color: "bg-signal-red", label: "Halted" },
  quota_exhausted: { color: "bg-signal-amber", label: "Quota exhausted" },
};

/// DESIGN.md 1.5: status is a dot + label, never a bare color — the label is
/// mandatory, not decorative.
export function StatusDot({ status }: { status: AgentStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-[var(--spacing-8)]">
      <span
        className={`h-2 w-2 rounded-full ${s.color} ${s.pulse ? "motion-safe:animate-pulse" : ""}`}
        aria-hidden
      />
      <span className="text-app-body-sm text-white-muted">{s.label}</span>
    </span>
  );
}
