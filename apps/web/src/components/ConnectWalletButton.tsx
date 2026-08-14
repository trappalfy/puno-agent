"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "./ui/Button";
import { useSession } from "@/lib/useSession";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/// Whether the browser exposes an injected wallet at all.
///
/// `null` until the effect runs, so the first client render matches the server
/// one and hydration stays quiet. Only the generic `injected` connector is
/// configured (see lib/wagmi-config.ts — WalletConnect needs a project ID we do
/// not have), and wagmi registers that connector whether or not a wallet is
/// present. So `connectors` is never empty and can never answer this question:
/// the button looked enabled on a machine with no wallet, and clicking it threw
/// a provider-not-found error into a value nobody rendered.
function useInjectedWallet(): boolean | null {
  const [present, setPresent] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () =>
      setPresent(typeof window !== "undefined" && "ethereum" in window && !!window.ethereum);
    check();
    // Some wallets inject after first paint and announce themselves per
    // EIP-6963. Without this the page would keep saying "no wallet" to someone
    // who has one, until they reloaded.
    window.addEventListener("eip6963:announceProvider", check);
    return () => window.removeEventListener("eip6963:announceProvider", check);
  }, []);

  return present;
}

/**
 * Three states, because connecting a wallet and proving you own it are now
 * separate: no wallet, a connected wallet that has not signed in, and a
 * signed-in session. The middle state used to be invisible — the button said
 * "connected" while the server still knew nothing about the user.
 *
 * Every failure is rendered. Both `useConnect` and `useSession` report their
 * errors and neither was displayed, so a missing extension, a rejected
 * signature and a failed verification all looked identical: a button that did
 * nothing. A dead control with no explanation is the worst thing to hand
 * someone at the exact moment they are deciding whether the product works.
 *
 * `variant` exists because lime is rationed to one filled button per surface
 * (see Button.tsx). On a Gate screen connecting *is* the single action, so it
 * stays primary; in the sidebar it sits beside "New agent" and has to give up
 * the lime, or the rail shows two filled pills competing for the same eye.
 */
export function ConnectWalletButton({
  variant = "primary",
  shape = "default",
  className = "",
}: {
  variant?: "primary" | "ghost";
  /** `pill` when this sits in a nav bar beside pill-shaped links. */
  shape?: "default" | "pill";
  className?: string;
}) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const session = useSession();
  const hasWallet = useInjectedWallet();

  if (isConnected && address) {
    if (session.state === "signed-in") {
      return (
        <Button
          variant="ghost"
          shape={shape}
          className={className}
          onClick={async () => {
            await session.signOut();
            disconnect();
          }}
        >
          {truncate(address)}
        </Button>
      );
    }

    return (
      <Notice error={session.error}>
        <Button
          variant={variant}
          shape={shape}
          className={className}
          disabled={session.pending || session.state === "loading"}
          onClick={() => void session.signIn()}
        >
          {session.pending ? "Check your wallet…" : "Sign in"}
        </Button>
      </Notice>
    );
  }

  // No wallet in the browser. Nothing this button could do would help, so it
  // stops pretending to be one and points at the fix instead.
  //
  // The link is a vendor-neutral directory rather than one wallet's download
  // page. `injected()` works with any EIP-1193 extension — Rabby, Frame, Brave,
  // Coinbase Wallet and others all connect exactly the same way — so sending
  // everyone to a single vendor would be steering users toward one company for
  // no technical reason, and would contradict the label right above it. The
  // named examples stay in the prose, where they inform without directing.
  if (hasWallet === false) {
    return (
      <div className="flex flex-col items-start gap-[var(--spacing-8)]">
        <a
          href="https://ethereum.org/en/wallets/find-wallet/"
          target="_blank"
          rel="noreferrer noopener"
          className="text-app-body-sm text-lime-phosphor underline underline-offset-4 hover:opacity-80"
        >
          Install a browser wallet
        </a>
        <p className="text-app-body-sm text-white-muted">
          Puno signs in with any Ethereum wallet extension — MetaMask, Rabby and Frame all work.
          Install one, then reload this page.
        </p>
      </div>
    );
  }

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <Notice error={connectError?.message ?? null}>
      <Button
        variant={variant}
        shape={shape}
        className={className}
        disabled={!injected || isPending || hasWallet === null}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </Button>
    </Notice>
  );
}

/// Keeps the button's own layout intact when there is nothing to report, so
/// dropping this in did not change how the sidebar or the gate screens sit.
function Notice({ error, children }: { error: string | null; children: React.ReactNode }) {
  if (!error) return <>{children}</>;
  return (
    <div className="flex flex-col items-start gap-[var(--spacing-8)]">
      {children}
      <p className="text-app-body-sm text-signal-red">{error}</p>
    </div>
  );
}
