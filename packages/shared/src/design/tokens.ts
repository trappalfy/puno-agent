/**
 * Single source of truth for the Puno design system.
 * DESIGN.md documents intent and rules; the numbers themselves live only here.
 * Run `pnpm --filter @puno/shared generate:css` after editing to regenerate
 * packages/shared/src/design/generated/*.css.
 */

export const color = {
  core: {
    forestCanopy: "#203400",
    vaultFloor: "#1b2d00",
    canopyMid: "#335400",
    limePhosphor: "#bdff00",
    mossBorder: "#586740",
    fern: "#73a303",
    white: "#ffffff",
  },
  signal: {
    // Spec value #ff5a3c measured 4.37:1 on forest-canopy — below the 4.5:1 text
    // threshold in 1.8 (it cleared vault-floor at 4.77:1 and the 3:1 large-text/UI
    // floor everywhere). Brightened to #ff6b4a: 4.80:1 on forest-canopy, 5.24:1 on
    // vault-floor — see design/build-css.ts contrast report.
    red: "#ff6b4a",
    amber: "#ffb020",
  },
  neutral: {
    whiteMuted: "rgba(255, 255, 255, 0.62)",
    whiteFaint: "rgba(255, 255, 255, 0.38)",
    rowHover: "rgba(255, 255, 255, 0.04)",
  },
} as const;

export const semanticColor = {
  pnlProfit: "var(--color-lime-phosphor)",
  pnlLoss: "var(--color-signal-red)",
  pnlZero: "var(--color-white-muted)",
  agentIdle: "var(--color-white-faint)",
  agentArmed: "var(--color-fern)",
  agentRunning: "var(--color-lime-phosphor)",
  agentPaused: "var(--color-signal-amber)",
  agentError: "var(--color-signal-red)",
  agentHalted: "var(--color-signal-red)",
  txPending: "var(--color-signal-amber)",
  txConfirmed: "var(--color-lime-phosphor)",
  txFailed: "var(--color-signal-red)",
  txDropped: "var(--color-white-muted)",
} as const;

export const fontFamily = {
  // Denim Ink is a licensed/custom face; Space Grotesk is the working substitute
  // until it's licensed, Inter Tight the fallback if Space Grotesk fails to load.
  denimInk:
    "'Denim Ink', 'Space Grotesk', 'Inter Tight', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
  // New role (1.4) — every comparable number in the product goes through this face.
  jetbrainsMono: "'JetBrains Mono', ui-monospace, \"SFMono-Regular\", Menlo, Consolas, monospace",
  // Original spec's fallback stack ended in `sans-serif`, which is wrong for a
  // monospace decorative face — corrected to a monospace fallback chain.
  courierNew: "'Courier New', ui-monospace, \"SFMono-Regular\", Menlo, Consolas, monospace",
} as const;

export const fontWeight = {
  regular: 400,
  semibold: 600,
  bold: 700,
} as const;

export interface TypeStyle {
  size: string;
  lineHeight: string;
  tracking: string;
}

/** Denim Ink, poster density. Unchanged from the original spec (1.4: "остаётся как есть"). */
export const posterType = {
  bodySm: { size: "16px", lineHeight: "1.5", tracking: "-0.32px" },
  body: { size: "20px", lineHeight: "1.5", tracking: "-0.4px" },
  subheading: { size: "32px", lineHeight: "1.2", tracking: "-0.7px" },
  headingSm: { size: "40px", lineHeight: "1.1", tracking: "-0.88px" },
  heading: { size: "64px", lineHeight: "1", tracking: "-1.35px" },
  display: { size: "94px", lineHeight: "1", tracking: "-4.23px" },
} satisfies Record<string, TypeStyle>;

