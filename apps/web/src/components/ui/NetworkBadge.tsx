/// DESIGN.md 1.6/#11: lime outline for mainnet, amber outline for testnet,
/// red + "Switch" action when the wallet is on neither.
export function NetworkBadge({
  network,
  wrongNetwork,
  onSwitch,
}: {
  network: "mainnet" | "testnet";
  wrongNetwork?: boolean;
  onSwitch?: () => void;
}) {
  if (wrongNetwork) {
    return (
      <span className="inline-flex items-center gap-[var(--spacing-8)] rounded-[var(--radius-pills)] border border-signal-red px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm text-signal-red font-jetbrains-mono">
        Wrong network
        {onSwitch && (
          <button onClick={onSwitch} className="underline underline-offset-2">
            Switch
          </button>
        )}
      </span>
    );
  }

  const isMainnet = network === "mainnet";
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pills)] border px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm font-jetbrains-mono ${
        isMainnet
          ? "border-lime-phosphor text-lime-phosphor"
          : "border-signal-amber text-signal-amber"
      }`}
    >
      {isMainnet ? "Robinhood Chain · 4663" : "Testnet · 46630"}
    </span>
  );
}
