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
                    {/* PUNO is the price, not a conversion shown beside one.
                        The dollar figure used to be the headline with PUNO in
                        faint text underneath; that had it backwards for a
                        product you can only pay for in PUNO. USD appears only
                        when there is no rate to quote — a number the user
                        cannot act on beats no number at all. */}
                    <div className="shrink-0 text-left sm:text-right">
                      <div className="text-subheading font-jetbrains-mono tabular-nums text-lime-phosphor">
                        {data?.pricesTokens
                          ? `${formatTokens(data.pricesTokens[row.key], 0, data.contracts.punoDecimals)} PUNO`
                          : `$${pricesUsd[row.key].toFixed(2)}`}
                      </div>
                      {!data?.pricesTokens && (
                        <div className="text-num-xs font-jetbrains-mono tabular-nums text-white-faint">
                          {rate === null ? "PUNO rate pending" : "—"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Says the PUNO figures move without leading with dollars. The
                  sentence has to exist: a price quoted in PUNO will visibly
                  change on its own, and "the price went up" is the wrong thing
                  for someone to conclude when the cost of the work held still. */}
              <p className="mt-[var(--spacing-24)] text-body-sm text-white-muted">
                These amounts follow the market — they move as PUNO moves, so the work an action
                buys stays the same.{" "}
                {data?.usesOwnKey
                  ? "Your own Anthropic key is set, so thinking is free — you're only billed for executed trades."
                  : "Bring your own Anthropic key and the first two lines drop to zero."}
              </p>
            </Card>
          </div>

          <div className="flex flex-col gap-[var(--spacing-16)]">
            {data && (
              <Card>
                {/* Decisions, not PUNO. Prices are quoted in PUNO because a
                    price list is a menu and a menu may re-price; a balance is a
                    stored amount, and rendering it in PUNO would make it fall
                    every time the token rose — hitting hardest exactly the
                    people most invested in it rising. Decisions is the unit
                    that only changes when the agent has done something. */}
                <div className="text-num-xs uppercase text-white-faint font-jetbrains-mono">
                  Your balance
                </div>
                <div className="mt-[var(--spacing-8)] text-subheading font-jetbrains-mono tabular-nums text-white">
                  {data.decisionsRemaining} decision{data.decisionsRemaining === 1 ? "" : "s"}
                </div>
                <div className="mt-[var(--spacing-4)] text-num-xs text-white-faint font-jetbrains-mono">
                  {data.balanceUsd > 0 && data.decisionsRemaining === 0
                    ? "not enough for a full decision"
                    : "topped up in PUNO, spent per action"}
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
