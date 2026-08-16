"use client";

import { Nav } from "@/components/poster/Nav";
import { Footer } from "@/components/poster/Footer";
import { Card } from "@/components/ui/Card";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { TopUpCard } from "@/components/billing/TopUpCard";
import { useBalance, formatTokens, type BillableEventKey } from "@/lib/hooks/useBalance";
import { PRICES_USD } from "@puno/shared";

const ROWS: { key: BillableEventKey; name: string; blurb: string }[] = [
  {
    key: "screen",
    name: "Market check",
    blurb: "The agent looks at a move and decides whether it's worth thinking about.",
  },
  {
    key: "decision",
    name: "Decision",
    blurb: "A full thesis with a position size, confidence, and the risk engine's verdict.",
  },
  {
    key: "trade",
    name: "Executed trade",
    blurb: "Charged only when a swap actually confirms on-chain. Reverted trades are free.",
  },
];

export default function PricingPage() {
  const { data } = useBalance();

  // Falls back to the shared constants before the session loads, so the table
  // is never empty — the per-account numbers differ only when a key is set.
  const pricesUsd = data?.pricesUsd ?? PRICES_USD;
  const rate = data?.tokenPrice?.priceUsd ?? null;

  return (
    <div data-density="poster">
      <Nav />
      <section className="mx-auto max-w-(--layout-max-width) px-[var(--spacing-24)] py-[var(--spacing-80)]">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <h1 className="mt-[var(--spacing-24)] max-w-3xl text-heading-sm font-denim-ink font-bold text-white md:text-heading">
          You pay for what the agent does. Nothing else.
        </h1>
        <p className="mt-[var(--spacing-32)] max-w-xl text-body text-white">
          No plans, no monthly minimum, no seat you forget to cancel. Top up a balance in PUNO and
          it draws down per action — an idle agent costs nothing.
        </p>

        <div className="mt-[var(--spacing-72)] grid grid-cols-1 gap-[var(--spacing-24)] lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <div className="flex flex-col gap-[var(--spacing-24)]">
                {ROWS.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-[var(--spacing-8)] border-b border-white/10 pb-[var(--spacing-24)] last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-[var(--spacing-24)]"
                  >
                    <div className="sm:flex-1">
                      <div className="text-body-sm font-denim-ink text-white">{row.name}</div>
                      <p className="mt-[var(--spacing-4)] text-body-sm text-white-muted">
                        {row.blurb}
                      </p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <div className="text-subheading font-jetbrains-mono tabular-nums text-lime-phosphor">
                        ${pricesUsd[row.key].toFixed(2)}
                      </div>
                      <div className="text-num-xs font-jetbrains-mono tabular-nums text-white-faint">
                        {data?.pricesTokens
                          ? `${formatTokens(data.pricesTokens[row.key], 2, data.contracts.punoDecimals)} PUNO`
                          : rate === null
                            ? "PUNO rate pending"
                            : "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-[var(--spacing-24)] text-body-sm text-white-muted">
                Prices are set in dollars and converted to PUNO at the current rate, so what an
                action costs you doesn&rsquo;t swing with the token.{" "}
                {data?.usesOwnKey
                  ? "Your own Anthropic key is set, so thinking is free — you're only billed for executed trades."
                  : "Bring your own Anthropic key and the first two lines drop to zero."}
              </p>
            </Card>
          </div>

          <div className="flex flex-col gap-[var(--spacing-16)]">
            {data && (
              <Card>
                <div className="text-num-xs uppercase text-white-faint font-jetbrains-mono">
                  Your balance
                </div>
                <div className="mt-[var(--spacing-8)] text-subheading font-jetbrains-mono tabular-nums text-white">
                  ${data.balanceUsd.toFixed(2)}
                </div>
                <div className="mt-[var(--spacing-4)] text-num-xs text-white-faint font-jetbrains-mono">
                  ≈ {data.decisionsRemaining} decisions
                </div>
              </Card>
            )}
            <TopUpCard />
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
