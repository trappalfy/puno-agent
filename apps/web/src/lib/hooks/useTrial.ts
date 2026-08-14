"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";

export type TrialBlockedReason =
  | "no_demo_vault"
  | "already_used"
  | "insufficient_credit"
  | "in_flight";

export interface TrialStatus {
  canRun: boolean;
  reason: TrialBlockedReason | null;
  costUsd: number;
  balanceUsd: number;
  decisionsRemaining: number;
  run: {
    id: string;
    status: "pending" | "running" | "done" | "failed";
    error: string | null;
    createdAt: string;
  } | null;
  signal: {
    escalate: boolean;
    reason: string;
    triggerReasons: string[];
    createdAt: string;
  } | null;
  decision: {
    action: "buy" | "sell" | "hold";
    ticker: string;
    sizePct: string;
    confidence: string;
    thesis: string;
    riskFlags: string[];
    riskVerdict: "accepted" | "rejected";
    riskReason: string | null;
    createdAt: string;
  } | null;
  trade: {
    status: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minOut: string;
    simulateError: string | null;
  } | null;
}

/// Polls only while a run is in flight.
///
/// The worker claims queued runs every couple of seconds and an L2 decision
/// takes several more, so there is a real window where the answer changes
/// underneath the page. Once the run settles there is nothing left to watch —
/// polling a finished trial forever would be a request per second per open tab
/// for a row that will never change again.
const IN_FLIGHT_POLL_MS = 1_500;

export function useTrial() {
  const { address, isConnected } = useAccount();

  return useQuery({
    queryKey: ["trial", address],
    queryFn: async (): Promise<TrialStatus> => {
      const res = await fetch("/api/trial/status");
      if (!res.ok) throw new Error(`failed to load trial status (${res.status})`);
      return res.json();
    },
    enabled: isConnected && !!address,
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status === "pending" || status === "running" ? IN_FLIGHT_POLL_MS : false;
    },
  });
}

export function useStartTrial() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/trial/run", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The route answers 402 for both "used up" and "too little credit" —
        // same place in the funnel, different wording — so the reason travels
        // in the body rather than the status code.
        throw new Error(body.error ?? `could not start the run (${res.status})`);
      }
      return body as { runId: string; status: string };
    },
    onSuccess: () => {
      // Flip the query straight to a pending run so polling starts on this
      // render rather than after the next idle refetch.
      void queryClient.invalidateQueries({ queryKey: ["trial", address] });
    },
  });
}
