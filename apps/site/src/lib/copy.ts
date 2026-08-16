import type { BillableEvent } from "@puno/shared";

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

/**
 * The cost ladder, in the order a tick walks it. `key` names the billable event
 * so the amount is read from PRICES_USD at render time; a null key is a step
 * that is genuinely free and has no line in the tariff at all.
 *
 * The prices are deliberately not written here. This section and PricingSection
 * render on the same page, so a hardcoded copy is a contradiction waiting to
 * ship — and it was already shipped: these rows read "~$0.005" and "~$0.025+",
 * which are *our model cost*, while the pricing card three sections below quoted
 * the real $0.01 and $0.50. Besides understating the price of a decision by 20×,
 * printing our cost beside our price publishes the margin between them.
 */
export const COST_TIERS: {
  label: string;
  key: BillableEvent | null;
  lime?: boolean;
  body: string;
}[] = [
  {
    label: "Every tick",
    key: null,
    lime: true,
    body: "Deterministic checks — prices, stop-loss, take-profit, triggers. No model call, ever.",
  },
  {
    label: "On trigger",
    key: "screen",
    body: "Claude Haiku 4.5 screens whether the situation is even worth a full look.",
  },
  {
    label: "On escalation",
    key: "decision",
    body: "Claude Opus 5 only runs when the cheap model decides it's actually warranted.",
  },
  {
    // Not "Rejected · $0": the risk engine vetoes *after* the decision the user
    // has already paid for, so a rejection is this fee not being charged, not
    // the tick becoming free.
    label: "Executed trade",
    key: "trade",
    body: "Charged only when the swap confirms on-chain. A trade the risk engine vetoes, or one that reverts, adds nothing.",
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
 * yet — so this is verifiable guarantees instead of invented quotes. Swap in
 * real testimonials here once there are real ones.
 *
 * Six, not the original three, and the three added are the ones a reader
 * cannot get elsewhere. The competitive review found the oracle floor — the
 * strongest claim this contract can make — advertised nowhere at all, while
 * the page led with "the agent cannot withdraw", which every non-custodial
 * product says. Grid is `md:grid-cols-3`, so six lands as two clean rows.
 *
 * Every line below is a `require` in AgentVault.sol, checked against the
 * source on 2026-08-16 rather than written from memory. Line references are
 * given because a marketing claim about a contract should be falsifiable by
 * whoever reads it.
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
    // executeTrade: `minOut >= _minAcceptableOut(...)` before the swap, then
    // `amountOut >= minOut` after it. Two checks, and the first is what stops
    // the agent naming its own floor.
    title: "A bad fill reverts",
    body: "The vault derives its own floor from the token's Chainlink price and the slippage you allow, refuses any trade proposing less, and re-checks what actually arrived against it afterwards. The agent supplies a number — it cannot lower the bar.",
  },
  {
    // _normalizedPrice: `block.timestamp - updatedAt <= feed.maxStaleness`,
    // per feed, and it reverts. Reached by every path that values anything.
    title: "A stale price stops trading",
    body: "Each feed carries its own freshness window, sized to that feed's heartbeat. If the last answer is older than that, the vault will not value your book or execute anything — it stops rather than acting on a mark it cannot trust.",
  },
  {
    // executeTrade checks `!paused` before allowlists, caps or cooldown.
    title: "The stop is on the contract",
    body: "Pausing is a function on your own vault that only your wallet can call, and trading checks it before anything else. It halts execution at the chain rather than in our software — so it works whether or not we do.",
  },
  {
    title: "The session key expires",
    body: "Every agent key has a countdown built in. Once it lapses, it stops being able to propose anything until the owner re-arms it from the dashboard.",
  },
];
