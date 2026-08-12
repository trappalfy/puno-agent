export const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#safety", label: "Safety" },
  { href: "#pricing", label: "Pricing" },
];

// Every color here is a real DESIGN.md token, not a lookalike — the palette
// is strictly green-monochrome plus exactly two signal colors (see Do's and
// Don'ts), so a fourth strategy dot reaches for signal-amber rather than
// inventing a new hue like blue that has no place in the system at all.
export const STRATEGIES = [
  { name: "Momentum", color: "var(--color-lime-phosphor)" },
  { name: "Mean reversion", color: "var(--color-fern)" },
  { name: "Breakout", color: "var(--color-canopy-mid)" },
  { name: "Hedge", color: "var(--color-signal-amber)" },
];

/** The console mock's signal feed — see ConsoleMock.tsx's middle column. */
export const SIGNALS = [
  {
    source: "TSLA momentum",
    subject: "Long entry proposed — 2.1% of vault",
    preview: "Price broke the 20-period high with volume 1.8x the 30d average...",
    time: "9:41 AM",
    unread: true,
    active: true,
  },
  {
    source: "Risk engine",
    subject: "Rejected: daily turnover cap",
    preview: "Proposed trade would exceed the 15% daily turnover limit...",
    time: "8:12 AM",
    unread: true,
  },
  {
    source: "AAPL mean reversion",
    subject: "Position closed — take-profit hit",
    preview: "Exited at +3.4% after 6 hours, per the configured target.",
    time: "Yesterday",
  },
  {
    source: "Vault",
    subject: "Daily limit reset",
    preview: "Turnover and per-trade caps refreshed for the new session.",
    time: "Yesterday",
  },
  {
    source: "Session key",
    subject: "Expiring in 4 hours",
    preview: "Re-arm from the dashboard to keep the agent proposing trades.",
    time: "Mon",
  },
  {
    source: "SOL breakout",
    subject: "Signal screened, no escalation",
    preview: "Haiku 4.5 found no setup worth a flagship-model look.",
    time: "Mon",
  },
];

export const COST_TIERS = [
  {
    label: "Every tick",
    price: "$0",
    lime: true,
    body: "Deterministic checks — prices, stop-loss, take-profit, triggers. No model call, ever.",
  },
  {
    label: "On trigger",
    price: "~$0.005",
    body: "Claude Haiku 4.5 screens whether the situation is even worth a full look.",
  },
  {
    label: "On escalation",
    price: "~$0.025+",
    body: "Claude Opus 5 only runs when the cheap model decides it's actually warranted.",
  },
  {
    label: "Rejected",
    price: "$0",
    body: "The risk engine vetoes anything outside your on-chain limits before it ever executes.",
  },
];

export const BUILT_ON = [
  "Robinhood Chain",
  "Anthropic Claude",
  "Foundry",
  "viem",
  "wagmi",
  "Drizzle",
  "Postgres",
  "Stripe",
];

/**
 * Replaces the source prompt's testimonials. Naming real companies as
 * customers would be false — the product is testnet-only with no user base
 * yet — so this is verifiable guarantees in the same three-card layout
 * instead of invented quotes. Swap in real testimonials here once there are
 * real ones.
 */
export const GUARANTEES = [
  {
    title: "The agent key cannot withdraw",
    body: "Withdrawal only accepts a signature from the vault owner's wallet. The agent's key is scoped to proposing trades within the router and token allowlist — that function doesn't exist for it.",
  },
  {
    title: "Limits are enforced on-chain",
    body: "Per-trade cap, daily turnover, max position share — written into the vault contract. The contract itself reverts a trade that exceeds them, regardless of what the agent proposes.",
  },
  {
    title: "The session key expires",
    body: "Every agent key has a countdown built in. Once it lapses, it stops being able to propose anything until the owner re-arms it from the dashboard.",
  },
];
