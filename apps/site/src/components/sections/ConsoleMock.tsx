import { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, Search, Star, Archive, Trash2, MoreHorizontal, FileText } from "lucide-react";
import { STRATEGIES, SIGNALS } from "../../lib/copy";

const NAV_ITEMS = [
  { label: "Agents", count: 3, active: true },
  { label: "Signals", count: 12 },
  { label: "Positions", count: null },
  { label: "History", count: null },
  { label: "Alerts", count: 2 },
  { label: "Archive", count: null },
];

const CONFIDENCE = 78;

/**
 * The prompt's inbox mockup, rebuilt as the agent console it stands in for.
 * Same anatomy — sidebar / list / reader, three columns wide (3/4/5 of 12) —
 * but the reader renders DESIGN.md's actual Reasoning Card spec (thesis,
 * confidence bar, risk-engine verdict) rather than invented copy, so this
 * mock and the real product agree on what a decision looks like.
 */
export function ConsoleMock() {
  const [activeSignal, setActiveSignal] = useState(0);
  const signal = SIGNALS[activeSignal]!;

  return (
    <section id="how-it-works" className="relative z-10 max-w-6xl mx-auto px-6 py-16 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-2xl overflow-hidden border border-white/10 bg-vault-floor/90 backdrop-blur-2xl"
      >
        <div className="h-10 flex items-center px-4 border-b border-white/10 relative">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 text-xs text-white/50">
            Puno — Console
          </span>
        </div>

        <div className="grid grid-cols-12 h-[520px]">
          {/* Sidebar */}
          <div className="col-span-12 md:col-span-3 border-b md:border-b-0 md:border-r border-white/10 bg-black/20 p-4 hidden sm:flex flex-col">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-lime-phosphor text-vault-floor text-xs font-semibold px-3 py-2"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              New agent
            </button>

            <nav className="mt-5 flex flex-col gap-0.5 text-sm">
              {NAV_ITEMS.map((item) => (
                <span
                  key={item.label}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${
                    item.active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5"
                  }`}
                >
                  {item.label}
                  {item.count !== null && (
                    <span className="text-xs font-jetbrains-mono text-white/40">{item.count}</span>
                  )}
                </span>
              ))}
            </nav>

            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-wide text-white/40 px-2.5">
                Strategies
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {STRATEGIES.map((s) => (
                  <span
                    key={s.name}
                    className="flex items-center gap-2 px-2.5 py-1 text-xs text-white/70"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Signal feed */}
          <div className="col-span-12 md:col-span-4 border-b md:border-b-0 md:border-r border-white/10 flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Search className="w-3.5 h-3.5 text-white/40" aria-hidden />
              <span className="text-xs text-white/40">Search signals</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {SIGNALS.map((s, i) => (
                <button
                  key={s.subject}
                  type="button"
                  onClick={() => setActiveSignal(i)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 ${
                    i === activeSignal ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm truncate ${s.unread ? "text-white font-medium" : "text-white/70"}`}
                    >
                      {s.source}
                    </span>
                    <span className="text-[11px] text-white/40 shrink-0 font-jetbrains-mono">
                      {s.time}
                    </span>
                  </div>
                  <div className="text-xs text-white/70 truncate mt-0.5">{s.subject}</div>
                  <div className="text-xs text-white/40 truncate mt-0.5">{s.preview}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Reader — DESIGN.md's Reasoning Card */}
          <div className="col-span-12 md:col-span-5 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
              <div className="flex items-center gap-1">
                {[Star, Archive, Trash2].map((Icon, i) => (
                  <span
                    key={i}
                    className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center text-white/60"
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden />
                  </span>
                ))}
              </div>
              <MoreHorizontal className="w-4 h-4 text-white/40" aria-hidden />
            </div>

            <div className="px-5 py-4 overflow-y-auto">
              <h3 className="text-white font-semibold text-sm">{signal.subject}</h3>
              <div className="flex items-center gap-2.5 mt-3">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-lime-phosphor to-canopy-mid flex items-center justify-center text-[11px] font-bold text-vault-floor">
                  {signal.source[0]}
                </span>
                <div className="text-xs">
                  <div className="text-white font-medium">{signal.source}</div>
                  <div className="text-white/40">Haiku 4.5 · {signal.time}</div>
                </div>
                <span className="ml-auto px-2 py-0.5 rounded-full border border-lime-phosphor/40 text-lime-phosphor text-[11px]">
                  Momentum
                </span>
              </div>

              <div className="mt-4 liquid-glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-lime-phosphor">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden />
                  Reasoning by Claude
                </div>
                <p className="mt-2 text-xs text-white/70 leading-[1.5]">{signal.preview}</p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-lime-phosphor" style={{ width: `${CONFIDENCE}%` }} />
                  </div>
                  <span className="text-[11px] text-white/50 font-jetbrains-mono tabular-nums">
                    {CONFIDENCE}% confidence
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      signal.subject.startsWith("Rejected") ? "bg-signal-red" : "bg-lime-phosphor"
                    }`}
                    aria-hidden
                  />
                  <span className="text-white/60">
                    Risk engine:{" "}
                    <span className="text-white">
                      {signal.subject.startsWith("Rejected") ? "rejected" : "accepted"}
                    </span>
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs text-white/50 leading-[1.5]">
                Screened by Haiku 4.5 against the vault's on-chain limits before Opus 5 was ever
                called — most ticks never reach a flagship model.
              </p>

              <span className="mt-4 inline-flex items-center gap-2 text-xs text-white/50 px-3 py-1.5 rounded-full border border-white/10">
                <FileText className="w-3 h-3" aria-hidden />
                decision-log.json
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <p className="mt-4 text-center text-xs text-white/40 font-jetbrains-mono">
        Illustrative — not a real position.
      </p>
    </section>
  );
}
