"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "./ui/Button";
import { useSession } from "@/lib/useSession";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Three states, because connecting a wallet and proving you own it are now
 * separate: no wallet, a connected wallet that has not signed in, and a
 * signed-in session. The middle state used to be invisible — the button said
 * "connected" while the server still knew nothing about the user.
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
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const session = useSession();

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
      <Button
        variant={variant}
        shape={shape}
        className={className}
        disabled={session.pending || session.state === "loading"}
        onClick={() => void session.signIn()}
      >
        {session.pending ? "Check your wallet…" : "Sign in"}
      </Button>
    );
  }

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <Button
      variant={variant}
      shape={shape}
      className={className}
      disabled={!injected || isPending}
      onClick={() => injected && connect({ connector: injected })}
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </Button>
  );
}
