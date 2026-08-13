const SIZE_CLASS = {
  "num-sm": "text-num-sm",
  num: "text-num",
  "num-lg": "text-num-lg",
  "num-xl": "text-num-xl",
} as const;

/// DESIGN.md 1.5: sign + triangle + color + tabular mono — the sign is never
/// carried by color alone.
export function PnlValue({
  usd,
  pct,
  size = "num",
}: {
  usd: number;
  pct?: number;
  size?: keyof typeof SIZE_CLASS;
}) {
  const sign = usd > 0 ? "+" : usd < 0 ? "−" : "";
  const triangle = usd > 0 ? "▲" : usd < 0 ? "▼" : "";
  const color = usd > 0 ? "text-pnl-profit" : usd < 0 ? "text-pnl-loss" : "text-pnl-zero";
  const abs = Math.abs(usd).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <span className={`font-jetbrains-mono ${SIZE_CLASS[size]} ${color} tabular-nums`}>
      {triangle} {sign}${abs}
      {pct !== undefined && (
        <span className="ml-[var(--spacing-8)] text-num-sm">
          {sign}
          {Math.abs(pct).toFixed(2)}%
        </span>
      )}
    </span>
  );
}
