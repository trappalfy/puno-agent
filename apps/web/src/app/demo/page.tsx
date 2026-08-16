import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { schema, getNetwork, FREE_TIER_NETWORK } from "@puno/shared";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { MetricTile } from "@/components/ui/MetricTile";
import { AddressChip } from "@/components/ui/AddressChip";
import { NetworkBadge } from "@/components/ui/NetworkBadge";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Disclosure } from "@/components/ui/Disclosure";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { LatestDecision, ReasoningHistory } from "@/components/terminal/ReasoningCard";
import { TradesTable } from "@/components/terminal/TradesTable";
import { PositionsTable } from "@/components/terminal/PositionsTable";
import type { AgentDetail } from "@/lib/hooks/useAgentDetail";

/// The demo lives on testnet, same vault the free run uses. Mainnet's
/// `demoVault` is null on purpose (see lib/trial.ts).
///
/// Taken from the shared constant rather than restated: this page and the trial
/// runner must always mean the same network, and a second literal is how they
/// would eventually stop doing so.
const DEMO_NETWORK = FREE_TIER_NETWORK;

/// Reads the database on every request rather than at build time. A build-time
/// prerender would need a database to build at all, and would then serve a
/// snapshot frozen at deploy — for a page whose entire claim is "this is what
/// the agent actually did", stale is the one thing it must not be.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Puno — what the agent actually decided",
  description:
    "A live, read-only view of Puno's demo vault: every signal, the reasoning behind each decision, and the trades that reached the chain. No wallet required.",
};

