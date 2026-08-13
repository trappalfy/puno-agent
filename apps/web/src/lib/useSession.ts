"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { buildSiweMessage, getNetwork } from "@puno/shared";

const network = getNetwork("testnet"); // testnet-only until a separate mainnet decision

export type SessionState = "loading" | "signed-out" | "signed-in";

/**
 * Wallet connection and sign-in are two different things now.
 *
 * Connecting proves nothing to the server — the browser just knows an address.
 * Signing in proves control of it, via one EIP-4361 signature, and yields the
 * cookie every API route reads identity from. This hook owns that second step
 * and the state in between, so components can tell "no wallet" apart from
 * "wallet connected but not proven".
 *
 * The signature costs no gas and approves no transaction; the statement in the
 * signed message says so, since that is the only thing the user sees.
 */
export function useSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [state, setState] = useState<SessionState>("loading");
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const json = (await res.json()) as { address: string | null };
      setSessionAddress(json.address);
      setState(json.address ? "signed-in" : "signed-out");
    } catch {
      setSessionAddress(null);
      setState("signed-out");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A session for one wallet must not survive switching to another, or the UI
  // would show account A's agents while the wallet is showing address B.
  const mismatched =
    state === "signed-in" &&
    isConnected &&
    !!address &&
    !!sessionAddress &&
    address.toLowerCase() !== sessionAddress;

  const signIn = useCallback(async () => {
    if (!address) return;
    setPending(true);
    setError(null);
    try {
      const nonceRes = await fetch("/api/auth/nonce");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const issuedAt = new Date().toISOString();
      const message = buildSiweMessage({
        domain: window.location.host,
        address,
        uri: window.location.origin,
        chainId: network.chainId,
        nonce,
        issuedAt,
      });

      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature, issuedAt }),
      });
      if (!verifyRes.ok) {
        const json = (await verifyRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "sign-in failed");
      }
      await refresh();
    } catch (err) {
      // A user dismissing the wallet prompt is a choice, not a failure worth
      // shouting about.
      const msg = (err as Error).message;
      setError(/rejected|denied/i.test(msg) ? null : msg);
    } finally {
      setPending(false);
    }
  }, [address, signMessageAsync, refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    await refresh();
  }, [refresh]);

  return {
    state: mismatched ? ("signed-out" as const) : state,
    sessionAddress,
    signIn,
    signOut,
    pending,
    error,
    refresh,
  };
}
