# Puno — Style Reference

> Electric terminal in a deep forest vault — lime phosphor on midnight olive, now reading prices instead of backups.

**Theme:** dark

Puno operates as a dark-mode trading terminal for autonomous agents: a deep forest-green canvas (`#203400`) swallows the viewport while a single electric lime (`#bdff00`) acts as the primary signal of action, profit, and "the agent is live" — like phosphor readouts on a military terminal. Two disciplined signal colors — red for loss and error, amber for warning and pending — extend that signal vocabulary without diluting it: lime still means "go" everywhere in the system. The custom "Denim Ink" typeface carries the marketing surface with extreme size jumps and aggressive negative tracking; inside the product, a second density mode packs the same palette and the same rules into a dense, tabular trading UI where every comparable number is set in JetBrains Mono. Surfaces layer subtly within the green family (`#1b2d00` cards, `#335400` elevated panels) rather than introducing grays — text hierarchy is white at three opacities instead. Components stay lightweight: ghost outlines replace heavy fills, generous corner radii soften the dark density, and lime is rationed to CTAs, active indicators, and one large illustrative block per page.

## Tokens — Colors

### Core (unchanged — this is the brand)

| Name          | Value     | Token                   | Role                                                                                                                               |
| ------------- | --------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Forest Canopy | `#203400` | `--color-forest-canopy` | Primary page background, nav strip, footer canvas — the dominant surface that defines the entire brand atmosphere                  |
| Vault Floor   | `#1b2d00` | `--color-vault-floor`   | Card surfaces, recessed panels, elevated content blocks within the forest canvas                                                   |
| Canopy Mid    | `#335400` | `--color-canopy-mid`    | Elevated card variant, highlighted surface tier above the base canvas                                                              |
| Lime Phosphor | `#bdff00` | `--color-lime-phosphor` | Primary action buttons, active state indicators, illustrative highlight panels, profit values — the sole chromatic signal for "go" |
| Moss Border   | `#586740` | `--color-moss-border`   | Hairline dividers, list separators, subtle table borders — barely-there green-on-green rules                                       |
| Fern          | `#73a303` | `--color-fern`          | Secondary accent strokes, table emphasis borders, the "armed" agent-status color                                                   |
| White         | `#ffffff` | `--color-white`         | Body text, heading text, icon strokes, ghost button borders, primary numerals                                                      |

### Signal (new)

A trading product has to say "you lost money" and "this needs attention" — the original two-color system (lime + white) has no way to do that without borrowing lime, which would make profit and loss look identical. Two colors are added, and rationed exactly as tightly as lime:

| Name         | Value     | Token                  | Role                                              |
| ------------ | --------- | ---------------------- | ------------------------------------------------- |
| Signal Red   | `#ff6b4a` | `--color-signal-red`   | Loss, error, stop-loss/liquidation, kill switch   |
| Signal Amber | `#ffb020` | `--color-signal-amber` | Warning, pending transaction, approaching a limit |

Red and amber are **never used as large fills**, with one exception: the Kill Switch (§ Components), whose filled state only appears on hover/active, behind a confirmation.

The spec value for red, `#ff5a3c`, measured 4.37:1 against `#203400` — under the 4.5:1 text threshold in Accessibility below (it passed everywhere else). It's brightened here to `#ff6b4a`, which clears both dark backgrounds with margin — see Accessibility for the full contrast table.

### Neutral (new)

The "no gray" rule stays absolute. Text hierarchy inside the product (secondary labels, disabled states, table zebra/hover) is built from white at different opacities instead of introducing gray hexes:

| Name        | Value                       | Token                 | Role                                          |
| ----------- | --------------------------- | --------------------- | --------------------------------------------- |
| White Muted | `rgba(255, 255, 255, 0.62)` | `--color-white-muted` | Secondary text, zero-value P&L                |
| White Faint | `rgba(255, 255, 255, 0.38)` | `--color-white-faint` | Axis labels, disabled states, idle-status dot |
| Row Hover   | `rgba(255, 255, 255, 0.04)` | `--color-row-hover`   | Table zebra striping and row hover            |

