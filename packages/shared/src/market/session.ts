/// Is the equity market open, judged from the oracles themselves?
///
/// **Deliberately not a trading calendar.** A hardcoded holiday table is wrong
/// the first time an exchange adds a half-day, closes for a funeral, or changes
/// its DST transition, and it is wrong silently — the code keeps answering
/// confidently. The feeds are the ground truth we actually depend on: the vault
/// reverts on a stale feed whatever a calendar believes, so the only question
/// worth asking is whether the feeds are publishing.
///
/// Measured 2026-08-15 (`EQUITY-FEED-HOURS-2026-08-15.md`): on a Saturday every
/// equity feed on chain 4663 was 25–30 h old, last published inside Friday's US
/// cash session, while USDG, ETH and BTC had all published four hours earlier.
/// The equity/quote split is what makes this readable — a closed market makes
/// equities stale and leaves the quote fresh, whereas an oracle outage takes
/// everything down together.
export type MarketState =
  /// Every allowlisted equity has a fresh mark. Trading can proceed.
  | "open"
  /// Every equity is stale while the quote feed is fine — the signature of a
  /// closed session. Nothing is broken and nothing can trade.
  | "closed"
  /// Some equities fresh, some not, or the quote feed is stale too. Never
  /// reported as "closed": claiming market hours when the evidence is "the
  /// oracles are unwell" would send someone to look at a clock instead of at
  /// the feeds.
  | "degraded"
  /// The vault allowlists no equity at all, so there is no market to be in.
  /// A configuration state, not a temporal one.
  | "no-equities";

export interface FeedFreshness {
  symbol: string;
  stale: boolean;
}

export interface MarketSession {
  state: MarketState;
  /// Symbols whose feed is currently stale, for a message that names names.
  staleSymbols: string[];
  freshSymbols: string[];
}

export function classifyMarket(input: {
  quoteStale: boolean;
  equities: FeedFreshness[];
}): MarketSession {
  const staleSymbols = input.equities.filter((e) => e.stale).map((e) => e.symbol);
  const freshSymbols = input.equities.filter((e) => !e.stale).map((e) => e.symbol);

  if (input.equities.length === 0) {
    return { state: "no-equities", staleSymbols, freshSymbols };
  }
  if (staleSymbols.length === 0) {
    return { state: "open", staleSymbols, freshSymbols };
  }
  if (staleSymbols.length === input.equities.length && !input.quoteStale) {
    return { state: "closed", staleSymbols, freshSymbols };
  }
  return { state: "degraded", staleSymbols, freshSymbols };
}

/// One sentence a person can act on, in the product's own voice.
///
/// The point of this whole module: before it, a closed market surfaced as
/// *"NAV unavailable — on-chain nav() would currently revert"*, which is
/// accurate, useless, and reads as a fault in our software rather than a
/// Saturday.
export function describeMarket(session: MarketSession): string {
  switch (session.state) {
    case "open":
      return "Market open — every price the vault needs is current.";
    case "closed":
      return "Market closed. Equity oracles only publish during the US session, so the vault has no current mark to trade against. The agent resumes when the market reopens.";
    case "degraded":
      return session.staleSymbols.length === 1
        ? `No current price for ${session.staleSymbols[0]}. The agent will not trade it until its feed publishes again.`
        : `No current price for ${session.staleSymbols.join(", ")}. The agent will not trade those until their feeds publish again.`;
    case "no-equities":
      return "This vault allows no equities, so there is nothing for the agent to trade. Add them to its allowlist to put it to work.";
  }
}

/// Whether a tick should spend money on a model call.
///
/// `closed` and `no-equities` are both certainties, not probabilities: no
/// decision the model could reach would survive `risk.ts`, because `_nav()`
/// reverts on a stale feed and an unlisted token is refused outright. Paying a
/// screening fee to be told that is charging the user for our own failure to
/// check the clock.
///
/// `degraded` still ticks — a vault with three equities and one dead feed can
/// legitimately trade the other two.
export function shouldSkipTick(session: MarketSession): boolean {
  return session.state === "closed" || session.state === "no-equities";
}