/** Denim Ink, terminal density (new — 1.4). */
export const terminalType = {
  caption: { size: "12px", lineHeight: "1.35", tracking: "-0.005em" },
  bodySm: { size: "13px", lineHeight: "1.45", tracking: "-0.01em" },
  body: { size: "14px", lineHeight: "1.5", tracking: "-0.01em" },
  bodyLg: { size: "16px", lineHeight: "1.5", tracking: "-0.015em" },
  headingSm: { size: "20px", lineHeight: "1.3", tracking: "-0.02em" },
  heading: { size: "28px", lineHeight: "1.2", tracking: "-0.025em" },
} satisfies Record<string, TypeStyle>;

/**
 * JetBrains Mono, tabular numerics (new — 1.4). Every role additionally carries
 * `font-variant-numeric: tabular-nums` and `font-feature-settings: "tnum" 1, "zero" 1`
 * — encoded as fixed CSS in generate-css.ts, not per-size, since it never varies.
 * Tracking is 0 throughout: negative tracking on a monospace grid breaks column
 * alignment, which is the entire point of using a mono face for numbers.
 */
export const numericType = {
  xs: { size: "11px", lineHeight: "1.2", tracking: "0" },
  sm: { size: "12px", lineHeight: "1.2", tracking: "0" },
  base: { size: "14px", lineHeight: "1.3", tracking: "0" },
  lg: { size: "24px", lineHeight: "1.2", tracking: "0" },
  xl: { size: "32px", lineHeight: "1.1", tracking: "0" },
} satisfies Record<string, TypeStyle>;

/** Courier New, demoted to decorative micro-label only (1.4) — never a data role. */
export const courierMicroLabel = {
  size: "8px",
  lineHeight: "1",
  tracking: "-0.14em",
} satisfies TypeStyle;

/**
 * Flat spacing vocabulary in pixels. A given step means the same thing in both
 * densities (--spacing-24 is always 24px) — what differs between poster and
 * terminal is which *role* tokens (card padding, section gap, radii) point to
 * which step. This is the union of the poster steps (8/16/24/32/40/72/80/120/240)
 * and the terminal steps (4/8/12/16/24/32/48) from 1.3.
 */
export const spacingScale = [
  "4",
  "8",
  "12",
  "16",
  "24",
  "32",
  "40",
  "48",
  "72",
  "80",
  "120",
  "240",
] as const;

/** Pill radius never varies by density (1.3). */
export const pillRadius = "9999px";

export interface DensityTokens {
  unit: string;
  radius: {
    tag: string;
    card: string;
    button: string;
    bodyBlock: string;
    alternateButton: string;
  };
  layout: {
    cardPadding: string;
    sectionGap: string;
    elementGap: string;
    maxWidth: string;
    minWidth?: string;
  };
}

export const posterDensity: DensityTokens = {
  unit: "8px",
  radius: { tag: "12px", card: "32px", button: "16px", bodyBlock: "24px", alternateButton: "20px" },
  layout: { cardPadding: "40px", sectionGap: "80px", elementGap: "24px", maxWidth: "1280px" },
};

export const terminalDensity: DensityTokens = {
  unit: "4px",
  radius: { tag: "8px", card: "16px", button: "10px", bodyBlock: "16px", alternateButton: "10px" },
  // elementGap has no value given directly in 1.3; derived at the same
  // unit-multiple as poster (poster: 24px = 3 × 8px unit → terminal: 3 × 4px = 12px).
  layout: {
    cardPadding: "20px",
    sectionGap: "24px",
    elementGap: "12px",
    maxWidth: "none",
    minWidth: "1280px",
  },
};

/** Table row height (1.3) — a terminal-only concept; poster has no dense tables. */
export const row = {
  height: "36px",
  heightCompact: "28px",
} as const;

/** Motion (1.7). `flash*` and `pulse` are zeroed under prefers-reduced-motion. */
export const motion = {
  flashIn: "120ms",
  flashOut: "400ms",
  flashOpacity: "0.08",
  transition: "150ms",
  hover: "100ms",
  pulse: "2000ms",
  ease: "ease-out",
} as const;

/** Accessibility (1.8). */
export const a11y = {
  focusRingWidth: "2px",
  focusRingOffset: "2px",
  focusRingColor: "var(--color-lime-phosphor)",
  minTapTarget: "32px",
} as const;