/// Public, read-only, no wallet.
///
/// The competitive review's second-largest gap was that nothing at all was
/// visible before connecting a wallet, on a product whose pitch is "proof, not
/// promises". Everything here already existed in the database; it was simply
/// behind an auth wall.
///
/// This deliberately does **not** go through `/api`. Every route there is
/// `requireAccount`-gated, and adding a public one would mean a second place
/// where field-level exposure has to be got right. Reading here, in a server
/// component, keeps the projection in one file — and note every `select` below
/// names its columns. `signals.modelCallId` and `decisions.modelCallId` lead to
/// `modelCalls.costUsd`, which is **our** cost, not the user's price; the two
/// are kept apart everywhere else in the codebase and a `select *` here would
/// have quietly published the margin.
export default async function DemoPage() {
  const network = getNetwork(DEMO_NETWORK);
  const demo = network.demoVault;

  if (!demo) return <Unavailable reason="no-vault" />;

  const [vault] = await db
    .select({ id: schema.vaults.id, address: schema.vaults.address })
    .from(schema.vaults)
    .where(and(eq(schema.vaults.address, demo.address), eq(schema.vaults.network, DEMO_NETWORK)))
    .limit(1);

  if (!vault) return <Unavailable reason="no-runs" />;

  // `kind = 'live'` only, and this is a privacy boundary rather than a filter
  // for tidiness. Trial agents sit on this same shared vault but belong to
  // whichever account pressed the button; their reasoning is not ours to
  // publish. The live agent is the one we run ourselves.
  const [agent] = await db
    .select({ id: schema.agents.id, name: schema.agents.name })
    .from(schema.agents)
    .where(and(eq(schema.agents.vaultId, vault.id), eq(schema.agents.kind, "live")))
    .limit(1);

  if (!agent) return <Unavailable reason="no-runs" />;

  const [signalRows, tradeRows, positionRows] = await Promise.all([
    db
      .select({
        id: schema.signals.id,
        triggerReasons: schema.signals.triggerReasons,
        escalate: schema.signals.escalate,
        reason: schema.signals.reason,
        createdAt: schema.signals.createdAt,
      })
      .from(schema.signals)
      .where(eq(schema.signals.agentId, agent.id))
      .orderBy(desc(schema.signals.createdAt))
      .limit(50),
    db
      .select({
        id: schema.trades.id,
        tokenIn: schema.trades.tokenIn,
        tokenOut: schema.trades.tokenOut,
        amountIn: schema.trades.amountIn,
        amountOut: schema.trades.amountOut,
        notionalUsd: schema.trades.notionalUsd,
        status: schema.trades.status,
        txHash: schema.trades.txHash,
        simulateError: schema.trades.simulateError,
        createdAt: schema.trades.createdAt,
      })
      .from(schema.trades)
      .where(eq(schema.trades.agentId, agent.id))
      .orderBy(desc(schema.trades.createdAt))
      .limit(50),
    db
      .select({
        id: schema.positions.id,
        token: schema.positions.token,
        tokenSymbol: schema.positions.tokenSymbol,
        decimals: schema.positions.decimals,
        rawBalance: schema.positions.rawBalance,
        valueUsd: schema.positions.valueUsd,
        entryPriceUsd: schema.positions.entryPriceUsd,
      })
      .from(schema.positions)
      .where(eq(schema.positions.vaultId, vault.id)),
  ]);

  const decisionRows = await db
    .select({
      id: schema.decisions.id,
      signalId: schema.decisions.signalId,
      action: schema.decisions.action,
      ticker: schema.decisions.ticker,
      sizePct: schema.decisions.sizePct,
      confidence: schema.decisions.confidence,
      thesis: schema.decisions.thesis,
      riskFlags: schema.decisions.riskFlags,
      riskVerdict: schema.decisions.riskVerdict,
      riskReason: schema.decisions.riskReason,
    })
    .from(schema.decisions)
    .where(eq(schema.decisions.agentId, agent.id));

  const decisionBySignal = new Map(decisionRows.map((d) => [d.signalId, d]));

  // Dates to ISO strings, because the presentational components are shared with
  // the client-side dashboard and were written against the JSON shape.
  const signals: AgentDetail["signals"] = signalRows.map((s) => {
    const d = decisionBySignal.get(s.id);
    return {
      id: s.id,
      triggerReasons: s.triggerReasons,
      escalate: s.escalate,
      reason: s.reason,
      createdAt: s.createdAt.toISOString(),
      decision: d
        ? {
            id: d.id,
            action: d.action,
            ticker: d.ticker,
            sizePct: d.sizePct,
            confidence: d.confidence,
            thesis: d.thesis,
            riskFlags: d.riskFlags,
            riskVerdict: d.riskVerdict,
            riskReason: d.riskReason,
          }
        : null,
    };
  });

  const trades: AgentDetail["trades"] = tradeRows.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }));

  const [latest, ...earlier] = signals;
  const navUsd = positionRows.reduce((sum, p) => sum + Number(p.valueUsd), 0);
  const escalated = signals.filter((s) => s.escalate).length;
  const confirmed = trades.filter((t) => t.status === "confirmed").length;

  return (
    <div
      data-density="terminal"
      className="mx-auto flex min-h-screen max-w-[var(--layout-max-width)] flex-col gap-[var(--layout-section-gap)] p-[var(--layout-card-padding)]"
    >
      <header>
        <SectionEyebrow>Live demo · read-only</SectionEyebrow>
        <h1 className="mt-[var(--spacing-12)] text-app-heading font-denim-ink font-semibold text-white">
          What the agent actually decided
        </h1>
        <p className="mt-[var(--spacing-8)] max-w-2xl text-app-body text-white-muted">
          This is Puno&apos;s own vault on {network.name}, not a mock-up. Every decision below was
          produced by the same pipeline a paying agent runs, against real prices, and any trade that
          reached the chain carries a hash you can open in the explorer.
        </p>
        <div className="mt-[var(--spacing-16)] flex flex-wrap items-center gap-[var(--spacing-16)]">
          <NetworkBadge network={DEMO_NETWORK} />
          <AddressChip address={vault.address} explorerBaseUrl={network.explorerUrl} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-[var(--layout-element-gap)] md:grid-cols-3">
        <MetricTile
          label="NAV"
          value={`$${navUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        {/* The ratio, not just the total. It is the one number that shows the
            cost ladder doing its job: most signals stop at the cheap model and
            never cost a decision. A bare "5 signals" would say nothing. */}
        <MetricTile label="Signals · escalated" value={`${signals.length} · ${escalated}`} />
        <MetricTile label="Trades on-chain" value={String(confirmed)} />
      </div>

      {signals.length === 0 ? (
        <Unavailable reason="no-runs" inline />
      ) : (
        <>
          {latest && <LatestDecision signal={latest} />}

          {earlier.length > 0 && (
            <Disclosure
              title="Earlier signals"
              // Escalated *and* not: a signal the cheap model stopped is the
              // one this page most wants a sceptic to be able to open.
              summary={`${earlier.length} · ${earlier.filter((s) => !s.escalate).length} stopped at screening`}
            >
              <ReasoningHistory signals={earlier} />
            </Disclosure>
          )}

          <Disclosure
            title="Trade history"
            summary={trades.length === 0 ? "none" : `${trades.length} · ${confirmed} confirmed`}
          >
            <TradesTable trades={trades} explorerBaseUrl={network.explorerUrl} />
          </Disclosure>

          <Disclosure
            title="Positions"
            summary={`${positionRows.length} · $${navUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          >
            <PositionsTable positions={positionRows} />
          </Disclosure>
        </>
      )}

      <Card elevated>
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">
          Run one on your own vault
        </h2>
        <p className="mt-[var(--spacing-8)] max-w-2xl text-app-body-sm text-white-muted">
          The vault is deployed to your address, the limits are yours and written on-chain, and only
          your wallet can withdraw from it. The first run is free.
        </p>
        <div className="mt-[var(--spacing-16)] flex flex-wrap gap-[var(--spacing-12)]">
          <ButtonLink href="/app/try">Take a free run</ButtonLink>
          <ButtonLink href="/app" variant="ghost">
            Open the console
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}

/// Says which kind of nothing this is. "No demo configured on this network" and
/// "the agent has not run yet" are different facts, and a single empty state
/// covering both would be the vaguest thing on a page whose whole point is
/// being checkable.
function Unavailable({
  reason,
  inline = false,
}: {
  reason: "no-vault" | "no-runs";
  inline?: boolean;
}) {
  const body =
    reason === "no-vault"
      ? "There is no demo vault configured for this network yet, so there is nothing to show. This is a configuration state, not an error."
      : "The demo agent has not recorded a signal yet. Nothing is hidden — there is genuinely nothing here to show until it runs.";

  const card = (
    <Card>
      <p className="text-app-body-sm text-white-muted">{body}</p>
    </Card>
  );

  if (inline) return card;

  return (
    <div
      data-density="terminal"
      className="mx-auto flex min-h-screen max-w-[var(--layout-max-width)] flex-col gap-[var(--layout-section-gap)] p-[var(--layout-card-padding)]"
    >
      <header>
        <SectionEyebrow>Live demo · read-only</SectionEyebrow>
        <h1 className="mt-[var(--spacing-12)] text-app-heading font-denim-ink font-semibold text-white">
          What the agent actually decided
        </h1>
      </header>
      {card}
    </div>
  );
}