### Semantic aliases

These are the tokens components actually reach for — each one resolves to a core or signal color above, so the meaning of "profit" or "pending" only has to be defined once.

**P&L.** The sign is never carried by color alone — every P&L value pairs a `+`/`−` sign, a directional triangle, and a color, so the value still reads correctly in grayscale, in a screenshot, or for a colorblind user:

```
profit:  ▲ +$1,284.50   --color-pnl-profit   (lime)
loss:    ▼ −$412.08     --color-pnl-loss     (signal red)
zero:      $0.00        --color-pnl-zero     (white-muted)
```

**Agent status** — an 8px dot + label, one color per state:

| State     | Token                   | Color             | Label   |
| --------- | ----------------------- | ----------------- | ------- |
| `idle`    | `--color-agent-idle`    | white-faint       | Idle    |
| `armed`   | `--color-agent-armed`   | fern              | Armed   |
| `running` | `--color-agent-running` | lime, 2s pulse    | Running |
| `paused`  | `--color-agent-paused`  | amber             | Paused  |
| `error`   | `--color-agent-error`   | red               | Error   |
| `halted`  | `--color-agent-halted`  | red, outline chip | Halted  |

**Transaction status:**

| State                 | Token                  | Color                     |
| --------------------- | ---------------------- | ------------------------- |
| `pending`             | `--color-tx-pending`   | amber, spinning indicator |
| `confirmed`           | `--color-tx-confirmed` | lime                      |
| `failed` / `reverted` | `--color-tx-failed`    | red                       |
| `dropped`             | `--color-tx-dropped`   | white-muted               |

## Tokens — Typography

Three type roles, not two — the addition is what makes a trading terminal legible.

### Denim Ink — interface prose and headlines · `--font-denim-ink`

- **Substitute:** Space Grotesk, or Inter Tight as a fallback
- **Weights:** 400 (body/body-large), 600 (subheadings, emphasis), 700 (display only)
- **Role:** Two independent scales — see Type Scale below. Poster scale is unchanged from the original spec: extreme size jumps (16→94px) that read as a marketing headline. Terminal scale is new: a compact, 12–28px range built for dashboards and dense forms.

### JetBrains Mono — every comparable number (new) · `--font-jetbrains-mono`

Prices, position sizes, P&L, percentages, volumes, addresses, hashes, chain IDs, timestamps — anything the user compares by eye goes through this face, always with `font-variant-numeric: tabular-nums` and `font-feature-settings: "tnum" 1, "zero" 1` so digits align in a column regardless of size. Tracking is `0` throughout — negative tracking on a monospace grid would defeat the point of using one.

### Courier New — decorative micro-label only, 8px · `--font-courier-new`

- **Substitute:** JetBrains Mono, IBM Plex Mono (as a fallback _face_, not a fallback _role_ — see below)
- **Role:** Tiny micro-annotations near icons and status indicators. Ultra-tight tracking (`-0.14em`) at 8px reads as a decorative tech-glitch mark, not as text. **This face is explicitly demoted from any data role it might have suggested in the original spec** — it never sets a price, a quantity, or anything a user needs to read accurately. That job belongs to JetBrains Mono.

> The original spec's Courier New fallback stack ended in `sans-serif`. Fixed here to a monospace fallback chain (`ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`) — a serif/sans-serif substitute would silently break the tracking-dependent glitch effect the face is used for.

### Type Scale — Denim Ink, poster

Unchanged from the original spec.

| Role       | Size | Line Height | Letter Spacing | Token               |
| ---------- | ---- | ----------- | -------------- | ------------------- |
| body-sm    | 16px | 1.5         | -0.32px        | `--text-body-sm`    |
| body       | 20px | 1.5         | -0.4px         | `--text-body`       |
| subheading | 32px | 1.2         | -0.7px         | `--text-subheading` |
| heading-sm | 40px | 1.1         | -0.88px        | `--text-heading-sm` |
| heading    | 64px | 1           | -1.35px        | `--text-heading`    |
| display    | 94px | 1           | -4.23px        | `--text-display`    |

