import { getNetwork, type NetworkKey } from "@puno/shared";

/// DESIGN.md 1.6/#11 — lime outline for mainnet, amber for testnet.
///
/// One job: labelling which chain a thing belongs to. It used to carry a second,
/// `wrongNetwork`, which was a wallet-status control with an action attached —
/// used only by the old global `NetworkGuard`. Those diverged once the guard
/// became per-surface: the wrong-network state has to name the chain the wallet
/// is actually on, which may be neither of ours, and this badge can only render
/// two. That state now lives in `RequireNetwork`, and this went back to being a
/// label.
///
/// The name and chain id are read from the network config rather than written
/// here. They were literals — `"Robinhood Chain · 4663"` / `"Testnet · 46630"` —
/// which is a second copy of facts that already exist in one place, and the kind
/// that stays wrong for a long time because a stale label still looks fine.
export function NetworkBadge({ network }: { network: NetworkKey }) {
  const config = getNetwork(network);
  const isMainnet = network === "mainnet";
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pills)] border px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm font-jetbrains-mono ${
        isMainnet
          ? "border-lime-phosphor text-lime-phosphor"
          : "border-signal-amber text-signal-amber"
      }`}
    >
      {isMainnet ? config.name : "Testnet"} · {config.chainId}
    </span>
  );
}
