# Density review — what competitors' surfaces do better, and what was changed here

Researched 2026-08-14 by fetching live pages, not from memory. Sources at the bottom. The
brief was narrow: **visual and mechanical advantages of their landing/product surfaces over
ours**, then apply what applies. The complaint being answered: our product surfaces are
"забиты" — the agent pages emit a wall of information and the eye has nowhere to land.

This is a review of _density and sequencing_, not of the palette. Nothing here changes a
DESIGN.md token.

---

## The one mechanism we did not have

Every source, vendor and design-guidance alike, converges on the same thing: **progressive
disclosure**. Show the conclusion; keep the evidence one click away.

- HyperAgent expands most sections but puts its FAQ behind accordions, and its hero carries
  exactly **one message and two CTAs** — "Start Free Trial" and "Live Track Record".
- Trading-app guidance is explicit that the split is by _audience_: Bloomberg-terminal users
  "require maximum density and accept sacrificed whitespace"; retail investors need
  "progressive disclosure, clean typography, and enough whitespace" instead.
- The ordering rule is stated the same way twice: "performance summaries lead before detailed
  asset allocation breakdowns — progressive disclosure prevents analytics from overwhelming
  users", and advanced controls belong "in expandable secondary controls, not primary
  interface".

**We had built the Bloomberg version for an audience that has not arrived yet.** Our terminal
density is correct as an aesthetic and correct for a user with five agents and a routine. It
is wrong as a first, second and tenth impression, which is the only kind of impression we can
currently make — we have no users with a routine.

That is the whole finding. The palette is not the problem; the _sequencing_ is.

---

## Measured: what our agent page asked the eye to do

`/app/agents/[id]` before this change rendered, all expanded, all at once:

| Block                                                   | Data points                  |
| ------------------------------------------------------- | ---------------------------- |
| Header — name, status dot, network badge, vault address | 4                            |
| Metric tiles — NAV, unrealized P&L, last tick           | 3                            |
| Kill switch card                                        | 1 control + 2 lines of prose |
| Session key card — address, expiry, revoke              | 3                            |
| Risk limits panel — 5 on-chain + 5 off-chain rows       | **10**                       |
| Positions table                                         | n rows                       |
| Reasoning — every signal ever, each fully expanded      | n × ~7                       |
| Trades table                                            | n rows                       |

Roughly **30 fixed data points before a single row of history**, seven competing headings, and
no element with more visual weight than any other. Nothing on that page answered the question
a person actually arrives with, which is _what did my agent just decide, and why_.

Worse, the answer to that question was the **furthest down the page** — the newest reasoning
card sat below the risk limits and the positions table.

---

## What was changed

### 1. The verdict leads (`agents/[id]/page.tsx`)

The latest decision is now the first thing under the header: action, ticker, size, confidence,
the risk verdict, and the thesis — one card, full width, no competition. Everything that used
to sit above it (limits, keys, tables) now sits below it, collapsed.

This is the "performance summaries lead" rule applied literally.

### 2. Progressive disclosure everywhere else (`ui/Disclosure.tsx`)

A new `<details>`-based primitive. Each collapsed section carries a **one-line summary that is
worth reading on its own** — the point is not to hide the data but to answer the section's
question in the header so most visits never need to open it:

| Section           | Collapsed summary               |
| ----------------- | ------------------------------- |
| Risk limits       | `5 on-chain · max $2,500/trade` |
| Session key       | `29d 4h remaining` / `revoked`  |
| Positions         | `3 · $12,481.20`                |
| Trade history     | `7 · 5 confirmed`               |
| Earlier decisions | `12 earlier`                    |

Built on `<details>`/`<summary>` rather than React state on purpose: it is keyboard-operable
and screen-reader-announced with no ARIA of ours to get wrong, it survives being rendered
before hydration, and browser find-in-page opens a closed section that contains the match.

### 3. The kill switch does _not_ collapse

It moved **up**, into the page header, as a persistent control next to the agent's name.

This is the one place the density rule and the safety rule disagree, and safety wins:
"the trade button must be reachable in one tap from anywhere in the experience — not buried
inside a menu." Our equivalent of that button is the one that stops trading. A pause control
behind a disclosure triangle is a worse product no matter how clean the page looks.

### 4. Reasoning history collapses to rows, latest stays open

The newest signal renders in full, always — accepted or rejected, identically. Older ones
collapse to a single row: timestamp, verdict chip, `BUY AAPL`. Opening one reveals the same
full card.

**This was checked against DESIGN.md #15** ("rejected signals render with the same visual
weight as accepted ones, never grayed out or hidden"). The rule holds: collapse depends only
on _recency_, never on verdict, the chip colour and size are identical in the collapsed row,
and the newest decision is expanded whether it was accepted or rejected. A rejection is never
the thing that gets folded away.

### 5. The trial console leads with the verdict too

The header prose dropped from 58 words to a single line; the detail moved into a collapsed
"What actually runs" section. The decision card is now the visual lead once a run finishes,
and the stage list collapses to a one-line "Done · 4 stages" after the run rather than
remaining a permanent five-row block.

---

## What we do _not_ copy

**Fabricated live-looking numbers.** HyperAgent's hero renders "Connecting to Redis…", a
latency figure and a live execution log. Our `CostRouting` section already carries
`Today · 1,842 ticks routed`, which is invented, and `ConsoleMock` is labelled "Illustrative —
not a real position" while that number is not. For a product whose pitch is "trade with proof,
not promises", an unlabelled fake statistic is the single most expensive thing on the page to
be caught on. **Not changed here — flagged as a decision for the owner**, since it is copy, not
layout: either label it or replace it with the real counter.

**Section count.** HyperAgent runs 10–11 sections; ours runs 8. We were never the denser
landing page. The problem was never how many sections the marketing site has — it was how much
the _product_ shows at once, which is why nothing in `apps/site` was restructured.

---

## Limits of this review

Vendor pages were read as rendered markdown, not used hands-on; layout judgements about
spacing and rhythm come from the structure of the page, not from pixel measurement.
`arma.xyz` now redirects to `world.gizatech.xyz`, which returns **403** to a fetch — that
product's surface is therefore **not** represented here, and any statement of the form "nobody
does X" should be read as "not described in these sources".

## Sources

- [HyperAgent — AI Trading Bot for Hyperliquid](https://hyperagent.ch/)
- [Trading App Design: The Complete Guide to UI, UX & System Architecture (2026) — Lollypop](https://lollypop.design/blog/2026/june/trading-app-design/)
- [What Is Progressive Disclosure in UX? — UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
- [What is Progressive Disclosure? — Interaction Design Foundation](https://ixdf.org/literature/topics/progressive-disclosure)
- [Agent UX: UI Design for AI Agents in 2026 — Fuse Lab Creative](https://fuselabcreative.com/ui-design-for-ai-agents/)
- [Robinhood Agentic Trading — Memeburn](https://memeburn.com/robinhood-now-lets-ai-agents-trade-stocks-and-shop-for-you-in-2026/)
- [trading-command-center / AgentFloor — GitHub](https://github.com/saketnayak/trading-command-center)