### Type Scale — Denim Ink, terminal (new)

| Role           | Size | Line Height | Letter Spacing | Token                   |
| -------------- | ---- | ----------- | -------------- | ----------------------- |
| app-caption    | 12px | 1.35        | -0.005em       | `--text-app-caption`    |
| app-body-sm    | 13px | 1.45        | -0.01em        | `--text-app-body-sm`    |
| app-body       | 14px | 1.5         | -0.01em        | `--text-app-body`       |
| app-body-lg    | 16px | 1.5         | -0.015em       | `--text-app-body-lg`    |
| app-heading-sm | 20px | 1.3         | -0.02em        | `--text-app-heading-sm` |
| app-heading    | 28px | 1.2         | -0.025em       | `--text-app-heading`    |

### Type Scale — JetBrains Mono, tabular numerics (new)

| Role   | Size | Applies to                     | Token           |
| ------ | ---- | ------------------------------ | --------------- |
| num-xs | 11px | chart axis labels, fine print  | `--text-num-xs` |
| num-sm | 12px | table cells, addresses, hashes | `--text-num-sm` |
| num    | 14px | prices and amounts in a row    | `--text-num`    |
| num-lg | 24px | metric-tile value              | `--text-num-lg` |
| num-xl | 32px | headline portfolio P&L         | `--text-num-xl` |

## Tokens — Density

Puno ships **two density modes in one system**, switched by a single attribute on the document root: `[data-density="poster"]` (default, marketing site) and `[data-density="terminal"]` (product). Colors, the pill radius, and typography roles are shared; what changes is scale, padding, and corner radius.

|                   | poster | terminal            |
| ----------------- | ------ | ------------------- |
| Base unit         | 8px    | **4px**             |
| Card radius       | 32px   | **16px**            |
| Button radius     | 16px   | **10px**            |
| Tag/chip radius   | 12px   | **8px**             |
| Body-block radius | 24px   | **16px**            |
| Pill radius       | 9999px | 9999px (unchanged)  |
| Card padding      | 40px   | **20px**            |
| Section gap       | 80px   | **24px**            |
| Element gap       | 24px   | **12px**            |
| Table row height  | —      | 36px (28px compact) |
| Max-width         | 1280px | fluid, min 1280px   |

The named spacing steps below (`--spacing-4` … `--spacing-240`) are a **flat pixel vocabulary shared by both densities** — `--spacing-24` is always 24px in either mode. What differs is which _role_ tokens (card padding, section gap, per-element radii above) point to which step; that mapping is what the table above encodes, and it's why the two blocks are generated separately (see Quick Start).

### Spacing Scale

| Name | Value | Token           |
| ---- | ----- | --------------- |
| 4    | 4px   | `--spacing-4`   |
| 8    | 8px   | `--spacing-8`   |
| 12   | 12px  | `--spacing-12`  |
| 16   | 16px  | `--spacing-16`  |
| 24   | 24px  | `--spacing-24`  |
| 32   | 32px  | `--spacing-32`  |
| 40   | 40px  | `--spacing-40`  |
| 48   | 48px  | `--spacing-48`  |
| 72   | 72px  | `--spacing-72`  |
| 80   | 80px  | `--spacing-80`  |
| 120  | 120px | `--spacing-120` |
| 240  | 240px | `--spacing-240` |

## Components

Existing components (Lime Primary Button, Ghost Outline Button, Pill Navigation Link, Dark Content Card, Elevated Accent Card, Hairline Divider, Active Dot Indicator, Section Eyebrow Label, Headline Block, Ghost Input Field, CTA / Feature Card with Image, Featured Lime Panel) are kept as specified in the original file and pick up terminal-density variants by consuming the role radius/spacing tokens above instead of hardcoded pixel values — no separate terminal spec needed for any of them.

The following are new.

**Data**

