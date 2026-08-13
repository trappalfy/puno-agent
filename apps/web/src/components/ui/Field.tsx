import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * DESIGN.md 1.6 names a "Ghost Input Field" among the existing components,
 * but it had never been extracted — every form rolled its own `<input>` with
 * hand-copied classes. This is that component.
 *
 * `unit` renders inside the field rather than in the label, so the label says
 * what the number means and the field says what it is measured in. Numeric
 * fields route through JetBrains Mono with tabular figures per the "every
 * comparable number" rule (§ Typography); `mono={false}` opts prose fields
 * (a name) back into Denim Ink.
 */
export function Field({
  label,
  hint,
  error,
  unit,
  prefix,
  mono = true,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  /** Replaces `hint` and turns the border red. Signal Red is the error color
      (§ Color); it is one of only two signal colors, so nothing else on the
      form may borrow it. Explicitly `| undefined` because the project sets
      exactOptionalPropertyTypes, and callers pass a lookup that may miss. */
  error?: string | undefined;
  unit?: string;
  prefix?: string;
  mono?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-[var(--spacing-4)] ${className}`}>
      <span className="text-app-body-sm text-white-muted">{label}</span>

      {/* focus-within moves the ring to the wrapper so the unit/prefix sit
          inside the same visual box as the input itself. */}
      <span
        className={`flex items-center gap-[var(--spacing-8)] rounded-[var(--radius-tags)] border bg-forest-canopy px-[var(--spacing-12)] py-[var(--spacing-8)] transition-colors ${
          error
            ? "border-signal-red"
            : "border-moss-border focus-within:border-lime-phosphor"
        }`}
      >
        {prefix && (
          <span className="shrink-0 text-num-sm text-white-faint font-jetbrains-mono">{prefix}</span>
        )}
        <input
          {...props}
          aria-invalid={error ? true : undefined}
          className={`w-full min-w-0 bg-transparent text-app-body text-white outline-none placeholder:text-white-faint ${
            mono ? "font-jetbrains-mono tabular-nums" : "font-denim-ink"
          }`}
        />
        {unit && (
          <span className="shrink-0 text-num-sm text-white-faint font-jetbrains-mono">{unit}</span>
        )}
      </span>

      {error ? (
        <span className="text-app-body-sm text-signal-red">{error}</span>
      ) : (
        hint && <span className="text-num-xs text-white-faint font-jetbrains-mono">{hint}</span>
      )}
    </label>
  );
}
