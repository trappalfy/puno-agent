"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { useSession } from "@/lib/useSession";
import { ConnectWalletButton } from "./ConnectWalletButton";

/// Connecting a wallet and signing in are two different things, and every page
/// behind the session needs to say which one is missing.
///
/// Without this the pages checked `isConnected` only. A visitor who connected
/// but never signed the SIWE message sailed past the gate into a data fetch
/// that answered 401 in twelve milliseconds — which React Query then retried
/// three times with backoff before rendering "Couldn't load your agents. Try
/// again." Nothing was slow and nothing was broken: the answer was "you are not
/// signed in", and it was reported as a mystery failure a minute later.
export function WalletGate({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const session = useSession();

  if (!isConnected) {
    return (
      <Gate
        title="Connect a wallet to continue"
        body="Your wallet is your login. Nothing is deployed and nothing is spent by connecting."
      />
    );
  }

  // `loading` is the initial session read, not a failure — showing the sign-in
  // prompt during it would flash a call to action at someone already signed in.
  if (session.state === "loading") {
    return <div className="h-64 animate-pulse rounded-[var(--radius-cards)] bg-vault-floor" />;
  }

  if (session.state === "signed-out") {
    return (
      <Gate
        title="Sign in to continue"
        body="One signature proves you control this wallet. It costs no gas, sends no transaction and approves nothing — it is what lets the server tell your agents from anyone else's."
      />
    );
  }

  return <>{children}</>;
}

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
      <span className="h-2 w-2 rounded-full bg-lime-phosphor" aria-hidden />
      <h1 className="text-app-heading font-denim-ink font-semibold text-white">{title}</h1>
      <p className="max-w-md text-app-body text-white-muted">{body}</p>
      <ConnectWalletButton />
    </div>
  );
}