1. **Data Table** — sticky header (vault-floor), zebra via `--color-row-hover`, moss-border hairlines, numeric columns right-aligned and set in JetBrains Mono, sortable column headers, horizontal scroll contained within the table's own box (the page itself never scrolls horizontally)
2. **P&L Value** — sign + triangle + color + tabular mono; variants: absolute, percentage, paired (`+$1,284.50 ▲ 4.12%`)
3. **Metric Tile** — 11px uppercase mono label + `num-lg` value + delta; tiles grid 2–4 per row
4. **Sparkline** — 1px lime stroke, no axes, 24px tall, for a table row
5. **Equity Curve** — 1.5px lime line + flat 8%-opacity lime fill (never a gradient), moss-border grid at 20% opacity, 11px white-faint mono axis labels
6. **Price Chart** — candlesticks: up = lime outline / transparent fill, down = red fill; volume = 12%-opacity white bars
7. **Empty State** — lime dot + heading + one line of explanation + one action
8. **Skeleton** — flat pulsing block, vault-floor ↔ canopy-mid, no shimmer gradient (gradients are still forbidden)

**On-chain** 9. **Address Chip** — 12px mono, center-truncated (`0x0Bd7…AD73`), click to copy, secondary icon opens the explorer 10. **Tx Hash Chip** — same, plus a status dot on the left 11. **Network Badge** — pill: `Robinhood Chain · 4663` (lime outline) or `Testnet · 46630` (amber outline); wrong network renders red with a "Switch" action 12. **Tx Status Pill** — pending/confirmed/failed per the transaction-status table above 13. **Gas & Route Row** — swap route, quote, slippage, minimum received, gas estimate

**Agent** 14. **Agent Card** — name, status chip, strategy, equity sparkline, P&L, vault size, Pause / Kill actions 15. **Reasoning Card** — the LLM's thesis, a confidence bar (0–100), the data it used, and the risk engine's verdict (`accepted` / `rejected: reason`). Rejected signals are shown alongside accepted ones — this is the product's primary trust mechanism, not a debug view 16. **Model Comparison Card** — two theses side by side on one input: Haiku 4.5 on the left, Opus 5 on the right, with a summary of where they diverged (action, size, confidence) above. Stacks vertically on narrow screens but keeps the "cheap → flagship" reading order. The core conversion component for the Free tier's Opus trial 17. **Model Badge** — which model a thesis came from; lives in Model Comparison Card column headers and in the Reasoning Card. Haiku — fern outline. Opus 5 — lime outline 18. **Trial Counter** — remaining trial-pool comparisons on Free: `17 / 20`, mono, next to the compare action and in the account header 19. **Risk Limits Panel** — editor for trade-size cap, daily turnover, max ticker share, stop-loss, trade interval — each limit explicitly marked as on-chain-enforced or off-chain-only 20. **Session Key Card** — the agent key's scope, a countdown to expiry, a revoke action 21. **Kill Switch** — the one place red is allowed as a large element: 1px red outline, red text, fill only on hover/active, always behind a confirmation modal

**Utility** 22. **Quota Meter** — remaining quota for the period: bar + mono numbers. Lime → amber at 20% remaining → red at zero. At `quota_exhausted` it expands into a banner offering a top-up 23. **Confirm Dialog** — for irreversible actions (revoke key, withdraw funds, stop agent); the action's own text is repeated on the confirm button 24. **Toast / Alert Banner** — info (lime dot), warning (amber outline), error (red outline) 25. **Geo Gate / Disclaimer Modal** — blocking onboarding step listing restricted jurisdictions, records consent

## Motion

The original spec didn't address motion at all — trading data changing in real time needs exactly one rule, and everything else stays quiet:

- **Flash-on-update** — when a number changes, its cell fills with lime or red at 8% opacity for 120ms, then fades over 400ms. This is the only "animation for data" in the system.
- **State transitions** — 150ms `ease-out`; hover — 100ms.
- **`running` status dot** — 2s pulse, opacity 1 → 0.4 → 1.
- No shimmer gradients (would violate the no-gradients rule), no parallax.
- `@media (prefers-reduced-motion: reduce)` zeroes out flash and pulse durations at the token level (`--motion-flash-in`, `--motion-flash-out`, `--motion-pulse` → `0ms`) — any component consuming those variables gets an instant color change for free, with no per-component media query needed.

