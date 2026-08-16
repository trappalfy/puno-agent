"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectWalletButton } from "../ConnectWalletButton";
import { ButtonLink } from "../ui/ButtonLink";
import { BalanceMeter } from "./BalanceMeter";
import { describeChain } from "@/lib/networkGuard";

/**
 * Each item owns a subtree, not just its own href. A bare prefix test would
 * not work here because Settings also lives under /app — so "Agents" claims
 * the index plus /app/agents/*, and nothing else.
 */
const NAV = [
  {
    href: "/app",
    label: "Agents",
    isActive: (p: string) => p === "/app" || p.startsWith("/app/agents"),
  },
  {
    href: "/app/try",
    label: "Try the agent",
    isActive: (p: string) => p.startsWith("/app/try"),
  },
  {
    href: "/app/settings",
    label: "Settings",
    isActive: (p: string) => p.startsWith("/app/settings"),
  },
] as const;

/**
 * DESIGN.md Layout: "persistent left rail (agent list, account)".
 *
 * `sticky h-screen` rather than `h-full`: the rail's parent sets only
 * min-height, so a percentage height resolved against `auto` and collapsed the
 * whole aside to the height of its own contents — which is why it used to end
 * partway down the page and strand `justify-between` with no space to
 * distribute.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { isConnected, chainId } = useAccount();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col self-start overflow-y-auto border-r border-moss-border/40 bg-vault-floor p-[var(--layout-card-padding)]">
      <div className="flex items-center justify-between gap-[var(--spacing-8)]">
        <Link href="/" className="text-app-heading-sm font-denim-ink font-semibold text-white">
          Puno
        </Link>
      </div>

      {/* This used to be a NetworkBadge for one pinned network, on the reasoning
          that "every address, limit and balance in this app belongs to one
          chain". That stopped being true: the free tier runs on testnet
          permanently while paid agents trade on mainnet, so one account holds
          both and each agent carries its own badge.

          What is still worth saying once, in the rail, is where the *wallet* is
          — because that is the thing a person changes and then forgets. Named
          honestly for chains we do not run, rather than silently rounded to one
          of ours. */}
      {isConnected && (
        <div className="mt-[var(--spacing-12)] text-num-sm text-white-faint font-jetbrains-mono">
          Wallet on {describeChain(chainId)}
        </div>
      )}

      <nav className="mt-[var(--layout-section-gap)] flex flex-col gap-[var(--spacing-4)]">
        {NAV.map(({ href, label, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-[var(--radius-tags)] px-[var(--spacing-12)] py-[var(--spacing-8)] text-app-body transition-colors ${
                active
                  ? "bg-row-hover font-semibold text-lime-phosphor"
                  : "text-white-muted hover:bg-row-hover hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* A Link wrapping a Button nested a <button> inside an <a>, which is
          invalid and gives screen readers two overlapping controls. ButtonLink
          borrows the button's class builder instead of re-stating the classes
          here, which is what this had to do before it existed. */}
      <ButtonLink href="/app/agents/new" className="mt-[var(--spacing-16)]">
        New agent
      </ButtonLink>

      <div className="mt-auto flex flex-col gap-[var(--spacing-12)] pt-[var(--spacing-24)]">
        <BalanceMeter />
        <ConnectWalletButton variant="ghost" className="w-full" />
      </div>
    </aside>
  );
}
