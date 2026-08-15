"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  agentVaultAbi,
  vaultFactoryAbi,
  getNetwork,
  getAssets,
  EQUITY_STALENESS_SECONDS,
  type TradableAsset,
} from "@puno/shared";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { AddressChip } from "@/components/ui/AddressChip";
import { NetworkBadge } from "@/components/ui/NetworkBadge";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";

const network = getNetwork("testnet"); // testnet-only until a separate mainnet decision (plan 2.5 #1)

const AGENT_KEY_DAYS = 30;

type Step = "form" | "deploying" | "done";

interface FormState {
  agentName: string;
  // On-chain — written into the vault by setPolicy.
  maxNotionalPerTradeUsd: string;
  maxDailyNotionalUsd: string;
  maxPositionPct: string;
  minSecondsBetweenTrades: string;
  maxSlippagePct: string;
  quoteFeedAddress: string;
  quoteFeedStalenessHours: string;
  // Off-chain — stored in the DB, honoured by the worker only.
  stopLossPct: string;
  takeProfitPct: string;
  maxReviewIntervalHours: string;
  priceMoveTriggerPct: string;
  maxCallsPerHour: string;
}

type Preset = Omit<FormState, "agentName" | "quoteFeedAddress" | "quoteFeedStalenessHours">;

/// Chainlink's documented heartbeat on Robinhood Chain is 24h. The quote token
/// is a dollar peg, so it almost never deviates enough to publish early — in
/// practice its answer really is close to a day old, and a shorter window makes
/// every trade revert on the quote price. Two hours of margin over the
/// heartbeat; the contract's own cap is 48h.
const DEFAULT_FEED_STALENESS_HOURS = "26";
const MAX_FEED_STALENESS_HOURS = 48;

/**
 * The form takes percentages because that is how the same limits are read
 * back everywhere else (RiskLimitsPanel renders every bps value as a
 * percentage). Basis points are the contract's unit, not the user's, so the
 * conversion happens here and the raw bps is shown as a field hint — visible
 * for anyone reconciling against the chain, never something to type.
 */
const pctToBps = (pct: string): number => Math.round(Number(pct) * 100);

/**
 * "Balanced" is exactly the set of defaults this page shipped with, so the
 * redesign changes no risk number on its own. The other two are deliberately
 * far apart — the honest problem with an eleven-field risk form is that a
 * first-time user has no idea what a reasonable slippage ceiling is.
 */
const PRESETS = {
  Conservative: {
    maxNotionalPerTradeUsd: "250",
    maxDailyNotionalUsd: "750",
    maxPositionPct: "25",
    minSecondsBetweenTrades: "300",
    maxSlippagePct: "0.50",
    stopLossPct: "5",
    takeProfitPct: "10",
    maxReviewIntervalHours: "12",
    priceMoveTriggerPct: "2",
    maxCallsPerHour: "6",
  },
  Balanced: {
    maxNotionalPerTradeUsd: "1000",
    maxDailyNotionalUsd: "3000",
    maxPositionPct: "80",
    minSecondsBetweenTrades: "60",
    maxSlippagePct: "1.00",
    stopLossPct: "10",
    takeProfitPct: "20",
    maxReviewIntervalHours: "24",
    priceMoveTriggerPct: "3",
    maxCallsPerHour: "12",
  },
  Aggressive: {
    maxNotionalPerTradeUsd: "5000",
    maxDailyNotionalUsd: "15000",
    maxPositionPct: "100",
    minSecondsBetweenTrades: "15",
    maxSlippagePct: "2.00",
    stopLossPct: "20",
    takeProfitPct: "40",
    maxReviewIntervalHours: "6",
    priceMoveTriggerPct: "5",
    maxCallsPerHour: "30",
  },
} satisfies Record<string, Preset>;

type PresetName = keyof typeof PRESETS;
const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

const DEFAULTS: FormState = {
  agentName: "",
  quoteFeedAddress: "",
  quoteFeedStalenessHours: DEFAULT_FEED_STALENESS_HOURS,
  ...PRESETS.Balanced,
};

type Errors = Partial<Record<keyof FormState, string>>;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Flags only values that are present and wrong — never a field the user has
 * simply not reached yet, so the form does not paint itself red on arrival.
 * Blank required fields stop the Deploy button instead (see `canDeploy`).
 *
 * Worth having because the alternative feedback loop is brutal: setPolicy is
 * the third of four signatures, so a number the contract rejects is only
 * discovered after two confirmed transactions and real gas.
 */
