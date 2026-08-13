"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

export interface AgentListItem {
  id: string;
  name: string;
  status: string;
  dryRun: boolean;
  agentAddress: string;
  lastTickAt: string | null;
  lastActionAt: string | null;
  vaultAddress: string;
  network: "mainnet" | "testnet";
  navUsd: number;
  pnlUsd: number;
}

export function useAgents() {
  const { address, isConnected } = useAccount();

  return useQuery({
    queryKey: ["agents", address],
    queryFn: async (): Promise<{
      account: { id: string; balanceUsd: number };
      agents: AgentListItem[];
    }> => {
      const res = await fetch(`/api/agents?owner=${address}`);
      if (!res.ok) throw new Error(`failed to load agents (${res.status})`);
      return res.json();
    },
    enabled: isConnected && !!address,
  });
}
