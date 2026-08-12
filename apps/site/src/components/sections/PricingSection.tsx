import { motion } from "motion/react";
import { Check } from "lucide-react";
import { TIERS, type TierKey } from "@puno/shared";
import { SectionEyebrow } from "../primitives/SectionEyebrow";
import { links } from "../../lib/config";

const TIER_ORDER: TierKey[] = ["free", "solo", "pro", "byok"];

const TIER_BLURB: Record<TierKey, string> = {
  free: "Kick the tires on testnet before risking anything real.",
  solo: "One agent on mainnet, sized for running a single strategy.",
  pro: "Five agents on mainnet, for running several strategies at once.",
  byok: "Bring your own Anthropic key — no Puno-side model quota at all.",
};

/**
 * Real tiers from @puno/shared's TIERS (also what apps/web's /pricing and
 * checkout route read) — not the source prompt's invented "Forma" tiers.
 * Features are derived from the same data rather than hand-written, so this
 * card and the real /pricing page can't drift out of sync.
 *
 * The prompt's Yearly/Monthly toggle is dropped: there is no yearly billing
 * anywhere in the actual product (Stripe price IDs in .env.example are
 * monthly only), so a toggle here would compute discounted numbers checkout
 * can't actually charge — a real functional lie, not a cosmetic omission.
 */
export function PricingSection() {
  return (
    <section id="pricing" className="relative z-10 overflow-hidden px-6 py-16 md:py-24">
      <div className="relative max-w-[1100px] mx-auto text-center">
        <SectionEyebrow label="Pricing" tag="Priced by quota" />
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
      </div>

      <div className="relative z-[3] mt-14 -mx-6 px-6 flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory lg:mx-auto lg:max-w-6xl lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0">
        {TIER_ORDER.map((key, i) => {
          const tier = TIERS[key];
          const isPro = key === "pro";
          const features = [
            `${tier.agents} agent${tier.agents > 1 ? "s" : ""}`,
            tier.network,
            tier.quota,
          ];

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className={`shrink-0 w-[280px] snap-center lg:w-auto liquid-glass rounded-[var(--radius-cards)] p-6 flex flex-col min-h-[480px] transition-all duration-500 hover:-translate-y-2 ${
                isPro ? "border border-lime-phosphor/40 hover:border-lime-phosphor/70" : "hover:border-white/20"
              }`}
            >
              {isPro && (
                <span className="self-start mb-3 px-2 py-0.5 rounded-full bg-lime-phosphor text-vault-floor text-[11px] font-semibold">
                  Most popular
                </span>
              )}
              <div className="text-white/60 text-sm">{tier.name}</div>
              <div className="mt-1.5 text-3xl font-semibold tracking-tight text-white font-jetbrains-mono tabular-nums">
                {tier.priceUsd === 0 ? "Free" : `$${tier.priceUsd}/mo`}
              </div>
              <p className="mt-3 text-xs text-white/45 leading-[1.5] min-h-[3em]">
                {TIER_BLURB[key]}
              </p>

              <ul className="mt-6 flex flex-col gap-3">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-white/80">
                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-lime-phosphor" aria-hidden />
                    </span>
                    <span className="leading-[1.4]">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Lime fill everywhere, not just Pro — DESIGN.md documents no
                  filled-white button at all; the only filled variant in the
                  system is lime-as-primary-action (matching Button.tsx's
                  "primary" used the same way on apps/web's real /pricing
                  page). "Most popular" alone carries the Pro distinction. */}
              <a
                href={links.pricing}
                className="mt-auto pt-8 self-center rounded-[var(--radius-pills)] bg-lime-phosphor text-vault-floor px-8 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
              >
                {key === "free" ? "Get started" : `Choose ${tier.name}`}
              </a>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
