import { motion } from "motion/react";
import { PRICES_USD, type BillableEvent } from "@puno/shared";
import { SectionEyebrow } from "../primitives/SectionEyebrow";
import { links } from "../../lib/config";
import { usePricing, priceLabel } from "../../lib/usePricing";

const ROWS: { key: BillableEvent; name: string; blurb: string }[] = [
  {
    key: "screen",
    name: "Market check",
    blurb: "A move happens; the agent decides whether it's worth thinking about.",
  },
  {
    key: "decision",
    name: "Decision",
    blurb: "A full thesis — position size, confidence, and the risk engine's verdict.",
  },
  {
    key: "trade",
    name: "Executed trade",
    blurb: "Only when a swap confirms on-chain. A reverted trade costs nothing.",
  },
];

/**
 * Prices come from @puno/shared's PRICES_USD — the same constants apps/web
 * bills against — so this card and the real product can't quote different
 * numbers.
 *
 * The source prompt's four-tier grid and Monthly/Yearly toggle are both gone
 * because the product has neither: there is one plan, and it charges per
 * action. Showing tiers here would be advertising something checkout can't
 * sell.
 *
 * Quoted in PUNO, which reverses what this comment used to say. The old
 * reasoning was that the rate is a server lookup a static page has no session
 * for — true, but it argued for showing dollars when the real conclusion was
 * that the rate needed a public endpoint. `/api/pricing` is that endpoint; it
 * needs no session because none of this is per-account.
 *
 * USD remains the fallback for exactly one case: no rate to quote. A price a
 * visitor cannot pay in is still more informative than a blank.
 */
export function PricingSection() {
  const pricing = usePricing();

  return (
    <section id="pricing" className="relative z-10 overflow-hidden px-6 py-16 md:py-24">
      <div className="relative max-w-[1100px] mx-auto text-center">
        <SectionEyebrow label="Pricing" tag="Pay per action" />
        <div
          className="mt-6 font-extrabold leading-[0.9] tracking-tighter text-[3.5rem] lg:text-[9rem]"
          style={{ fontFamily: "var(--font-denim-ink)" }}
        >
          <span className="block text-white">Trade onchain.</span>
          <span
            className="block text-shiny text-watermark-line2"
            style={{ filter: "url(#noise-watermark)" }}
          >
            Non-custodial.
          </span>
        </div>
        <p className="mt-8 mx-auto max-w-xl text-sm text-white/60 leading-[1.6]">
          No plans and no monthly minimum. Top up a balance in PUNO and it draws down as the agent
          works — an idle agent costs nothing.
        </p>
        {pricing?.tokenPrice && (
          <p className="mt-3 text-xs text-white/35 font-jetbrains-mono">
            {/* Says when, because these amounts are only meaningful against a
                rate, and the rate is set by hand until PUNO has a pool worth
                reading. A number with no date invites the reader to assume it
                is live. */}
            PUNO rate as of {new Date(pricing.tokenPrice.at).toLocaleDateString("en-US")}
          </p>
        )}
      </div>

      <div className="relative z-[3] mt-14 -mx-6 px-6 flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory lg:mx-auto lg:max-w-5xl lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0">
        {ROWS.map((row, i) => (
          <motion.div
            key={row.key}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: i * 0.08 }}
            className="shrink-0 w-[280px] snap-center lg:w-auto liquid-glass rounded-[var(--radius-cards)] p-6 flex flex-col min-h-[300px] border border-white/10 transition-all duration-500 hover:-translate-y-2 hover:border-white/20"
          >
            <div className="text-white/60 text-sm">{row.name}</div>
            {/* text-3xl, not 4xl: "1,250 PUNO" is three times the width of
                "$0.50" and overflowed a 280px card at the larger size. */}
            <div className="mt-1.5 text-3xl font-semibold tracking-tight text-lime-phosphor font-jetbrains-mono tabular-nums">
              {priceLabel(pricing, row.key, PRICES_USD[row.key])}
            </div>
            <p className="mt-4 text-xs text-white/45 leading-[1.6]">{row.blurb}</p>
          </motion.div>
        ))}
      </div>

      <div className="relative z-[3] mt-10 flex flex-col items-center gap-4">
        <a
          href={links.pricing}
          className="inline-flex items-center justify-center rounded-[var(--radius-pills)] bg-lime-phosphor px-8 py-3 text-sm font-semibold text-vault-floor transition-opacity hover:opacity-90"
        >
          Get started
        </a>
        <p className="text-xs text-white/40">
          Priced and paid in PUNO — the amounts follow the market, the work they buy doesn&rsquo;t.
          Bring your own Anthropic key and thinking is free.
        </p>
      </div>
    </section>
  );
}
