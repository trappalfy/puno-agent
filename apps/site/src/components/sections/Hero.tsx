import { motion } from "motion/react";
import { CtaButton } from "../primitives/CtaButton";
import { links } from "../../lib/config";

export function Hero() {
  return (
    <section className="relative z-10 pt-16 md:pt-28 pb-20 px-6 text-center flex flex-col items-center">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="text-4xl md:text-7xl font-semibold tracking-tight leading-[0.9]"
      >
        <span className="block text-white">Trade onchain.</span>
        <span className="block text-shiny" style={{ filter: "url(#noise-headline)" }}>
          Non-custodial.
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7 }}
        className="mt-8 text-white/60 max-w-md text-base leading-[1.5]"
      >
        Puno is an agent-native trading platform. It reasons about market moves with Claude,
        proposes trades from a vault only you control, and structurally cannot withdraw a single
        token — that function only accepts your wallet's signature.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.7 }}
        className="mt-8 flex flex-col items-center gap-3"
      >
        <CtaButton href={links.createAgent} label="Create an agent" />
        <span className="text-xs text-white/40">Testnet live on Robinhood Chain · 46630</span>
      </motion.div>
    </section>
  );
}