## Accessibility — verifiable requirements

- All text pairs ≥ 4.5:1, large text and UI elements ≥ 3:1. Measured (WCAG relative luminance, see `packages/shared/src/design/contrast.ts` — this table is regenerated by `pnpm --filter @puno/shared generate:css` on every token change, not hand-maintained):

  | Foreground              | on Forest Canopy | on Vault Floor |
  | ----------------------- | ---------------- | -------------- |
  | Signal Red `#ff6b4a`    | 4.80:1           | 5.24:1         |
  | Signal Amber `#ffb020`  | 7.40:1           | 8.08:1         |
  | Lime Phosphor `#bdff00` | 11.25:1          | 12.28:1        |
  | White `#ffffff`         | 13.53:1          | 14.77:1        |

  Signal Red is the tight one — it's brightened from the original spec value specifically to clear this bar (see Tokens — Colors above).

- No state is ever encoded by color alone (P&L sign + triangle; agent/tx status = color + label, never a bare dot with no text).
- All interactive elements carry a visible focus ring: 2px lime outline, 2px offset (`--focus-ring-width`, `--focus-ring-offset`, `--focus-ring-color`).
- Minimum tap target 32×32px, even in terminal-density compact rows (`--min-tap-target`).

### Documented exception to the "never below 16px" rule

Terminal density goes below 16px in exactly two places: 11px chart axis labels (`num-xs`) and 12px table cells (`num-sm`/`app-caption`). This is a deliberate, scoped exception — data density is a functional requirement of a trading UI, and a position table set at 16px per cell is unreadable once it needs to scroll. The 16px floor still applies without exception to poster density and to all prose anywhere in the product.

## Do's and Don'ts

### Do

- Use `#bdff00` lime as the only filled _action_ color in the system; never substitute another hue for a primary CTA.
- Pair every P&L value with a sign, a directional triangle, and a color — never color alone.
- Set poster headlines at 64–94px, Denim Ink weight 600–700, -0.045em tracking; set terminal headings at 20–28px, weight 600, -0.02 to -0.025em.
- Maintain the monochromatic green discipline for surfaces (`#1b2d00` → `#203400` → `#335400`); build text hierarchy from white at 100/62/38% opacity, never gray hexes.
- Route every comparable number — price, size, P&L, percentage, address, hash, timestamp — through JetBrains Mono with tabular figures.
- Use the named role-radius tokens (card/button/tag/body-block/alternate-button), not hardcoded pixel values, so a component works in both densities automatically.
- Place an 8px lime dot before every section eyebrow label.
- Let poster sections breathe with 80px vertical gaps; let terminal density run tight at 24px section gaps and 4px-unit spacing.

### Don't

- Never use `#bdff00` as a large background outside one featured decorative panel per poster page, or the primary-action/active-indicator roles in terminal density.
- Never use signal red or amber as a large fill — outlines and text only, except the Kill Switch's hover/active state.
- Do not introduce drop shadows for elevation — layers separate through color-tier shifts only.
- Do not use gray hexes (`#808080`, `#999`, etc.) anywhere — green-monochrome surfaces, white-opacity text, plus exactly two signal colors.
- Never set body text below 16px, except the 8px Courier New micro-label and the two documented terminal-density exceptions above (11px axis labels, 12px table cells).
- Do not add gradients, including shimmer/skeleton gradients — flat color blocks and opacity pulses only.
- Do not use Denim Ink weight 700 below 32px — reserve it for display-scale moments.
- Do not let a status or P&L value rely on color as its only signal.

## Surfaces

| Level | Name          | Value     | Purpose                                                                            |
| ----- | ------------- | --------- | ---------------------------------------------------------------------------------- |
| 1     | Forest Canopy | `#203400` | Base page background — the dominant canvas filling all viewports                   |
| 2     | Vault Floor   | `#1b2d00` | Card surfaces and recessed content blocks, one tier deeper than the canvas         |
| 3     | Canopy Mid    | `#335400` | Elevated or active card states, highlighted content tiers                          |
| 4     | Lime Phosphor | `#bdff00` | Featured decorative panel and primary action surface — the sole bright "go" signal |

