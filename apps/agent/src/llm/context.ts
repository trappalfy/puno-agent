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

export interface RecentDecisionEntry {
  action: string;
  ticker: string;
  sizePct: string;
  confidence: string;
  thesis: string;
  riskVerdict: string;
  tradeStatus: string | null;
  createdAt: Date;
}

/// Longest slice of a thesis carried into the summary. Three decisions ride
/// in every screening call, so this is paid on every triggered tick — enough
/// to convey the reasoning, not enough to re-litigate it.
const THESIS_CHARS = 180;

function agoPhrase(then: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/// What actually became of the decision. The screening model treats "acted"
/// and "intended but nothing happened" very differently, and only the second
/// leaves an open thread worth escalating on.
function outcomePhrase(entry: RecentDecisionEntry): string {
  if (entry.riskVerdict === "rejected") return "rejected by the risk limits, no trade placed";
  if (entry.tradeStatus === null) return "no trade placed";
  switch (entry.tradeStatus) {
    case "confirmed":
      return "filled on-chain";
    case "dry_run":
      return "NOT executed — the agent was in dry-run mode, so the position was never opened";
    case "simulated":
      return "NOT executed — the trade would have reverted on-chain";
    case "failed":
      return "NOT executed — the transaction failed";
    default:
      return `trade status: ${entry.tradeStatus}`;
  }
}

/// Renders `DecisionContext.recentDecisionsSummary`: the agent's own memory of
/// what it recently decided and whether it stuck.
///
/// The screening prompt promises the model "a short summary of the agent's
/// most recent decisions" and refuses to escalate on a token the vault "holds
/// zero of and has no stated interest in". Stated interest lives here and
/// nowhere else, so an empty string leaves an agent with an empty portfolio
/// unable to escalate on anything, permanently.
export function formatRecentDecisions(entries: RecentDecisionEntry[], now = new Date()): string {
  if (entries.length === 0) return "No prior decisions — this agent has not traded yet.";

  return entries
    .map((entry) => {
      const size = Number(entry.sizePct).toFixed(0);
      const confidence = Number(entry.confidence).toFixed(2);
      const thesis =
        entry.thesis.length > THESIS_CHARS
          ? `${entry.thesis.slice(0, THESIS_CHARS).trimEnd()}…`
          : entry.thesis;
      const head =
        entry.action === "hold"
          ? `Held ${entry.ticker}`
          : `Decided to ${entry.action} ${entry.ticker} at ${size}% of available balance`;
      return `${head} ${agoPhrase(entry.createdAt, now)}, confidence ${confidence} — ${outcomePhrase(entry)}. Thesis: ${thesis}`;
    })
    .join("\n");
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
