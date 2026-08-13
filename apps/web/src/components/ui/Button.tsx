import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";
type Shape = "default" | "pill";

/// landing.md — Lime Primary Button / Ghost Outline Button. Padding is
/// "18px 32px" at poster density and tightens automatically in terminal
/// density (see --button-padding-* in tokens.ts); radius is 16px in both.
const base =
  "inline-flex items-center justify-center gap-[var(--spacing-8)] font-denim-ink transition-colors disabled:opacity-40 disabled:pointer-events-none text-body-sm";

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
  danger:
    "border border-signal-red text-signal-red hover:bg-signal-red hover:text-vault-floor",
};

export function Button({
  variant = "primary",
  shape = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; shape?: Shape }) {
  return (
    <button className={`${base} ${shapes[shape]} ${variants[variant]} ${className}`} {...props} />
  );
}
