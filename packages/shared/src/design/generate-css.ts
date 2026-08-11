import {
  a11y,
  color,
  courierMicroLabel,
  fontFamily,
  fontWeight,
  motion,
  numericType,
  pillRadius,
  posterDensity,
  posterType,
  row,
  semanticColor,
  spacingScale,
  terminalDensity,
  terminalType,
  type TypeStyle,
  // build-css.ts runs this file directly via `node`, which needs a literal .ts
  // specifier (no bundler resolution). index.ts (consumed by apps/* through a
  // bundler) keeps .js specifiers, per moduleResolution: "Bundler" convention.
} from "./tokens.ts";

const GENERATED_HEADER = `/* GENERATED FILE — do not edit by hand.
 * Edit packages/shared/src/design/tokens.ts and run:
 *   pnpm --filter @puno/shared generate:css
 */`;

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function colorVars(prefix: string, entries: Record<string, string>): string[] {
  return Object.entries(entries).map(([key, value]) => `  --${prefix}-${kebab(key)}: ${value};`);
}

function typeVarLines(name: string, style: TypeStyle): string[] {
  return [
    `  --text-${name}: ${style.size};`,
    `  --text-${name}--line-height: ${style.lineHeight};`,
    `  --text-${name}--letter-spacing: ${style.tracking};`,
  ];
}

function typeVars(prefix: string, entries: Record<string, TypeStyle>): string[] {
  const lines: string[] = [];
  for (const [key, style] of Object.entries(entries)) {
    const name = prefix ? `${prefix}-${kebab(key)}` : kebab(key);
    lines.push(...typeVarLines(name, style));
  }
  return lines;
}

/**
 * Runtime CSS custom properties: :root (poster defaults, density-invariant
 * tokens) + [data-density="terminal"] overrides + prefers-reduced-motion.
 *
 * Deliberately NOT emitted into the Tailwind @theme block below: the flat
 * spacing scale and the density-variant role tokens (unit, per-role radii,
 * layout). Density switching happens at runtime via the data-attribute, and
 * Tailwind's @theme bakes a single literal per key at build time — a value
 * registered there can't react to the attribute changing. Components consume
 * these either directly in CSS or via Tailwind arbitrary values, e.g.
 * `rounded-[var(--radius-card)]`, `p-[var(--layout-card-padding)]`.
 */