function validate(f: FormState): Errors {
  const e: Errors = {};
  const filled = (v: string) => v.trim() !== "";
  const n = (v: string) => Number(v.trim());

  for (const key of ["maxNotionalPerTradeUsd", "maxDailyNotionalUsd"] as const) {
    if (filled(f[key]) && !(n(f[key]) > 0)) e[key] = "Must be a number above zero.";
  }

  // A daily cap under the per-trade cap makes the per-trade number a fiction:
  // the vault would revert the very first trade that tried to use it.
  const perTrade = n(f.maxNotionalPerTradeUsd);
  const daily = n(f.maxDailyNotionalUsd);
  if (!e.maxDailyNotionalUsd && perTrade > 0 && daily > 0 && daily < perTrade) {
    e.maxDailyNotionalUsd = `Below the per-trade cap, so a full ${usd(f.maxNotionalPerTradeUsd)} trade could never clear.`;
  }

  if (filled(f.maxPositionPct) && !(n(f.maxPositionPct) > 0 && n(f.maxPositionPct) <= 100)) {
    e.maxPositionPct = "A share of the vault — between 0 and 100.";
  }
  if (filled(f.maxSlippagePct) && !(n(f.maxSlippagePct) >= 0 && n(f.maxSlippagePct) <= 100)) {
    e.maxSlippagePct = "Between 0 and 100.";
  }
  if (filled(f.minSecondsBetweenTrades) && !(n(f.minSecondsBetweenTrades) >= 0)) {
    e.minSecondsBetweenTrades = "Cannot be negative.";
  }
  if (filled(f.quoteFeedAddress) && !ADDRESS_RE.test(f.quoteFeedAddress.trim())) {
    e.quoteFeedAddress = "Not an address — expected 0x and 40 hex characters.";
  }
  const staleness = n(f.quoteFeedStalenessHours);
  if (filled(f.quoteFeedStalenessHours) && !(staleness > 0)) {
    e.quoteFeedStalenessHours = "Must be greater than zero, or every trade reverts.";
  } else if (staleness > MAX_FEED_STALENESS_HOURS) {
    e.quoteFeedStalenessHours = `The vault caps this at ${MAX_FEED_STALENESS_HOURS} hours.`;
  }

  for (const key of ["stopLossPct", "takeProfitPct", "priceMoveTriggerPct"] as const) {
    if (filled(f[key]) && !(n(f[key]) >= 0)) e[key] = "Cannot be negative.";
  }
  for (const key of ["maxReviewIntervalHours", "maxCallsPerHour"] as const) {
    if (filled(f[key]) && !(n(f[key]) > 0)) e[key] = "Must be above zero.";
  }

  return e;
}

/**
 * Dev-only. Every screen below sits behind a connected wallet *and* a
 * deployed VaultFactory, and testnet has neither yet (see config.ts —
 * `vaultFactory: null`), so there is otherwise no way to look at this page
 * while working on it. `?preview=form|deploying|done` renders each state with
 * placeholder data.
 *
 * Dead in production: NODE_ENV is statically replaced at build time, so the
 * branch folds away and `preview` is unconditionally null there.
 */
const PREVIEW_ENABLED = process.env.NODE_ENV === "development";
const PREVIEW_VAULT = "0x1111111111111111111111111111111111111111" as Address;
const PREVIEW_AGENT = "0x2222222222222222222222222222222222222222" as Address;
const PREVIEW_KEY = `0x${"ab".repeat(32)}`;

/** Everything this network can trade, pinned and verified — see assets.ts. */
const ASSETS = getAssets(network.key);

/**
 * The router the vault will allowlist.
 *
 * B1a. This used to be `network.routers.oneInch` unconditionally, which on
 * mainnet allowlisted the 1inch aggregator — a router `UniswapV3Adapter`
 * refuses to build calldata for, deliberately, since an adapter free to pick
 * its own target would be routing around the allowlist. The vault and the
 * agent have to agree on the venue, and the agent's venue is SwapRouter02.
 *
 * On testnet `uniswapV3` is null and `routers.oneInch` holds the deployed
 * MockRouter, so this resolves to the mock exactly as before.
 */
const TRADE_ROUTER: Address = network.uniswapV3?.swapRouter02 ?? network.routers.oneInch;

/**
 * The wallet signatures, in the order handleDeploy fires them.
 *
 * No longer a constant four: every allowlisted equity needs its own
 * `setPriceFeed`, because `_nav()` and `_minAcceptableOut()` both read a feed
 * per token and revert without one. Naming each ticker in the ledger is the
 * point — a user asked to sign nine times deserves to see that six of them are
 * "wire up AAPL", not an unexplained queue of prompts.
 */
function deploySteps(equities: TradableAsset[]) {
  return [
    { title: "Deploy the vault", call: "factory.createVault()" },
    { title: `Set the ${ASSETS.quote.ticker} price feed`, call: "vault.setPriceFeed()" },
    ...equities.map((a) => ({
      title: `Set the ${a.ticker} price feed`,
      call: `vault.setPriceFeed() · ${a.ticker}`,
    })),
    { title: "Write the risk limits", call: "vault.setPolicy()" },
    { title: "Arm the agent key", call: "vault.setAgent()" },
  ];
}

