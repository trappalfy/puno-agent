import type { ReactNode } from "react";

/**
 * landing.md — Section Eyebrow Label: an 8px lime dot plus a Denim Ink
 * caption in white, introducing every section.
 *
 * The spec is self-contradictory on orientation: the component entry says
 * "always paired vertically (dot above text)", while its own Agent Prompt
 * Guide (example 5) says "positioned inline-block, followed by a Denim Ink
 * 16px caption… vertically centered". Built inline, which is what two of the
 * three descriptions call for (DESIGN.md also says "before every section
 * eyebrow label") and what reads correctly above a 64px headline.
 */
export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-[var(--spacing-16)]">
      <span className="h-2 w-2 shrink-0 rounded-full bg-lime-phosphor" aria-hidden />
      <span className="text-body-sm font-denim-ink text-white">{children}</span>
    </div>
  );
}
