import { ChevronRight } from "lucide-react";

/**
 * The prompt's AppleButton (Apple logo + "Download Aura" + chevron) adapted:
 * there's no desktop app to download, so the leading logo is dropped and the
 * label carries the meaning instead. The chevron's +1px hover nudge and the
 * pill shape are kept as-is — that's the actual "premium" tell, not the
 * Apple branding.
 */
export function CtaButton({
  href,
  label,
  variant = "solid",
  full = false,
  className = "",
}: {
  href: string;
  label: string;
  variant?: "solid" | "outline";
  full?: boolean;
  className?: string;
}) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-[var(--radius-pills)] text-sm font-medium px-5 py-3 transition-all active:scale-[0.98]";
  const variants: Record<typeof variant, string> = {
    solid: "bg-lime-phosphor text-vault-floor hover:opacity-90",
    outline: "border border-white/15 text-white hover:bg-white/5",
  };

  return (
    <a href={href} className={`${base} ${variants[variant]} ${full ? "w-full" : ""} ${className}`}>
      {label}
      <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-[1px]" aria-hidden />
    </a>
  );
}
