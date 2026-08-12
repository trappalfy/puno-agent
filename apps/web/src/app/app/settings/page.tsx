"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { TIERS } from "@puno/shared";

export default function SettingsPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["quota", address],
    queryFn: async () => {
      const res = await fetch(`/api/billing/quota?owner=${address}`);
      if (!res.ok) throw new Error("failed to load account");
      return res.json() as Promise<{ tier: keyof typeof TIERS; hasByokKey: boolean }>;
    },
    enabled: isConnected && !!address,
  });

  if (!isConnected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
        <h1 className="text-app-heading font-denim-ink font-semibold text-white">
          Connect a wallet to see your settings
        </h1>
        <ConnectWalletButton />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-app-heading font-denim-ink font-semibold text-white">Settings</h1>

      <Card className="mt-[var(--spacing-24)]">
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">Plan</h2>
        <p className="mt-[var(--spacing-8)] text-app-body text-white-muted">
          Current tier: <span className="text-white">{data ? TIERS[data.tier].name : "…"}</span>
        </p>
      </Card>

      <Card className="mt-[var(--spacing-16)]">
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">
          Bring your own Anthropic key
        </h2>
        <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
          Stored encrypted at rest, never logged, never returned by any API response. Switches your
          tier to BYOK — Puno-side quota no longer applies.
        </p>
        <p className="mt-[var(--spacing-8)] text-num-xs text-white-faint font-jetbrains-mono">
          {data?.hasByokKey ? "A key is currently set." : "No key set yet."}
        </p>
        <div className="mt-[var(--spacing-16)] flex gap-[var(--spacing-12)]">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            className="flex-1 rounded-[var(--radius-tags)] border border-white/25 bg-transparent px-[var(--spacing-12)] py-[var(--spacing-8)] text-app-body text-white outline-none focus:border-lime-phosphor"
          />
          <Button
            variant="primary"
            disabled={!apiKey}
            onClick={async () => {
              setStatus(null);
              const res = await fetch("/api/billing/byok", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ walletAddress: address, apiKey }),
              });
              const json = await res.json();
              setStatus(res.ok ? "Saved." : (json.error ?? "Failed to save."));
              if (res.ok) {
                setApiKey("");
                void queryClient.invalidateQueries({ queryKey: ["quota", address] });
              }
            }}
          >
            Save key
          </Button>
        </div>
        {data?.hasByokKey && (
          <Button
            variant="ghost"
            className="mt-[var(--spacing-12)]"
            onClick={async () => {
              await fetch(`/api/billing/byok?owner=${address}`, { method: "DELETE" });
              void queryClient.invalidateQueries({ queryKey: ["quota", address] });
            }}
          >
            Remove key
          </Button>
        )}
        {status && (
          <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">{status}</p>
        )}
      </Card>
    </div>
  );
}
