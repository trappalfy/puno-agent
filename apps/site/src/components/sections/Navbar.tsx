import { useState } from "react";
import { motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { LogoMark } from "../primitives/LogoMark";
import { CtaButton } from "../primitives/CtaButton";
import { NAV_LINKS } from "../../lib/copy";
import { links } from "../../lib/config";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      // w-full is load-bearing: as a flex child, `mx-auto` makes the auto
      // margins win over stretch, so the bar shrank to fit its contents and
      // justify-between had no free space left to push the logo, links and CTA
      // apart. shrink-0 keeps it from being squeezed vertically by the hero.
      className="relative z-20 w-full max-w-6xl shrink-0 mx-auto px-6 py-5 flex items-center justify-between"
    >
      {/* Space Grotesk reports unitsPerEm 1000 / sCapHeight 700 in its OS/2
          table, so a capital is exactly 0.70em; matching the mark's true 28px
          would take 40px. Set to 36 by eye instead — a cap a shade under the
          mark reads as a lockup rather than a collision. leading-none keeps
          the line box from padding the bar's height. */}
      <a href="#top" className="flex items-center gap-3 text-white">
        <LogoMark className="w-7 h-7" />
        <span className="text-[36px] leading-none font-semibold tracking-tight">Puno</span>
      </a>

      <div className="hidden md:flex gap-8">
        {NAV_LINKS.map((link, i) => (
          <motion.a
            key={link.href}
            href={link.href}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.5 }}
            className="text-white/70 text-sm font-medium hover:text-white transition-colors"
          >
            {link.label}
          </motion.a>
        ))}
      </div>

      <div className="hidden md:block">
        <CtaButton href={links.createAgent} label="Create an agent" />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Toggle menu"
        className="md:hidden w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white"
      >
        {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {open && (
        <div className="md:hidden absolute top-full left-6 right-6 mt-2 liquid-glass rounded-2xl p-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-white/80 text-sm font-medium py-2 px-2 rounded-lg hover:bg-white/5"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2">
            <CtaButton href={links.createAgent} label="Create an agent" full />
          </div>
        </div>
      )}
    </motion.nav>
  );
}
