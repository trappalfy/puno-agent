# Competitive review — how other agents are built and how they show their work

Researched 2026-08-14 from vendor pages and comparison write-ups, not from memory. Sources at
the bottom. Where a source did not say something, this file says so rather than filling the gap.

The question was narrow and practical: **how is the agent itself implemented, is everything on
one page or spread across several, and how is the agent's reasoning and its verdict on the
market actually presented.**

---

## The short version

Most of what we built is **table stakes, not differentiation**. Multi-stage LLM pipelines,
streamed reasoning, confidence scores, pre-trade simulation, paper/live modes and equal
treatment of bearish calls are all standard in this category. Two things are genuinely
structural advantages for us, and three gaps are real.

---

## 1. How the agent is implemented

**Multi-stage pipelines are the norm, and ours is on the simple end.**

| Product    | Pipeline                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| HyperAgent | Market Data → **Analyst AI** → **Boss AI** → Executor, with a running cycles counter                                    |
| AgentFloor | Four independent analysts (Fundamentals, Sentiment, News, Technical) → **Bull/Bear debate** → risk desk → final verdict |
| **Puno**   | **L1 Haiku screen → L2 Opus decision → risk engine → simulation**                                                       |

Our two-tier split is the same family of design. What differs is _why_: theirs is about
analytical breadth (more perspectives), ours is about **cost asymmetry** — L1 exists so the
expensive model is not called on every tick. Nobody else describes their staging in cost terms,
which fits: they mostly sell subscriptions, so per-call cost is not the user's problem.

**Execution vs. advice splits the field.** AgentFloor is explicitly research-only and "does not
execute trades". HyperAgent, MetaMask Agent Wallet, Cobo, OKX OnchainOS and Coinbase AgentKit
all execute. We execute — so the honest peer group is the second one.

**Custody: everyone claims non-custodial, but enforcement lives in different places.**

- Coinbase AgentKit and OKX put keys in **TEEs**; limits are enforced in the enclave.
- Cobo and Privy use **MPC** with a policy engine in their infrastructure.
- MetaMask Agent Wallet delegates with spending limits, protocol allowlists and two modes
  (Guard, default and interrupt-heavy; Beast, opt-in and lower-friction).
- Safe + Zodiac enforces in **smart-contract modules** — the closest analogue to us.

**This is our first real structural advantage.** Our limits — `maxNotionalPerTrade`,
`maxDailyNotional`, `maxPositionBps`, `minSecondsBetweenTrades`, the oracle floor — are enforced
by `AgentVault` itself, and `withdraw` is `onlyOwner`. A TEE or an MPC policy engine protects the
user _as long as the operator behaves and stays online_. A contract keeps enforcing if we vanish
or turn hostile. Only Safe is in the same position, and Safe is a general smart account rather
than a trading product.

**Our second advantage is the oracle floor.** Competitors describe pre-trade **simulation**,
Blockaid threat screening and MEV protection. None of the sources describe a
**Chainlink-derived minimum-out enforced by the vault** (`_minAcceptableOut`), nor per-feed
staleness windows. Simulation proves a trade will not revert; it does not prove the price is
sane. Ours refuses to execute below an independently sourced floor. That is a stronger claim and
we do not currently make it anywhere in the product.

---

## 2. One page or several

**Multi-page is what everyone does, and it is not a flaw.**

- **HyperAgent**: homepage, live demo, performance tracking, research docs, comparison tools.
- **AgentFloor**: "distinct functional workspaces rather than a single unified interface" —
  Portfolio Command Center, AI Analysis Workspace, Watchlist & Scheduling.

Our surface is smaller: `/app` (agents), `/app/try`, `/app/agents/[id]`, `/app/settings`,
`/pricing`. That is fewer pages than either.

The thing worth copying is not the page count but **which pages exist**:

- HyperAgent has a **public live demo** page and a **performance/track record** page. Ours
  requires a wallet connection before anything is visible.
- AgentFloor's **AI Analysis Workspace** is a dedicated deep-dive surface separate from the
  portfolio view. Our trial console is closest to this and is arguably better focused.

---

## 3. How reasoning and verdicts are displayed

Everything below is standard across the category. None of it is ours.

- **Structured signal with direction, confidence and plain-language reasoning** — the common
  output shape. HyperAgent surfaces an "AI Conviction Score"; we show action, sizePct,
  confidence and thesis. Same shape.
- **Streaming progress while the analysis runs.** AgentFloor: "Watch the analyst team, bull/bear
  researchers, and risk desk work in real time." HyperAgent has a "Live AI Feed Visualization"
  with a cycles counter and pause. Our stage list is the same idea, less rich.