export function generateVariablesCss(): string {
  const lines: string[] = [GENERATED_HEADER, "", ":root {"];

  lines.push("  /* Flat spacing vocabulary — same pixel value in both densities (1.3) */");
  for (const step of spacingScale) {
    lines.push(`  --spacing-${step}: ${step}px;`);
  }

  lines.push("");
  lines.push("  /* Font weights (documentation/non-Tailwind consumers — see build-css.ts) */");
  lines.push(`  --font-weight-regular: ${fontWeight.regular};`);
  lines.push(`  --font-weight-semibold: ${fontWeight.semibold};`);
  lines.push(`  --font-weight-bold: ${fontWeight.bold};`);

  lines.push("");
  lines.push("  /* Table row height (1.3) — terminal-only concept, harmless elsewhere */");
  lines.push(`  --row-height: ${row.height};`);
  lines.push(`  --row-height-compact: ${row.heightCompact};`);

  lines.push("");
  lines.push("  /* Motion (1.7) */");
  lines.push(`  --motion-flash-in: ${motion.flashIn};`);
  lines.push(`  --motion-flash-out: ${motion.flashOut};`);
  lines.push(`  --motion-flash-opacity: ${motion.flashOpacity};`);
  lines.push(`  --motion-transition: ${motion.transition};`);
  lines.push(`  --motion-hover: ${motion.hover};`);
  lines.push(`  --motion-pulse: ${motion.pulse};`);
  lines.push(`  --motion-ease: ${motion.ease};`);

  lines.push("");
  lines.push("  /* Accessibility (1.8) */");
  lines.push(`  --focus-ring-width: ${a11y.focusRingWidth};`);
  lines.push(`  --focus-ring-offset: ${a11y.focusRingOffset};`);
  lines.push(`  --focus-ring-color: ${a11y.focusRingColor};`);
  lines.push(`  --min-tap-target: ${a11y.minTapTarget};`);

  lines.push("");
  lines.push("  /* Density — poster (default) */");
  lines.push(`  --spacing-unit: ${posterDensity.unit};`);
  lines.push(`  --radius-tags: ${posterDensity.radius.tag};`);
  lines.push(`  --radius-cards: ${posterDensity.radius.card};`);
  lines.push(`  --radius-buttons: ${posterDensity.radius.button};`);
  lines.push(`  --radius-body-blocks: ${posterDensity.radius.bodyBlock};`);
  lines.push(`  --radius-alternate-button: ${posterDensity.radius.alternateButton};`);
  lines.push(`  --radius-pills: ${pillRadius};`);
  lines.push(`  --layout-card-padding: ${posterDensity.layout.cardPadding};`);
  lines.push(`  --layout-section-gap: ${posterDensity.layout.sectionGap};`);
  lines.push(`  --layout-element-gap: ${posterDensity.layout.elementGap};`);
  lines.push(`  --layout-max-width: ${posterDensity.layout.maxWidth};`);

  lines.push("}");
  lines.push("");
  lines.push('[data-density="terminal"] {');
  lines.push(`  --spacing-unit: ${terminalDensity.unit};`);
  lines.push(`  --radius-tags: ${terminalDensity.radius.tag};`);
  lines.push(`  --radius-cards: ${terminalDensity.radius.card};`);
  lines.push(`  --radius-buttons: ${terminalDensity.radius.button};`);
  lines.push(`  --radius-body-blocks: ${terminalDensity.radius.bodyBlock};`);
  lines.push(`  --radius-alternate-button: ${terminalDensity.radius.alternateButton};`);
  lines.push(`  --layout-card-padding: ${terminalDensity.layout.cardPadding};`);
  lines.push(`  --layout-section-gap: ${terminalDensity.layout.sectionGap};`);
  lines.push(`  --layout-element-gap: ${terminalDensity.layout.elementGap};`);
  lines.push(`  --layout-max-width: ${terminalDensity.layout.maxWidth};`);
  if (terminalDensity.layout.minWidth) {
    lines.push(`  --layout-min-width: ${terminalDensity.layout.minWidth};`);
  }
  lines.push("}");
  lines.push("");
  lines.push("@media (prefers-reduced-motion: reduce) {");
  lines.push("  :root {");
  lines.push("    --motion-flash-in: 0ms;");
  lines.push("    --motion-flash-out: 0ms;");
  lines.push("    --motion-pulse: 0ms;");
  lines.push("  }");
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

/**
 * Tailwind v4 @theme block — density-invariant tokens only (see note above).
 * Colors, semantic color aliases, font families, the three named type scales
 * (poster/terminal/numeric — each role is its own fixed CSS variable name, so
 * density switching happens by using a different class, not by the same
 * class reacting to an attribute), and the pill radius.
 */
export function generateTailwindThemeCss(): string {
  const lines: string[] = [GENERATED_HEADER, "", "@theme {"];

  lines.push("  /* Colors — core */");
  lines.push(...colorVars("color", color.core));
  lines.push("");
  lines.push("  /* Colors — signal (see tokens.ts for the contrast correction on red) */");
  lines.push(`  --color-signal-red: ${color.signal.red};`);
  lines.push(`  --color-signal-amber: ${color.signal.amber};`);
  lines.push("");
  lines.push("  /* Colors — neutral (white-opacity scale, no gray hexes — 1.2) */");
  lines.push(...colorVars("color", color.neutral));
  lines.push("");
  lines.push("  /* Colors — semantic aliases (1.5) */");
  lines.push(...colorVars("color", semanticColor));
  lines.push("");
  lines.push("  /* Font families */");
  lines.push(`  --font-denim-ink: ${fontFamily.denimInk};`);
  lines.push(`  --font-jetbrains-mono: ${fontFamily.jetbrainsMono};`);
  lines.push(`  --font-courier-new: ${fontFamily.courierNew};`);
  lines.push("");
  lines.push("  /* Type scale — Denim Ink, poster density (unchanged from original spec) */");
  lines.push(...typeVars("", posterType));
  lines.push("");
  lines.push("  /* Type scale — Denim Ink, terminal density (new — 1.4) */");
  lines.push(...typeVars("app", terminalType));
  lines.push("");
  lines.push("  /* Type scale — JetBrains Mono, tabular numerics (new — 1.4) */");
  // Named per 1.4 exactly: num-xs, num-sm, num, num-lg, num-xl — the middle
  // step is bare "num" (no suffix), so it can't go through the generic
  // prefix-kebab(key) rule used for the other scales.
  const numericNames: Record<keyof typeof numericType, string> = {
    xs: "num-xs",
    sm: "num-sm",
    base: "num",
    lg: "num-lg",
    xl: "num-xl",
  };
  for (const [key, style] of Object.entries(numericType)) {
    lines.push(...typeVarLines(numericNames[key as keyof typeof numericType], style));
  }
  lines.push("");
  lines.push("  /* Courier New — decorative micro-label only, never a data role */");
  lines.push(`  --text-courier-micro: ${courierMicroLabel.size};`);
  lines.push(`  --text-courier-micro--line-height: ${courierMicroLabel.lineHeight};`);
  lines.push(`  --text-courier-micro--letter-spacing: ${courierMicroLabel.tracking};`);
  lines.push("");
  lines.push(
    "  /* Radius — only the density-invariant pill; role radii are runtime vars, see variables.css */",
  );
  lines.push(`  --radius-pills: ${pillRadius};`);

  lines.push("}");
  lines.push("");

  return lines.join("\n");
}
