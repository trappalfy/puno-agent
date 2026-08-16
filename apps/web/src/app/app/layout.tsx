import type { ReactNode } from "react";
import { Sidebar } from "@/components/terminal/Sidebar";

/**
 * No network gate here any more.
 *
 * `NetworkGuard` used to wrap this whole subtree and compare the wallet against
 * one hardcoded chain. That was correct while the product lived on testnet
 * alone, and became wrong the moment it spanned two: the free tier stays on
 * testnet permanently while paid agents trade on mainnet, so one account holds
 * both, and a global gate would blank the console over half of its own contents.
 *
 * The requirement now sits on the surfaces that actually need it — see
 * `RequireNetwork`. Most need none: reads are pinned to an explicit `chainId`
 * and resolve over that chain's transport regardless of the wallet, so what
 * needs gating is a write.
 */
export default function TerminalLayout({ children }: { children: ReactNode }) {
  return (
    <div data-density="terminal" className="flex min-h-screen min-w-(--layout-min-width)">
      <Sidebar />
      <main className="flex-1 p-[var(--layout-card-padding)]">{children}</main>
    </div>
  );
}
