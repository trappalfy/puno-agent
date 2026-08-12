import { motion } from "motion/react";
import { GUARANTEES } from "../../lib/copy";

/**
 * Replaces the source prompt's Testimonials section — see copy.ts's comment
 * on GUARANTEES for why: naming real companies as customers would be false
 * for a testnet-only product with no user base yet. Same 3-column
 * liquid-glass layout, verifiable claims instead of invented quotes.
 */
export function Guarantees() {
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-28 border-t border-white/10">
      <div className="grid md:grid-cols-3 gap-6">
        {GUARANTEES.map((g, i) => (
          <motion.figure
            key={g.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="liquid-glass rounded-2xl p-6"
          >
            <blockquote className="text-sm text-white/80 leading-[1.6]">{g.body}</blockquote>
            <figcaption className="mt-6 pt-5 border-t border-white/10">
              <div className="text-sm font-semibold text-white">{g.title}</div>
              <div className="text-xs text-white font-semibold tracking-wide mt-1">
                ENFORCED ON-CHAIN
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}
