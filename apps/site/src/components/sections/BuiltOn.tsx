import { motion } from "motion/react";
import { BUILT_ON } from "../../lib/copy";

export function BuiltOn() {
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-16 md:py-20">
      <p className="text-center text-xs uppercase tracking-widest text-white/40">Built on</p>
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-6">
        {BUILT_ON.map((name, i) => (
          <motion.span
            key={name}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05, duration: 0.5 }}
            className="text-center text-sm font-semibold tracking-tight text-white/50 hover:text-white transition-colors"
          >
            {name}
          </motion.span>
        ))}
      </div>
    </section>
  );
}
