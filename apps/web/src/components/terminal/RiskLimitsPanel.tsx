"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import type { Address } from "viem";
import { agentVaultAbi } from "@puno/shared";
import { Card } from "../ui/Card";
import type { AgentDetail } from "@/lib/hooks/useAgentDetail";

function usd(value: bigint | undefined): string {
  if (value === undefined) return "…";
  return `$${Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function bps(value: bigint | number | undefined): string {
  if (value === undefined || value === null) return "—";
  return `${(Number(value) / 100).toFixed(2)}%`;
}

/// DESIGN.md #19 — every limit explicitly marked as on-chain-enforced or
/// off-chain-only, since risk.ts / AgentVault.sol only enforce half of them
/// (see packages/shared/src/db/schema.ts's comment on the `limits` table).
export function RiskLimitsPanel({
  vaultAddress,
  offChainLimits,
}: {
  vaultAddress: Address;
  offChainLimits: AgentDetail["limits"];
}) {
  const contract = { address: vaultAddress, abi: agentVaultAbi } as const;
  const { data } = useReadContracts({
    contracts: [
      { ...contract, functionName: "maxNotionalPerTrade" },
      { ...contract, functionName: "maxDailyNotional" },
      { ...contract, functionName: "maxPositionBps" },
      { ...contract, functionName: "minSecondsBetweenTrades" },
      { ...contract, functionName: "maxSlippageBps" },
    ],
  });

  const [maxNotional, maxDaily, maxPositionBps, minSeconds, maxSlippageBps] = data ?? [];

  return (
    <Card>
      <h3 className="text-app-heading-sm font-denim-ink font-semibold text-white">Risk limits</h3>

      <div className="mt-[var(--spacing-16)]">
        <div className="text-num-xs uppercase text-lime-phosphor font-jetbrains-mono">
          On-chain — enforced by the vault contract
        </div>
        <dl className="mt-[var(--spacing-8)] flex flex-col gap-[var(--spacing-8)]">
          <Row label="Max per trade" value={usd(maxNotional?.result as bigint | undefined)} />
          <Row label="Max daily notional" value={usd(maxDaily?.result as bigint | undefined)} />
          <Row
            label="Max position share"
            value={bps(maxPositionBps?.result as bigint | undefined)}
          />
          <Row
            label="Cooldown between trades"
            value={minSeconds?.result !== undefined ? `${minSeconds.result.toString()}s` : "…"}
          />
          <Row
            label="Max slippage vs. oracle"
            value={bps(maxSlippageBps?.result as bigint | undefined)}
          />
        </dl>
      </div>

      <div className="mt-[var(--spacing-24)]">
        <div className="text-num-xs uppercase text-white-faint font-jetbrains-mono">
          Off-chain — worker-side only, not contract-enforced
        </div>
        <dl className="mt-[var(--spacing-8)] flex flex-col gap-[var(--spacing-8)]">
          <Row
            label="Stop-loss"
            value={
              offChainLimits?.stopLossBps != null ? bps(offChainLimits.stopLossBps) : "Not set"
            }
          />
          <Row
            label="Take-profit"
            value={
              offChainLimits?.takeProfitBps != null ? bps(offChainLimits.takeProfitBps) : "Not set"
            }
          />
          <Row
            label="Max review interval"
            value={offChainLimits ? `${offChainLimits.maxReviewIntervalHours}h` : "…"}
          />
          <Row
            label="Price-move trigger"
            value={offChainLimits ? bps(offChainLimits.priceMoveTriggerBps) : "…"}
          />
          <Row
            label="Max L1/L2 calls per hour"
            value={offChainLimits ? String(offChainLimits.maxCallsPerHour) : "…"}
          />
        </dl>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-app-body-sm text-white-muted">{label}</dt>
      <dd className="text-num-sm text-white font-jetbrains-mono tabular-nums">{value}</dd>
    </div>
  );
}