// useSearchParams() needs a Suspense boundary above it, or `next build` fails
// the whole route with a prerender error.
export default function NewAgentPage() {
  return (
    <Suspense fallback={null}>
      <NewAgentWizard />
    </Suspense>
  );
}

function NewAgentWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preview = PREVIEW_ENABLED ? searchParams.get("preview") : null;
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [step, setStep] = useState<Step>("form");
  const [doneSteps, setDoneSteps] = useState(0);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Kept outside `result` so a failure *after* createVault confirmed still
  // has an address to show — otherwise the user has paid gas for a vault the
  // UI has forgotten about, and would deploy a second one on retry.
  const [vaultAddress, setVaultAddress] = useState<Address | null>(null);
  const [result, setResult] = useState<{ agentAddress: Address; agentPrivateKey: string } | null>(
    null,
  );

  // Which equities this vault will be allowed to trade. All of them by default:
  // a vault that allowlists nothing is exactly the bug B2 describes, and the
  // agent can only ever trade a subset of what it is permitted anyway. Each one
  // costs a signature, which is why they are visible and unselectable rather
  // than silently appended.
  const [tickers, setTickers] = useState<string[]>(ASSETS.equities.map((a) => a.ticker));
  const chosen = ASSETS.equities.filter((a) => tickers.includes(a.ticker));

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleTicker = (ticker: string) =>
    setTickers((t) => (t.includes(ticker) ? t.filter((x) => x !== ticker) : [...t, ticker]));

  const applyPreset = (name: PresetName) => setForm((f) => ({ ...f, ...PRESETS[name] }));

  const errors = validate(form);
  const canDeploy =
    Object.keys(errors).length === 0 &&
    Boolean(form.agentName.trim()) &&
    ADDRESS_RE.test(form.quoteFeedAddress.trim());

  async function handleDeploy() {
    if (!address || !publicClient || !network.vaultFactory) return;
    setErrorMsg(null);
    setFailedAt(null);
    setDoneSteps(0);
    setStep("deploying");

    let vault = vaultAddress;
    let stage = 0;

    try {
      const quoteToken = await publicClient.readContract({
        address: network.vaultFactory,
        abi: vaultFactoryAbi,
        functionName: "quoteToken",
      });

      // Skipped on a retry where the vault already exists — deploying a
      // second vault would strand the first one's gas.
      if (!vault) {
        const createTx = await writeContractAsync({
          address: network.vaultFactory,
          abi: vaultFactoryAbi,
          functionName: "createVault",
        });
        await publicClient.waitForTransactionReceipt({ hash: createTx });
        vault = await publicClient.readContract({
          address: network.vaultFactory,
          abi: vaultFactoryAbi,
          functionName: "computeVaultAddress",
          args: [address],
        });
        setVaultAddress(vault);
      }
      stage = 1;
      setDoneSteps(1);

      const feedTx = await writeContractAsync({
        address: vault,
        abi: agentVaultAbi,
        functionName: "setPriceFeed",
        args: [
          quoteToken,
          form.quoteFeedAddress as Address,
          Math.round(Number(form.quoteFeedStalenessHours) * 3600),
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: feedTx });
      stage = 2;
      setDoneSteps(2);

      // B2. Without a feed per equity the vault cannot value the position:
      // `_nav()` and `_minAcceptableOut()` both read `priceFeeds[token]` and
      // revert when it is unset, so allowlisting a token without wiring its
      // oracle would produce a vault that accepts the ticker and then reverts
      // every trade in it.
      //
      // Staleness is the equity window, never the quote window. They are
      // different numbers for a measured reason (CLAUDE.md), and the equity one
      // has its own caveat worth knowing before this is tuned:
      // EQUITY-FEED-HOURS-2026-08-15.md.
      for (const asset of chosen) {
        const assetFeedTx = await writeContractAsync({
          address: vault,
          abi: agentVaultAbi,
          functionName: "setPriceFeed",
          args: [asset.token, asset.feed, EQUITY_STALENESS_SECONDS],
        });
        await publicClient.waitForTransactionReceipt({ hash: assetFeedTx });
        stage += 1;
        setDoneSteps(stage);
      }

      const policyTx = await writeContractAsync({
        address: vault,
        abi: agentVaultAbi,
        functionName: "setPolicy",
        args: [
          {
            allowedRouters: [TRADE_ROUTER],
            allowedTokens: [quoteToken, ...chosen.map((a) => a.token)],
            maxNotionalPerTrade: parseUnits(form.maxNotionalPerTradeUsd, 18),
            maxDailyNotional: parseUnits(form.maxDailyNotionalUsd, 18),
            maxPositionBps: BigInt(pctToBps(form.maxPositionPct)),
            minSecondsBetweenTrades: BigInt(form.minSecondsBetweenTrades),
            maxSlippageBps: BigInt(pctToBps(form.maxSlippagePct)),
          },
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: policyTx });
      // Relative, not absolute: the equity loop above already advanced `stage`
      // by one per feed, so hardcoding 3 here would rewind the ledger and show
      // completed steps as pending again.
      stage += 1;
      setDoneSteps(stage);

      const agentPrivateKey = generatePrivateKey();
      const agentAccount = privateKeyToAccount(agentPrivateKey);
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * AGENT_KEY_DAYS);
      const agentTx = await writeContractAsync({
        address: vault,
        abi: agentVaultAbi,
        functionName: "setAgent",
        args: [agentAccount.address, expiry],
      });
      await publicClient.waitForTransactionReceipt({ hash: agentTx });
      stage += 1;
      setDoneSteps(stage);

      const res = await fetch("/api/agents/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // No ownerAddress: the route takes it from the session, so the vault
        // can only ever be registered against the wallet that signed in.
        body: JSON.stringify({
          vaultAddress: vault,
          quoteToken,
          network: network.key,
          agentName: form.agentName,
          agentAddress: agentAccount.address,
          offChainLimits: {
            stopLossBps: form.stopLossPct ? pctToBps(form.stopLossPct) : null,
            takeProfitBps: form.takeProfitPct ? pctToBps(form.takeProfitPct) : null,
            maxReviewIntervalHours: Number(form.maxReviewIntervalHours),
            priceMoveTriggerBps: pctToBps(form.priceMoveTriggerPct),
            maxCallsPerHour: Number(form.maxCallsPerHour),
          },
        }),
      });
      if (!res.ok)
        throw new Error(`Vault is live on-chain, but recording it failed (${res.status}).`);

      setResult({ agentAddress: agentAccount.address, agentPrivateKey });
      setStep("done");
    } catch (err) {
      setFailedAt(stage);
      setErrorMsg((err as Error).message);
      setStep("form");
    }
  }

  if (preview === "deploying") {
    return (
      <DeployLedger
        steps={deploySteps(ASSETS.equities)}
        doneSteps={2}
        vaultAddress={PREVIEW_VAULT}
      />
    );
  }

  if (preview === "done") {
    return (
      <KeyHandover
        vaultAddress={PREVIEW_VAULT}
        agentAddress={PREVIEW_AGENT}
        agentPrivateKey={PREVIEW_KEY}
        onDone={() => router.push("/app")}
      />
    );
  }

  if (!preview && (!isConnected || !address)) {
    return (
      <Gate
        title="Connect a wallet to create an agent"
        body="The vault is deployed to your address — you sign every step from your own wallet, and only that wallet can ever withdraw from it."
      >
        <ConnectWalletButton />
      </Gate>
    );
  }

  if (!preview && !network.vaultFactory) {
    return (
      <Gate
        title={`No factory on ${network.name} yet`}
        body={`Agents are created by a VaultFactory contract, and none has been deployed to ${network.name} (chain ${network.chainId}) yet. There is nothing to configure until it is — deployment is blocked on a funded deployer key.`}
      />
    );
  }

  if (step === "done" && result && vaultAddress) {
    return (
      <KeyHandover
        vaultAddress={vaultAddress}
        agentAddress={result.agentAddress}
        agentPrivateKey={result.agentPrivateKey}
        onDone={() => router.push("/app")}
      />
    );
  }

  if (step === "deploying") {
    return (
      <DeployLedger steps={deploySteps(chosen)} doneSteps={doneSteps} vaultAddress={vaultAddress} />
    );
  }

  return (
    <div className="mx-auto max-w-[var(--layout-max-width)]">
      <header className="flex flex-wrap items-start justify-between gap-[var(--spacing-16)]">
        <div>
          <SectionEyebrow>New agent</SectionEyebrow>
          <h1 className="mt-[var(--spacing-12)] text-app-heading font-denim-ink font-semibold text-white">
            Commission an agent
          </h1>
          <p className="mt-[var(--spacing-8)] max-w-xl text-app-body text-white-muted">
            Set the limits it trades under. They are written into the vault contract, which rejects
            any trade outside them — including trades you later ask for.
          </p>
        </div>
        <NetworkBadge network={network.key} />
      </header>

      {errorMsg && (
        <div className="mt-[var(--spacing-24)] rounded-[var(--radius-body-blocks)] border border-signal-red bg-signal-red/10 p-[var(--spacing-16)]">
          <p className="text-app-body-sm font-semibold text-signal-red">
            {failedAt === 0 ? "Nothing was deployed" : `Stopped after step ${failedAt} of 4`}
          </p>
          <p className="mt-[var(--spacing-4)] text-app-body-sm text-white-muted">{errorMsg}</p>
          {vaultAddress && (
            <p className="mt-[var(--spacing-8)] flex flex-wrap items-center gap-[var(--spacing-8)] text-app-body-sm text-white-muted">
              Your vault already exists — deploying again continues from where it stopped:
              <AddressChip address={vaultAddress} explorerBaseUrl={network.explorerUrl} />
            </p>
          )}
        </div>
      )}

      <div className="mt-[var(--spacing-32)] grid items-start gap-[var(--spacing-24)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-[var(--spacing-16)]">
          {/* Name and preset together: both are "before you tune anything"
              decisions, and a whole card for a single text input was the
              heaviest container in the column holding the lightest content.
              The presets sat in the Trading-limits header before, which was a
              quiet lie — they write worker limits too, in a card further down
              that the user was not looking at. Above both groups, that is
              visible rather than hidden. */}
          <Fieldset title="Identity">
            <Field
              label="Agent name"
              mono={false}
              value={form.agentName}
              onChange={set("agentName")}
              placeholder="Aurora"
              hint="Shown wherever this agent appears in your dashboard."
            />

            <div className="mt-[var(--spacing-24)] border-t border-moss-border pt-[var(--spacing-16)]">
              <div className="flex flex-wrap items-center justify-between gap-[var(--spacing-12)]">
                <div>
                  <p className="text-app-body-sm text-white">Start from a preset</p>
                  <p className="mt-[var(--spacing-4)] text-app-body-sm text-white-muted">
                    Fills every limit below — both groups. Adjust anything afterwards.
                  </p>
                </div>
                <div className="flex flex-wrap gap-[var(--spacing-8)]">
                  {PRESET_NAMES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyPreset(name)}
                      className="rounded-[var(--radius-pills)] border border-moss-border px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm text-white-muted font-jetbrains-mono transition-colors hover:border-lime-phosphor hover:text-lime-phosphor"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Fieldset>

          <Fieldset
            title="Trading limits"
            note="Enforced by the vault contract"
            enforced
            body="Written on-chain by setPolicy. The vault reverts any trade that breaks one of these, including a trade you later ask for yourself."
          >
            <div className="grid gap-[var(--spacing-16)] sm:grid-cols-2">
              <Field
                label="Most it can spend on one trade"
                prefix="$"
                inputMode="decimal"
                value={form.maxNotionalPerTradeUsd}
                onChange={set("maxNotionalPerTradeUsd")}
                error={errors.maxNotionalPerTradeUsd}
              />
              <Field
                label="Most it can spend in a day"
                prefix="$"
                inputMode="decimal"
                value={form.maxDailyNotionalUsd}
                onChange={set("maxDailyNotionalUsd")}
                error={errors.maxDailyNotionalUsd}
              />
              <Field
                label="Most one ticker may hold"
                unit="%"
                inputMode="decimal"
                value={form.maxPositionPct}
                onChange={set("maxPositionPct")}
                error={errors.maxPositionPct}
                hint={`${pctToBps(form.maxPositionPct) || 0} bps on-chain`}
              />
              <Field
                label="Wait between trades"
                unit="s"
                inputMode="numeric"
                value={form.minSecondsBetweenTrades}
                onChange={set("minSecondsBetweenTrades")}
                error={errors.minSecondsBetweenTrades}
              />
              <Field
                label="Worst fill vs. the oracle price"
                unit="%"
                inputMode="decimal"
                value={form.maxSlippagePct}
                onChange={set("maxSlippagePct")}
                error={errors.maxSlippagePct}
                hint={`${pctToBps(form.maxSlippagePct) || 0} bps on-chain`}
                className="sm:col-span-2"
              />
            </div>
          </Fieldset>

          <Fieldset
            title="Worker limits"
            note="Not enforced by the contract"
            body="Stored off-chain and honoured by the worker process. Useful, but the vault will not stop a trade that ignores them — only the group above is a guarantee."
          >
            <div className="grid gap-[var(--spacing-16)] sm:grid-cols-2">
              <Field
                label="Stop-loss"
                unit="%"
                inputMode="decimal"
                value={form.stopLossPct}
                onChange={set("stopLossPct")}
                error={errors.stopLossPct}
              />
              <Field
                label="Take-profit"
                unit="%"
                inputMode="decimal"
                value={form.takeProfitPct}
                onChange={set("takeProfitPct")}
                error={errors.takeProfitPct}
              />
              <Field
                label="Review at least every"
                unit="h"
                inputMode="numeric"
                value={form.maxReviewIntervalHours}
                onChange={set("maxReviewIntervalHours")}
                error={errors.maxReviewIntervalHours}
              />
              <Field
                label="Price move that wakes it"
                unit="%"
                inputMode="decimal"
                value={form.priceMoveTriggerPct}
                onChange={set("priceMoveTriggerPct")}
                error={errors.priceMoveTriggerPct}
              />
              <Field
                label="Most model calls an hour"
                inputMode="numeric"
                value={form.maxCallsPerHour}
                onChange={set("maxCallsPerHour")}
                error={errors.maxCallsPerHour}
                className="sm:col-span-2"
              />
            </div>
          </Fieldset>

          {/* Pulled out of Trading limits, where it sat under a divider. It is
              not a limit, and it is the one field that blocks Deploy — burying
              the only required input inside a section about something else
              was the surest way to strand someone on a disabled button. */}
          <Fieldset
            title="Price feed"
            note="Required"
            body="The vault values its own book through this Chainlink feed. There is no default address for this network yet."
          >
            <Field
              label="Chainlink feed for the quote token"
              value={form.quoteFeedAddress}
              onChange={set("quoteFeedAddress")}
              placeholder="0x…"
              error={errors.quoteFeedAddress}
            />
            {/* Sized to the feed, not to instinct. The quote token is a dollar
                peg: it rarely deviates enough to publish early, so its answer
                is genuinely near a day old and a "safe-looking" short window
                would revert every trade rather than protect anything. */}
            <Field
              label="Treat the price as stale after (hours)"
              value={form.quoteFeedStalenessHours}
              onChange={set("quoteFeedStalenessHours")}
              placeholder={DEFAULT_FEED_STALENESS_HOURS}
              hint="Set from the feed's own heartbeat plus a margin. Chainlink publishes this feed on a 24-hour heartbeat, so 26 leaves headroom. Too low and the vault refuses to trade between updates."
              error={errors.quoteFeedStalenessHours}
            />
          </Fieldset>

          {/* B2. Before this, the vault allowlisted the quote token and nothing
              else, so an agent created here rejected every equity the model
              proposed — "token not in vault allowlist" — and could never trade
              anything at all. */}
          <Fieldset
            title="What it may trade"
            note={`${chosen.length} selected`}
            body="Each one is written into the vault's allowlist and wired to its own Chainlink feed. Both are on-chain limits: the agent cannot touch a token that is not here, whatever it decides."
          >
            <div className="flex flex-col gap-[var(--spacing-8)]">
              {ASSETS.equities.map((asset) => {
                const on = tickers.includes(asset.ticker);
                return (
                  <label
                    key={asset.ticker}
                    className="flex cursor-pointer items-center gap-[var(--spacing-12)] rounded-[var(--radius-tags)] px-[var(--spacing-8)] py-[var(--spacing-8)] transition-colors hover:bg-row-hover"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleTicker(asset.ticker)}
                      className="size-4 shrink-0 accent-lime-phosphor"
                    />
                    <span className="text-app-body font-semibold text-white">{asset.ticker}</span>
                    {/* The verified on-chain name, not a label we chose.
                        Symbol lookup is not identity on this chain — loxAAPL,
                        AAPLCAT and two different loxTSLA all exist — so showing
                        what the contract actually calls itself is the check a
                        user can make with their own eyes. */}
                    <span className="text-app-body-sm text-white-muted">{asset.tokenName}</span>
                  </label>
                );
              })}
            </div>
            {chosen.length === 0 && (
              <p className="mt-[var(--spacing-12)] text-app-body-sm text-signal-amber">
                With nothing selected the agent can hold only {ASSETS.quote.ticker} and will decline
                every trade it proposes.
              </p>
            )}
            <p className="mt-[var(--spacing-12)] text-app-body-sm text-white-muted">
              Each one adds a wallet signature — {deploySteps(chosen).length} in total.
            </p>
          </Fieldset>
        </div>

        <Mandate
          form={form}
          onDeploy={handleDeploy}
          canDeploy={canDeploy}
          resuming={vaultAddress !== null}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The signature element. Every other review step in this genre is a
 * key-value recap of the form you just filled, which tells you nothing you
 * did not just type. This reads the limits back as the sentence the contract
 * will actually enforce — and because the prose is generated from the same
 * values that get encoded into setPolicy, the words cannot drift from the
 * rules the way a hand-written "strategy description" field would.
 */