Signal Red and Signal Amber are not surface tiers — they're state signals layered on top of these surfaces (text, outlines, dots), never a background tier of their own. See Tokens — Colors.

## Imagery

Minimal illustrative photography; the brand favors flat lime-green geometric illustrations — candlestick clusters, order-book grids, node/graph motifs — rendered in a pixelated/dot-matrix style that echoes the phosphor-terminal aesthetic. Imagery is always contained within a rounded-corner panel (poster: 32px radius), never full-bleed. No lifestyle photography, no people — the visual language is abstract-tech and data-focused. The only color used in illustrations is lime as line-art on the dark canvas, or as a full solid-lime panel with white/green content inside. Icon style is line-based, thin stroke, monochromatic white or lime.

## Layout

**Poster (marketing site).** Full-bleed dark canvas with a centered max-width content column (~1280px). Slim top nav: logo left, nav center, login + lime CTA right. Hero is a two-column split: text (60%) left, decorative illustration (40%) right. Sections alternate text-left/visual-right two-column layouts and full-width centered headline stacks, separated by hairline dividers, each introduced by a lime-dot eyebrow label. 80px vertical rhythm between sections.

**Terminal (product, `/app`).** No hero, no marketing rhythm. A persistent left rail (agent list, account) plus a main content column that runs fluid above a 1280px minimum width — tables and charts get the width they need rather than being centered into a fixed column. Density comes from the terminal spacing scale (§ Tokens — Density), not from the poster page's generous gaps. Cards still separate purely by color-tier shift, never by shadow.

## Agent Prompt Guide

Quick Color Reference:

- text: `#ffffff`
- background: `#203400`
- card surface: `#1b2d00`
- elevated card: `#335400`
- border / hairline: `#586740`
- accent / decoration: `#bdff00`
- primary action: `#bdff00` (filled)
- loss / error: `#ff6b4a`
- warning / pending: `#ffb020`

Example Component Prompts:

1. **Primary action button:** `#bdff00` background, `#1b2d00` text, `--radius-buttons` radius, padding 18px 32px (poster) or `--layout-card-padding` scaled down (terminal). Denim Ink weight 400–600. The only fully filled button in the system.

2. **Position table row (terminal density):** background transparent, hover `--color-row-hover`, 36px row height (28px compact). Ticker in Denim Ink `app-body` weight 600, `#ffffff`. Size and entry price in JetBrains Mono `num`, right-aligned, tabular figures. P&L cell: sign + triangle + JetBrains Mono `num`, color `--color-pnl-profit` or `--color-pnl-loss`. Bottom hairline `--color-moss-border` at low opacity.

3. **Metric tile:** background `#1b2d00`, `--radius-cards` radius, `--layout-card-padding` padding. Label: 11px JetBrains Mono uppercase, `--color-white-faint`. Value: JetBrains Mono `num-lg`, `#ffffff`. Delta below: P&L Value component, `num-sm`.

4. **Agent card:** background `#1b2d00`, `--radius-cards` radius, `--layout-card-padding` padding. Top row: agent name (Denim Ink `app-heading-sm`, weight 600) + status dot + label (§ Tokens — Colors, agent status). Equity sparkline below. P&L Value and vault size in JetBrains Mono. Pause (ghost outline) and Kill (red outline, § Kill Switch) actions bottom-right.

5. **Reasoning card:** background `#1b2d00`, `--radius-cards` radius. Thesis text in Denim Ink `app-body`, `#ffffff`, 2–4 sentences. Confidence bar: track `--color-moss-border`, fill `--color-lime-phosphor`, 0–100. Verdict chip: `accepted` (lime outline) or `rejected: {reason}` (red outline) — rejected signals render with the same visual weight as accepted ones, never grayed out or hidden.

## Similar Brands

