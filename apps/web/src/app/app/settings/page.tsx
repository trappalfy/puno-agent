"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useBalance } from "@/lib/hooks/useBalance";

export default function SettingsPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const { data } = useBalance();

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
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">Credit</h2>
        <p className="mt-[var(--spacing-8)] text-app-body text-white-muted">
          Balance:{" "}
          <span className="text-white font-jetbrains-mono tabular-nums">
            {data ? `$${data.balanceUsd.toFixed(2)}` : "…"}
          </span>
          {data && !data.usesOwnKey && (
            <span className="text-white-faint"> · ≈ {data.decisionsRemaining} decisions</span>
          )}
        </p>
        <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
          You pay per action, not per month. See{" "}
          <a href="/pricing" className="text-lime-phosphor underline">
            pricing
          </a>{" "}
          to top up.
        </p>
      </Card>

      <Card className="mt-[var(--spacing-16)]">
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">
          Bring your own Anthropic key
        </h2>
        <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
          Stored encrypted at rest, never logged, never returned by any API response. With a key set
          you aren&rsquo;t charged for the agent&rsquo;s thinking — only for trades it executes.
        </p>
        <p className="mt-[var(--spacing-8)] text-num-xs text-white-faint font-jetbrains-mono">
          {data?.usesOwnKey ? "A key is currently set." : "No key set yet."}
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
                body: JSON.stringify({ apiKey }),
              });
              const json = await res.json();
              setStatus(res.ok ? "Saved." : (json.error ?? "Failed to save."));
              if (res.ok) {
                setApiKey("");
                void queryClient.invalidateQueries({ queryKey: ["balance", address] });
              }
            }}
          >
            Save key
          </Button>
        </div>
        {data?.usesOwnKey && (
          <Button
            variant="ghost"
            className="mt-[var(--spacing-12)]"
            onClick={async () => {
              await fetch("/api/billing/byok", { method: "DELETE" });
              void queryClient.invalidateQueries({ queryKey: ["balance", address] });
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
