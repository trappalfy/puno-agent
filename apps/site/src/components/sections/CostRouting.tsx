import { motion } from "motion/react";
import { PRICES_USD } from "@puno/shared";
import { SectionEyebrow } from "../primitives/SectionEyebrow";
import { COST_TIERS } from "../../lib/copy";

const CHIPS = ["Deterministic checks first", "Cheap model screens", "Flagship only on escalation", "Every rejection logged"];

export function CostRouting() {
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-10 md:gap-16 items-start">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7 }}
      >
        <SectionEyebrow label="Cost routing" tag="AI-native" />
        <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
          Most ticks never
          <br />
          reach a model.
        </h2>
        <p className="mt-6 text-white/60 text-base leading-[1.6] max-w-md">
          A three-level pipeline screens every market move for free before it ever costs a token.
          Deterministic checks catch most of it; a cheap model screens what's left; the flagship
          model only runs when the cheap one decides it's actually worth a full look.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <span
              key={chip}
              className="text-xs text-white/70 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]"
            >
              {chip}
            </span>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="liquid-glass rounded-2xl p-5"
      >
        {/* This read "Today · 1,842 ticks routed" — an invented number presented
            as live telemetry on a page whose whole claim is proof over promises,
            and next to a console mock honest enough to label itself
            illustrative. There is no public tick feed to source it from yet, so
            the header says what the panel actually is. */}
        <div className="text-xs text-white/50 font-jetbrains-mono">
          Per action · priced in USD, paid in PUNO
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {COST_TIERS.map((tier) => (
            <div key={tier.label} className="liquid-glass rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">{tier.label}</span>
                <span
                  className={`text-sm font-semibold font-jetbrains-mono tabular-nums ${
                    tier.lime ? "text-lime-phosphor" : "text-white"
                  }`}
                >
                  {tier.key === null ? "$0" : `$${PRICES_USD[tier.key].toFixed(2)}`}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-white/50 leading-[1.4]">{tier.body}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