- **Bloomberg Terminal** — the reference point for pure data density: monospace numerics, tight rows, color used only as a functional signal rather than decoration
- **dYdX** — dark-mode on-chain trading UI that proves a restrained, monochrome-plus-one-accent palette can carry a full order book and position table
- **Vercel** — extreme typographic hierarchy with massive display headlines on a dark canvas, and the discipline of one accent color used purely as signal
- **Linear** — dark interface with precise typography, generous corner radii on cards, and a disciplined monochromatic palette accented by a single vibrant color

## Quick Start

Both files below are generated from `packages/shared/src/design/tokens.ts` — regenerate with `pnpm --filter @puno/shared generate:css` after any token change; never hand-edit the generated output or these code blocks. The two are split deliberately: `@theme` registers density-invariant tokens as Tailwind v4 utilities (colors, fonts, both type scales, the pill radius); the CSS custom properties file carries the flat spacing vocabulary plus everything that actually changes between `[data-density="poster"]` and `[data-density="terminal"]` — those can't live in `@theme` because Tailwind bakes one literal per key at build time, and density switching happens at runtime via the root attribute. Consume the density-variant tokens directly in CSS or via Tailwind arbitrary values, e.g. `rounded-[var(--radius-card)]`, `p-[var(--layout-card-padding)]`.

The original spec's generic numbered radius scale (`--radius-xl`, `--radius-2xl`, …) and duplicate `--surface-*` color aliases are dropped here — both were exact duplicates of the named tokens below, and the generic radius numbers can no longer mean a single fixed value once radii vary by density.

### CSS Custom Properties

```css
/* GENERATED FILE — do not edit by hand.
 * Edit packages/shared/src/design/tokens.ts and run:
 *   pnpm --filter @puno/shared generate:css
 */

:root {
  /* Flat spacing vocabulary — same pixel value in both densities (1.3) */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-72: 72px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-240: 240px;

  /* Font weights (documentation/non-Tailwind consumers — see build-css.ts) */
  --font-weight-regular: 400;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Table row height (1.3) — terminal-only concept, harmless elsewhere */
  --row-height: 36px;
  --row-height-compact: 28px;

  /* Motion (1.7) */
  --motion-flash-in: 120ms;
  --motion-flash-out: 400ms;
  --motion-flash-opacity: 0.08;
  --motion-transition: 150ms;
  --motion-hover: 100ms;
  --motion-pulse: 2000ms;
  --motion-ease: ease-out;

  /* Accessibility (1.8) */
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;
  --focus-ring-color: var(--color-lime-phosphor);
  --min-tap-target: 32px;

  /* Density — poster (default) */
  --spacing-unit: 8px;
  --radius-tags: 12px;
  --radius-cards: 32px;
  --radius-buttons: 16px;
  --radius-body-blocks: 24px;
  --radius-alternate-button: 20px;
  --radius-pills: 9999px;
  --layout-card-padding: 40px;
  --layout-section-gap: 80px;
  --layout-element-gap: 24px;
  --layout-max-width: 1280px;
}

[data-density="terminal"] {
  --spacing-unit: 4px;
  --radius-tags: 8px;
  --radius-cards: 16px;
  --radius-buttons: 10px;
  --radius-body-blocks: 16px;
  --radius-alternate-button: 10px;
  --layout-card-padding: 20px;
  --layout-section-gap: 24px;
  --layout-element-gap: 12px;
  --layout-max-width: none;
  --layout-min-width: 1280px;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-flash-in: 0ms;
    --motion-flash-out: 0ms;
    --motion-pulse: 0ms;
  }
}
```

### Tailwind v4

