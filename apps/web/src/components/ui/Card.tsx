import type { HTMLAttributes } from "react";

/// DESIGN.md "Dark Content Card" — surfaces separate by color-tier shift
/// only, never a shadow. `elevated` bumps one tier (vault-floor → canopy-mid).
export function Card({
  elevated = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={`rounded-[var(--radius-cards)] p-[var(--layout-card-padding)] ${
        elevated ? "bg-canopy-mid" : "bg-vault-floor"
      } ${className}`}
      {...props}
    />
  );
}
