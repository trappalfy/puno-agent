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
            See it read a real portfolio, argue a position and check itself against on-chain
            limits — one decision, free, nothing deployed. Then set your own limits and let it run.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <CtaButton href={links.tryAgent} label="Watch it make one decision" />
            <CtaButton href={links.createAgent} label="Create an agent" variant="outline" />
          </div>
        </div>
      </motion.div>
    </section>
  );
}
