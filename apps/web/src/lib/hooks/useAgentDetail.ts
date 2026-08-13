"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

export interface AgentDetail {
  agent: {
    id: string;
    name: string;
    status: string;
    dryRun: boolean;
    agentAddress: string;
    lastTickAt: string | null;
    lastActionAt: string | null;
  };
  vault: {
    id: string;
    address: string;
    ownerAddress: string;
    quoteToken: string;
    network: "mainnet" | "testnet";
  };
  limits: {
    stopLossBps: number | null;
    takeProfitBps: number | null;
    maxReviewIntervalHours: number;
    priceMoveTriggerBps: number;
    maxCallsPerHour: number;
  } | null;
  positions: {
    id: string;
    token: string;
    tokenSymbol: string;
    decimals: number;
    rawBalance: string;
    valueUsd: string;
    entryPriceUsd: string | null;
  }[];
  trades: {
    id: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string | null;
    notionalUsd: string;
    status: "dry_run" | "simulated" | "pending" | "confirmed" | "failed" | "reverted";
    txHash: string | null;
    simulateError: string | null;
    createdAt: string;
  }[];
  signals: {
    id: string;
    triggerReasons: string[];
    escalate: boolean;
    reason: string;
    createdAt: string;
    decision: {
      id: string;
      action: "buy" | "sell" | "hold";
      ticker: string;
      sizePct: string;
      confidence: string;
      thesis: string;
      riskFlags: string[];
      riskVerdict: "accepted" | "rejected";
      riskReason: string | null;
    } | null;
  }[];
  navUsd: number;
}

export function useAgentDetail(agentId: string) {
  const { address, isConnected } = useAccount();

  return useQuery({
    queryKey: ["agent", agentId, address],
    queryFn: async (): Promise<AgentDetail> => {
      const res = await fetch(`/api/agents/${agentId}?owner=${address}`);
      if (!res.ok) throw new Error(`failed to load agent (${res.status})`);
      return res.json();
    },
    enabled: isConnected && !!address && !!agentId,
  });
}
