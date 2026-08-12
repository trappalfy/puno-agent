/**
 * Two feTurbulence grain filters, rendered once and referenced elsewhere via
 * `filter: url(#noise-headline)` / `url(#noise-watermark)`. The source
 * prompt names both filters `c3-noise` — harmless when they're scoped to
 * separate pages, but this is one page, so a single duplicate id would mean
 * the second definition silently wins everywhere, including on the first
 * filter's own consumer. Given distinct ids instead.
 */
export function NoiseFilters() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        {/* Headline sweep — subtle grain, multiply blend. */}
        <filter id="noise-headline">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"
          />
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
        </filter>

        {/* Pricing watermark — heavier grain, overlay blend. */}
        <filter id="noise-watermark">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves={2} stitchTiles="stitch" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.075" />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
        </filter>
      </defs>
    </svg>
  );
}
