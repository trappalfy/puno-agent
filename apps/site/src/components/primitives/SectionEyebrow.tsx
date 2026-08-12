/// DESIGN.md: "an 8px lime dot before every section eyebrow label" — kept at
/// the smaller 6px the reference used; the rule is about the dot preceding
/// the label, not its exact diameter.
export function SectionEyebrow({ label, tag }: { label: string; tag?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-lime-phosphor" aria-hidden />
      <span className="text-sm font-medium text-white/70">{label}</span>
      {tag && (
        <span className="px-2 py-0.5 rounded-full border border-white/10 text-white/50 text-xs">
          {tag}
        </span>
      )}
    </div>
  );
}
