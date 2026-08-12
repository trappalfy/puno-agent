import { motion } from "motion/react";
import { Search } from "lucide-react";
import { LogoMark } from "../primitives/LogoMark";

/**
 * The prompt's macOS menu bar (File/Edit/View/Go/Window/Help + a clock),
 * reframed as the terminal's own status strip — Vault/Signals/Policy/Limits
 * are real tabs from the agent console below, not decorative chrome. The
 * clock is dropped for a network badge instead: DESIGN.md already specifies
 * this exact pill (amber outline, "Testnet · <chainId>") as the Network
 * Badge component, and a fake timestamp had no reason to be there.
 */
const TABS = ["Vault", "Signals", "Policy", "Limits"];

export function TerminalBar() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9, duration: 0.6 }}
      className="relative z-10 h-10 bg-vault-floor/40 backdrop-blur-md border-t border-b border-white/10"
    >
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between text-xs">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-1.5 font-semibold text-white">
            <LogoMark className="w-3.5 h-3.5" />
            Puno
          </span>
          {TABS.map((tab, i) => (
            <span
              key={tab}
              className={`text-white/60 hover:text-white transition-colors cursor-default ${
                i > 1 ? "hidden sm:inline" : ""
              } ${i > 2 ? "sm:hidden md:inline" : ""}`}
            >
              {tab}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Search className="w-3.5 h-3.5 text-white/50" aria-hidden />
          <span className="px-2 py-0.5 rounded-full border border-signal-amber text-signal-amber text-[11px] font-jetbrains-mono">
            Testnet · 46630
          </span>
        </div>
      </div>
    </motion.div>
  );
}