```css
/* GENERATED FILE — do not edit by hand.
 * Edit packages/shared/src/design/tokens.ts and run:
 *   pnpm --filter @puno/shared generate:css
 */

@theme {
  /* Colors — core */
  --color-forest-canopy: #203400;
  --color-vault-floor: #1b2d00;
  --color-canopy-mid: #335400;
  --color-lime-phosphor: #bdff00;
  --color-moss-border: #586740;
  --color-fern: #73a303;
  --color-white: #ffffff;

  /* Colors — signal (see tokens.ts for the contrast correction on red) */
  --color-signal-red: #ff6b4a;
  --color-signal-amber: #ffb020;

  /* Colors — neutral (white-opacity scale, no gray hexes — 1.2) */
  --color-white-muted: rgba(255, 255, 255, 0.62);
  --color-white-faint: rgba(255, 255, 255, 0.38);
  --color-row-hover: rgba(255, 255, 255, 0.04);

  /* Colors — semantic aliases (1.5) */
  --color-pnl-profit: var(--color-lime-phosphor);
  --color-pnl-loss: var(--color-signal-red);
  --color-pnl-zero: var(--color-white-muted);
  --color-agent-idle: var(--color-white-faint);
  --color-agent-armed: var(--color-fern);
  --color-agent-running: var(--color-lime-phosphor);
  --color-agent-paused: var(--color-signal-amber);
  --color-agent-error: var(--color-signal-red);
  --color-agent-halted: var(--color-signal-red);
  --color-tx-pending: var(--color-signal-amber);
  --color-tx-confirmed: var(--color-lime-phosphor);
  --color-tx-failed: var(--color-signal-red);
  --color-tx-dropped: var(--color-white-muted);

  /* Font families */
  --font-denim-ink:
    "Denim Ink", "Space Grotesk", "Inter Tight", ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-jetbrains-mono:
    "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --font-courier-new: "Courier New", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

  /* Type scale — Denim Ink, poster density (unchanged from original spec) */
  --text-body-sm: 16px;
  --text-body-sm--line-height: 1.5;
  --text-body-sm--letter-spacing: -0.32px;
  --text-body: 20px;
  --text-body--line-height: 1.5;
  --text-body--letter-spacing: -0.4px;
  --text-subheading: 32px;
  --text-subheading--line-height: 1.2;
  --text-subheading--letter-spacing: -0.7px;
  --text-heading-sm: 40px;
  --text-heading-sm--line-height: 1.1;
  --text-heading-sm--letter-spacing: -0.88px;
  --text-heading: 64px;
  --text-heading--line-height: 1;
  --text-heading--letter-spacing: -1.35px;
  --text-display: 94px;
  --text-display--line-height: 1;
  --text-display--letter-spacing: -4.23px;

  /* Type scale — Denim Ink, terminal density (new — 1.4) */
  --text-app-caption: 12px;
  --text-app-caption--line-height: 1.35;
  --text-app-caption--letter-spacing: -0.005em;
  --text-app-body-sm: 13px;
  --text-app-body-sm--line-height: 1.45;
  --text-app-body-sm--letter-spacing: -0.01em;
  --text-app-body: 14px;
  --text-app-body--line-height: 1.5;
  --text-app-body--letter-spacing: -0.01em;
  --text-app-body-lg: 16px;
  --text-app-body-lg--line-height: 1.5;
  --text-app-body-lg--letter-spacing: -0.015em;
  --text-app-heading-sm: 20px;
  --text-app-heading-sm--line-height: 1.3;
  --text-app-heading-sm--letter-spacing: -0.02em;
  --text-app-heading: 28px;
  --text-app-heading--line-height: 1.2;
  --text-app-heading--letter-spacing: -0.025em;

  /* Type scale — JetBrains Mono, tabular numerics (new — 1.4) */
  --text-num-xs: 11px;
  --text-num-xs--line-height: 1.2;
  --text-num-xs--letter-spacing: 0;
  --text-num-sm: 12px;
  --text-num-sm--line-height: 1.2;
  --text-num-sm--letter-spacing: 0;
  --text-num: 14px;
  --text-num--line-height: 1.3;
  --text-num--letter-spacing: 0;
  --text-num-lg: 24px;
  --text-num-lg--line-height: 1.2;
  --text-num-lg--letter-spacing: 0;
  --text-num-xl: 32px;
  --text-num-xl--line-height: 1.1;
  --text-num-xl--letter-spacing: 0;

  /* Courier New — decorative micro-label only, never a data role */
  --text-courier-micro: 8px;
  --text-courier-micro--line-height: 1;
  --text-courier-micro--letter-spacing: -0.14em;

  /* Radius — only the density-invariant pill; role radii are runtime vars, see variables.css */
  --radius-pills: 9999px;
}
```