function Mandate({
  form,
  onDeploy,
  canDeploy,
  resuming,
}: {
  form: FormState;
  onDeploy: () => void;
  canDeploy: boolean;
  resuming: boolean;
}) {
  const name = form.agentName.trim();
  const expiry = new Date(Date.now() + AGENT_KEY_DAYS * 24 * 60 * 60 * 1000);

  return (
    <Card elevated className="lg:sticky lg:top-[var(--spacing-24)]">
      <div className="text-num-xs uppercase text-lime-phosphor font-jetbrains-mono">
        The mandate
      </div>

      <p className="mt-[var(--spacing-16)] text-app-body text-white-muted">
        <V value={name} placeholder="This agent" prose /> may spend up to{" "}
        <V value={usd(form.maxNotionalPerTradeUsd)} /> on one trade and{" "}
        <V value={usd(form.maxDailyNotionalUsd)} /> across a day. No single ticker may grow past{" "}
        <V value={pct(form.maxPositionPct)} /> of the vault. It waits{" "}
        <V value={secs(form.minSecondsBetweenTrades)} /> between trades, and any fill landing more
        than <V value={pct(form.maxSlippagePct)} /> off the oracle price is reverted.
      </p>

      <div className="mt-[var(--spacing-16)] border-t border-moss-border pt-[var(--spacing-16)]">
        <p className="text-app-body-sm text-white">It can never withdraw.</p>
        <p className="mt-[var(--spacing-4)] text-app-body-sm text-white-muted">
          Withdrawal takes the deploying wallet&apos;s signature. The agent key has no such power —
          it stops signing on{" "}
          <span className="text-num-sm text-white font-jetbrains-mono">
            {expiry.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>{" "}
          unless you re-arm it.
        </p>
      </div>

      <div className="mt-[var(--spacing-24)]">
        <Button variant="primary" disabled={!canDeploy} onClick={onDeploy} className="w-full">
          {resuming ? "Resume deployment" : "Deploy vault & arm agent"}
        </Button>
        <p className="mt-[var(--spacing-8)] text-center text-num-xs text-white-faint font-jetbrains-mono">
          {resuming ? "Continues from the last confirmed step" : "4 wallet signatures"}
        </p>
      </div>
    </Card>
  );
}

/** A live value inside the mandate — mono and white, or a dash until set. */
function V({
  value,
  placeholder = "—",
  prose = false,
}: {
  value: string | null;
  placeholder?: string;
  prose?: boolean;
}) {
  if (!value) {
    return <span className="text-white-faint">{placeholder}</span>;
  }
  return (
    <span
      className={
        prose
          ? "font-denim-ink font-semibold text-white"
          : "font-jetbrains-mono tabular-nums text-white"
      }
    >
      {value}
    </span>
  );
}

const usd = (v: string): string | null =>
  v && Number.isFinite(Number(v)) ? `$${Number(v).toLocaleString("en-US")}` : null;
const pct = (v: string): string | null =>
  v && Number.isFinite(Number(v)) ? `${Number(v)}%` : null;
const secs = (v: string): string | null =>
  v && Number.isFinite(Number(v)) ? `${Number(v)}s` : null;

/* ------------------------------------------------------------------ */

function Fieldset({
  title,
  note,
  body,
  enforced = false,
  action,
  children,
}: {
  title: string;
  note?: string;
  /** One line on what the group actually means. The enforced/not distinction
      is the most consequential thing on this page and a four-word uppercase
      tag was carrying all of it alone. */
  body?: string;
  enforced?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-[var(--spacing-12)]">
        <div className="max-w-prose">
          <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">{title}</h2>
          {/* DESIGN.md #19: every limit is marked on-chain-enforced or not.
              Carried by color as well as words — lime for what the contract
              guarantees, faint for what only the worker honours. */}
          {note && (
            <p
              className={`mt-[var(--spacing-4)] text-num-xs uppercase font-jetbrains-mono ${
                enforced ? "text-lime-phosphor" : "text-white-faint"
              }`}
            >
              {note}
            </p>
          )}
          {body && (
            <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">{body}</p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-[var(--spacing-24)]">{children}</div>
    </Card>
  );
}

function Gate({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[var(--spacing-16)] py-[var(--spacing-80)] text-center">
      <h1 className="text-app-heading font-denim-ink font-semibold text-white">{title}</h1>
      <p className="max-w-md text-app-body text-white-muted">{body}</p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Four signatures fire in sequence, so a single spinner leaves the user
 * unable to tell which prompt their wallet is showing — or, on a rejection,
 * how much of the vault already exists. The ledger names every step and keeps
 * the completed ones on screen.
 */
function DeployLedger({
  steps,
  doneSteps,
  vaultAddress,
}: {
  steps: { title: string; call: string }[];
  doneSteps: number;
  vaultAddress: Address | null;
}) {
  return (
    <div className="mx-auto max-w-lg py-[var(--spacing-48)]">
      <SectionEyebrow>Deploying</SectionEyebrow>
      <h1 className="mt-[var(--spacing-12)] text-app-heading font-denim-ink font-semibold text-white">
        Sign each step
      </h1>
      <p className="mt-[var(--spacing-8)] text-app-body text-white-muted">
        Your wallet prompts once per step. Nothing is lost if you stop partway — the steps already
        confirmed stay confirmed.
      </p>

      <Card className="mt-[var(--spacing-24)]">
        <ol className="flex flex-col gap-[var(--spacing-16)]">
          {steps.map((s, i) => {
            const state = i < doneSteps ? "done" : i === doneSteps ? "active" : "pending";
            return (
              <li key={s.call} className="flex items-start gap-[var(--spacing-12)]">
                <span
                  aria-hidden
                  className={`mt-[2px] grid size-5 shrink-0 place-items-center rounded-[var(--radius-pills)] text-num-xs font-jetbrains-mono ${
                    state === "done"
                      ? "bg-lime-phosphor text-vault-floor"
                      : state === "active"
                        ? "border border-lime-phosphor text-lime-phosphor motion-safe:animate-pulse"
                        : "border border-moss-border text-white-faint"
                  }`}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <span className="flex flex-col">
                  <span
                    className={`text-app-body-sm ${
                      state === "pending" ? "text-white-faint" : "text-white"
                    }`}
                  >
                    {s.title}
                  </span>
                  <span className="text-num-xs text-white-faint font-jetbrains-mono">{s.call}</span>
                </span>
                <span className="ml-auto text-num-xs text-white-faint font-jetbrains-mono">
                  {state === "done" ? "confirmed" : state === "active" ? "waiting…" : ""}
                </span>
              </li>
            );
          })}
        </ol>

        {vaultAddress && (
          <div className="mt-[var(--spacing-24)] flex items-center justify-between border-t border-moss-border pt-[var(--spacing-16)]">
            <span className="text-app-body-sm text-white-muted">Your vault</span>
            <AddressChip address={vaultAddress} explorerBaseUrl={network.explorerUrl} />
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The private key is generated in the browser and never sent anywhere, which
 * means this screen is the only time it will ever exist for the user. It is
 * gated behind an explicit acknowledgement rather than a plain "continue" —
 * navigating away without copying it strands the vault's agent slot.
 */
function KeyHandover({
  vaultAddress,
  agentAddress,
  agentPrivateKey,
  onDone,
}: {
  vaultAddress: Address;
  agentAddress: Address;
  agentPrivateKey: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="mx-auto max-w-2xl py-[var(--spacing-48)]">
      <SectionEyebrow>Agent armed</SectionEyebrow>
      <h1 className="mt-[var(--spacing-12)] text-app-heading font-denim-ink font-semibold text-white">
        Your vault is live
      </h1>
      <p className="mt-[var(--spacing-8)] text-app-body text-white-muted">
        The limits are on-chain and the agent key is armed. It trades in dry-run until you turn that
        off.
      </p>

      <Card className="mt-[var(--spacing-24)] flex flex-col gap-[var(--spacing-12)]">
        <div className="flex items-center justify-between">
          <span className="text-app-body-sm text-white-muted">Vault</span>
          <AddressChip address={vaultAddress} explorerBaseUrl={network.explorerUrl} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-app-body-sm text-white-muted">Agent address</span>
          <AddressChip address={agentAddress} explorerBaseUrl={network.explorerUrl} />
        </div>
      </Card>

      <div className="mt-[var(--spacing-16)] rounded-[var(--radius-body-blocks)] border border-signal-amber bg-signal-amber/10 p-[var(--spacing-16)]">
        <div className="flex flex-wrap items-center justify-between gap-[var(--spacing-8)]">
          <p className="text-app-body-sm font-semibold text-signal-amber">
            Copy the agent key now — it is not stored and cannot be shown again
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(agentPrivateKey);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="rounded-[var(--radius-pills)] border border-signal-amber px-[var(--spacing-12)] py-[var(--spacing-4)] text-num-sm text-signal-amber font-jetbrains-mono transition-colors hover:bg-signal-amber hover:text-vault-floor"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <code className="mt-[var(--spacing-12)] block break-all rounded-[var(--radius-tags)] bg-vault-floor p-[var(--spacing-12)] text-num-sm text-white font-jetbrains-mono">
          {agentPrivateKey}
        </code>
      </div>

      <Card className="mt-[var(--spacing-16)]">
        <h2 className="text-app-heading-sm font-denim-ink font-semibold text-white">
          Start the worker
        </h2>
        <p className="mt-[var(--spacing-8)] text-app-body-sm text-white-muted">
          Put both values in the worker&apos;s <code>.env</code>, then run it. See{" "}
          <code>apps/agent/README.md</code>.
        </p>
        <pre className="mt-[var(--spacing-12)] overflow-x-auto rounded-[var(--radius-tags)] bg-forest-canopy p-[var(--spacing-12)] text-num-sm text-white-muted font-jetbrains-mono">
          {`AGENT_PRIVATE_KEY=<the key above>
VAULT_ADDRESS=${vaultAddress}

pnpm --filter @puno/agent dev`}
        </pre>
      </Card>

      <label className="mt-[var(--spacing-24)] flex items-center gap-[var(--spacing-12)]">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-lime-phosphor"
        />
        <span className="text-app-body-sm text-white-muted">
          I have saved the agent key somewhere safe
        </span>
      </label>

      <div className="mt-[var(--spacing-16)]">
        <Button variant="primary" disabled={!saved} onClick={onDone}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