- **Bearish and rejected calls shown at equal weight.** AgentFloor: "Final verdicts receive equal
  visual weight regardless of direction — both bullish and bearish calls display with full
  supporting rationale." **This is worth noting**: DESIGN.md #15 reads as a distinctive trust
  mechanism, and it is good, but it is not unique. Treat it as a hygiene requirement rather than
  a differentiator.
- **Confidence thresholds as a control**, not just a display — a user can set "Medium" and have
  every low-confidence signal auto-held. We show confidence and do nothing with it. Gap.
- **Paper vs live as a user-facing toggle.** Listed as a standard dashboard control, alongside
  which tokens are tradable, per-trade and per-day spend, and whether execution needs approval.
  We have `agents.dry_run` in the database and a badge, and no way for a user to flip it.
- **Explicit disagreement surfacing.** AgentFloor's "Markov Regime Check" marks the AI narrative
  against quantitative signals as _Confirms / Conflicts / Neutral_. We compute something adjacent
  — the Haiku/Opus comparison replay — and show the user nothing.
- **Audit trails.** Cobo records "Who, What, When, Why, and Which Rule" per decision, with
  human-in-the-loop approvals via Web, Mobile, Telegram and Discord. We have an `audit_log` table
  that no page reads.

---

## Gaps worth acting on, in order

1. **No public track record.** HyperAgent advertises a "live on-chain track record and published
   exit logic". We have executed exactly one real trade and show it nowhere. For a product whose
   entire pitch is "trade with proof, not promises", this is the largest hole — and unlike the
   others it cannot be closed by writing code, only by accumulating history. Start recording now.
2. **Nothing is visible before connecting a wallet.** HyperAgent has a public live demo.
   Our free tier is lower-friction than a signup _once you have a wallet_, but a visitor with no
   wallet sees nothing at all. A read-only public demo of the demo vault would cost us nothing —
   the data already exists.
3. **No approval mode.** "Require approval before executing" is a standard control we lack
   entirely. Our answer is the on-chain policy, which is stronger in principle, but a first-time
   user will not feel that; a Guard-Mode equivalent is cheap reassurance.
4. **`dry_run` is not user-settable.** It is now honoured by the worker and shown as a badge, but
   a user cannot choose paper mode. Competitors treat this as basic.
5. **The comparison replay is invisible.** We pay for a Haiku replay of Opus decisions and use it
   only for our own margin analysis. AgentFloor turns exactly this kind of disagreement into a
   trust feature.
6. **The oracle floor is unadvertised.** Our strongest safety claim appears nowhere in the UI or
   on the landing page.

## What not to change

- The vault-enforced policy. It is the one thing that is structurally better than the TEE/MPC
  majority, not merely different.
- Equal weight for rejected decisions. Not unique, but abandoning it would put us below the field.
- The two-tier split. It is the reason per-action pricing works at 95.6% margin.

---

## Confidence and limits of this review

Vendor pages describe what vendors choose to describe. Layout details for MetaMask Agent Wallet's
per-action view were **not disclosed** in the source used, and are marked as unknown rather than
guessed. No product was used hands-on. Pricing was not compared. Treat the "nobody else does X"
statements as "not described in these sources", which is weaker than "does not exist".

## Sources

- [Agentic Wallets Comparison 2026 — Cobo](https://www.cobo.com/post/the-definitive-comparison-of-top-agentic-wallets-for-active-crypto-traders)
- [HyperAgent — AI Trading Bot for Hyperliquid, Non-Custodial](https://hyperagent.ch/)
- [MetaMask's Agent Wallet lets AI trade without giving it the keys — Cointribune](https://www.cointribune.com/en/metamasks-agent-wallet-lets-ai-trade-without-giving-it-the-keys-to-your-crypto/)
- [trading-command-center / AgentFloor — GitHub](https://github.com/saketnayak/trading-command-center)
- [Agentic Wallet for Hyperliquid: AI Trading Guide 2026 — Cobo](https://www.cobo.com/post/agentic-wallet-hyperliquid-ai-trading)
- [Delegated Wallets Let AI Agents Spend Without Controlling All Funds — CryptoDaily](https://cryptodaily.co.uk/2026/08/delegated-wallets-ai-agents)
- [AI Trading Agent Development: 2026 Architecture Guide — Ampcome](https://www.ampcome.com/post/ai-trading-agent-development)
- [Best AI Trading Agents in 2026 — Pinggy](https://pinggy.io/blog/best_ai_trading_agents/)
