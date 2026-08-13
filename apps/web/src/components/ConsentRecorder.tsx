"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";

/// Durable half of the geo-gate (DESIGN.md #25) — GeoGateModal blocks the UI
/// client-side; this stamps the same consent server-side, tied to the
/// account, the moment a wallet actually connects (which can only happen
/// after the modal was accepted, since it sits behind a blocking overlay).
export function ConsentRecorder() {
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected || !address) return;
    fetch("/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {
      // Best-effort — the client-side modal flag is still the source of
      // truth for gating the UI; this just makes it durable when it works.
    });
  }, [isConnected, address]);

  return null;
}
