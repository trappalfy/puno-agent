import { motion } from "motion/react";
import { CtaButton } from "../primitives/CtaButton";
import { links } from "../../lib/config";

export function FinalCta() {
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7 }}
        className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 md:py-24 text-center"
      >
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(600px circle at 50% 0%, color-mix(in oklab, var(--color-lime-phosphor) 25%, transparent), transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
            Trade with proof,
            <br />
            not promises.
          </h2>
          <p className="mt-6 text-white/60 max-w-md mx-auto text-sm leading-[1.6]">
            Deploy a vault, set the limits yourself, and let an agent propose trades within them.
            Testnet is open now — bring a wallet, not real funds.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <CtaButton href={links.createAgent} label="Create an agent" />
            <CtaButton href={links.pricing} label="See pricing" variant="outline" />
          </div>
        </div>
      </motion.div>
    </section>
  );
}
