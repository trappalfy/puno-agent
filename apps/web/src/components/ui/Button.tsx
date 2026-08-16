import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";
type Shape = "default" | "pill";

/// landing.md — Lime Primary Button / Ghost Outline Button. Every dimension
/// here is a density role token, so one component serves both the poster
/// surfaces and the product app: padding is "18px 32px" at poster density and
/// tightens in terminal, radius is 16px / 10px, and the label follows the
/// matching body-sm role (16px / 13px).
///
/// The label used to be a literal `text-body-sm` — the poster scale — while the
/// padding around it was already density-aware. In the app that put a 16px
/// label, bigger than the 13-14px body text next to it, inside a box padded for
/// the smaller density: the text ran to the edges and the button read as a
/// hairline round a string. See tokens.ts `buttonText`.
///
/// `whitespace-nowrap` because the box is sized by its label: let the label
/// wrap and the second line has no padding budget of its own, which is the same
/// defect arriving by a different route. A label too long for its container is
/// a copy problem, and it should be visible as one.
const base =
  "inline-flex items-center justify-center gap-[var(--spacing-8)] whitespace-nowrap font-denim-ink transition-colors disabled:opacity-40 disabled:pointer-events-none text-[length:var(--button-text-size)] leading-[var(--button-text-line-height)] tracking-[var(--button-text-tracking)]";

/**
 * Shape swaps the radius and padding rather than layering an override on top:
 * a caller passing `rounded-[…]` through className would be fighting the base
 * class for the same property, and which one wins depends on the order the two
 * rules land in the compiled stylesheet — not on the order they appear in the
 * class string.
 *
 * `pill` is landing.md's Pill Navigation Link geometry, for a button sitting
 * inside a nav bar next to those links rather than acting as a page-level CTA.
 */
const shapes: Record<Shape, string> = {
  default:
    "rounded-[var(--radius-buttons)] px-[var(--button-padding-x)] py-[var(--button-padding-y)]",
  pill: "rounded-[var(--radius-pills)] px-[var(--spacing-16)] py-[var(--spacing-8)]",
};

const variants: Record<Variant, string> = {
  // "The only fully filled button in the system — use sparingly as the lime
  // is rationed."
  primary: "bg-lime-phosphor text-vault-floor font-semibold hover:opacity-90",
  // "1px #ffffff border" — full white, not a tinted one.
  ghost: "border border-white text-white hover:border-lime-phosphor hover:text-lime-phosphor",
  danger: "border border-signal-red text-signal-red hover:bg-signal-red hover:text-vault-floor",
};

/**
 * Exported so a link that should *look* like a button can borrow the styling
 * instead of wrapping one. `<Link><Button/></Link>` nests a <button> inside an
 * <a>, which is invalid and hands screen readers two overlapping controls —
 * see Sidebar.tsx, which hit this first. ButtonLink is the fixed form; this is
 * what keeps the two from drifting apart.
 */
export function buttonClasses(
  variant: Variant = "primary",
  shape: Shape = "default",
  className = "",
): string {
  return `${base} ${shapes[shape]} ${variants[variant]} ${className}`;
}

export function Button({
  variant = "primary",
  shape = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; shape?: Shape }) {
  return <button className={buttonClasses(variant, shape, className)} {...props} />;
}

export type { Variant as ButtonVariant, Shape as ButtonShape };
