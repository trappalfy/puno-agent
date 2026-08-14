import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { CtaButton } from "../primitives/CtaButton";
import { links } from "../../lib/config";

export function Hero() {
  return (
    <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
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
        <CtaButton href={links.tryAgent} label="Watch it make one decision" />
        <span className="text-xs text-white/40">
          Free, no vault to deploy · Testnet live on Robinhood Chain · 46630
        </span>
      </motion.div>

      {/* Nothing is visible below the fold now, so without a cue a full-bleed
          hero reads as the whole page. Enters last, after the headline and CTA
          have had their turn. The bob is a motion.* transform, so the app-wide
          MotionConfig reducedMotion="user" already collapses it. */}
      <motion.a
        href="#how-it-works"
        aria-label="Scroll to see how it works"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/35 transition-colors hover:text-white"
      >
        <motion.span
          className="block"
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-5 h-5" aria-hidden />
        </motion.span>
      </motion.a>
    </section>
  );
}
