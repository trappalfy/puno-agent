/// landing.md — Hairline Divider: "1px line in #586740 (moss border)…
/// these dividers whisper rather than announce."
export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-moss-border ${className}`} />;
}
