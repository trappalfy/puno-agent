"use client";

import { useState } from "react";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/// DESIGN.md 1.6/#9-10: center-truncated mono address, click to copy, second
/// icon opens the explorer. `kind: "tx"` adds the status dot from #10.
export function AddressChip({
  address,
  explorerBaseUrl,
  kind = "address",
}: {
  address: string;
  explorerBaseUrl: string;
  kind?: "address" | "tx";
}) {
  const [copied, setCopied] = useState(false);

  return (
    <span className="inline-flex items-center gap-[var(--spacing-8)] font-jetbrains-mono text-num-sm text-white">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        title={copied ? "Copied" : "Copy"}
        className="hover:text-lime-phosphor"
      >
        {truncate(address)}
      </button>
      <a
        href={`${explorerBaseUrl}/${kind === "tx" ? "tx" : "address"}/${address}`}
        target="_blank"
        rel="noreferrer"
        className="text-white-faint hover:text-lime-phosphor"
        aria-label="View in explorer"
      >
        ↗
      </a>
    </span>
  );
}
