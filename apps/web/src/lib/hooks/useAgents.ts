"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchJson, retryUnlessDenied } from "./fetchJson";

export interface AgentListItem {
  id: string;
  name: string;
  status: string;
  dryRun: boolean;
  /// "trial" agents run on the shared demo vault, which this account does not
  /// own. Their navUsd/pnlUsd describe that vault, not the user's holdings.
  kind: "live" | "trial";
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
    queryFn: () =>
      fetchJson<{
        account: { id: string; balanceUsd: number };
        agents: AgentListItem[];
      }>("/api/agents"),
    enabled: isConnected && !!address,
    retry: retryUnlessDenied,
  });
}
