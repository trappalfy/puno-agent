export interface MarketSnapshotEntry {
  symbol: string;
  token: string;
  priceUsd: number;
  stale: boolean;
}

export interface PositionSnapshotEntry {
  symbol: string;
  token: string;
  valueUsd: number;
  entryPriceUsd: number | null;
}

export interface DecisionContext {
  triggerReasons: string[];
  navUsd: number | null;
  quoteBalanceUsd: number;
  prices: MarketSnapshotEntry[];
  positions: PositionSnapshotEntry[];
  recentDecisionsSummary: string;
}

/// The exact bytes returned here are what gets sent as the user message AND
/// stored verbatim as model_calls.input_payload — the replay mechanism
/// (llm/decide.ts replay()) reuses the stored object directly rather than
/// rebuilding it, so byte-identity across original/replay is structural, not
/// coincidental. Key order is fixed by DecisionContext's field order, so this
/// is deterministic across calls with equal input.
export function buildContextMessage(ctx: DecisionContext): string {
  return JSON.stringify(ctx, null, 2);
}
