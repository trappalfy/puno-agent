import type { ReactNode } from "react";

/// Progressive disclosure — the mechanism the product surfaces were missing.
///
/// Built on <details>/<summary> rather than React state deliberately:
///  - keyboard-operable and announced correctly with no ARIA of ours to get
///    wrong (a div + aria-expanded is the version that rots),
///  - renders in its correct state before hydration, so a collapsed section
///    never flashes open on load,
///  - browser find-in-page opens a closed section that contains the match,
///    which a state-driven accordion silently defeats.
///
/// `summary` is not decoration: a collapsed section has to answer its own
/// question in the header ("5 on-chain · max $2,500/trade") so that most
/// visits never need to open it at all. A disclosure whose header says
/// nothing has only moved the work, not removed it.
export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-[var(--radius-cards)] bg-vault-floor">
      {/* list-none + the webkit marker reset: Safari draws its own triangle
          from a pseudo-element that `list-style` alone does not remove. */}
      <summary className="flex cursor-pointer list-none items-center justify-between gap-[var(--spacing-16)] rounded-[var(--radius-cards)] p-[var(--layout-card-padding)] transition-colors hover:bg-row-hover [&::-webkit-details-marker]:hidden">
        <span className="text-app-heading-sm font-denim-ink font-semibold text-white">{title}</span>
        <span className="flex items-center gap-[var(--spacing-12)]">
          {summary !== undefined && (
            <span className="text-num-sm text-white-muted font-jetbrains-mono tabular-nums">
              {summary}
            </span>
          )}
          {/* Inline rather than lucide-react: that package is a dependency of
              apps/site only, and one chevron is not worth adding it here. */}
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 shrink-0 text-white-faint transition-transform duration-[var(--motion-transition)] group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </summary>

      <div className="px-[var(--layout-card-padding)] pb-[var(--layout-card-padding)]">
        {children}
      </div>
    </details>
  );
}
