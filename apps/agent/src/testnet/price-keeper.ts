import { parseAbi, type Address } from "viem";
import { agentVaultAbi } from "@puno/shared";
import { publicClient, getWalletClient } from "../chain/client.js";
import { config } from "../config.js";

/// Keeps the testnet mock oracles alive.
///
/// MockAggregatorV3 stamps `block.timestamp` when its answer is *set*, not when
/// it is read (contracts/mocks/MockAggregatorV3.sol). So a testnet feed goes
/// stale one hour after anyone last touched it, against EQUITY_STALENESS. The
/// visible consequence was that the demo agent refused to trade and explained,
/// entirely correctly, that it would not act on an untrusted mark — which is
/// exactly the wrong first thing for a new user to see. Refusing looks like a
/// broken product, or a dishonest one.
///
/// The fix belongs here rather than in the agent's judgement. `AgentVault._nav()`
/// reverts outright on a stale feed, so an agent talked into trading anyway
/// would only have got as far as a failed simulation. A fresh mark is the only
/// thing that makes the demo work, and weakening the staleness check would break
/// the one invariant that measurably mattered in production (see CLAUDE.md on
/// per-feed staleness).
///
/// This deliberately broadcasts transactions while DRY_RUN is true. DRY_RUN's
/// promise is that no *trade* is ever sent, and this touches no vault, no
/// router and no funds — it writes to a mock oracle that exists only on the
/// testnet. It cannot reach mainnet twice over: `isTestnet` is false there and
/// `demoVault` is null. Set TESTNET_PRICE_KEEPER=false to switch it off.

const mockAggregatorAbi = parseAbi([
  "function setAnswer(int256 newAnswer) external",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
]);

interface Feed {
  token: Address;
  aggregator: Address;
  maxStaleness: number;
  isQuote: boolean;
  /// Price the process first observed, in feed units. The walk is pulled back
  /// toward it so a long-running worker cannot drift a mock equity to zero — or
  /// to a number so silly it makes the demo look broken in the other direction.
  anchor: bigint;
}

/// Per-pass movement, in basis points of the current price. Large enough that
/// the default 300bp price-move trigger fires within a few passes, so the demo
/// market looks alive rather than frozen; small enough to look like a price
/// rather than a glitch.
const MAX_STEP_BPS = 120;
/// How hard the walk is pulled back toward `anchor`, in basis points of the gap.
const REVERSION_BPS = 2_000;
/// Bounds the walk regardless of reversion.
const MIN_ANCHOR_BPS = 7_000;
const MAX_ANCHOR_BPS = 13_000;
/// Refresh once the answer is this far through its own staleness window. Well
/// before the edge, so a trial run arriving at an awkward moment still finds a
/// fresh mark.
const REFRESH_AT_FRACTION = 0.5;

let cachedFeeds: Feed[] | null = null;

function randomStepBps(): bigint {
  // Symmetric around zero, so the walk has no built-in trend of its own.
  return BigInt(Math.round((Math.random() * 2 - 1) * MAX_STEP_BPS));
}

function nextPrice(current: bigint, anchor: bigint): bigint {
  const drifted = current + (current * randomStepBps()) / 10_000n;
  const pulled = drifted + ((anchor - drifted) * BigInt(REVERSION_BPS)) / 10_000n;
  const floor = (anchor * BigInt(MIN_ANCHOR_BPS)) / 10_000n;
  const ceiling = (anchor * BigInt(MAX_ANCHOR_BPS)) / 10_000n;
  if (pulled < floor) return floor;
  if (pulled > ceiling) return ceiling;
  return pulled;
}

/// Reads the demo vault's allowlist and the feed behind each token, once per
/// process. The vault is the source of truth here rather than a config list:
/// a feed the vault does not actually consult is not worth spending gas on, and
/// one it does consult must not be missed.
async function loadFeeds(vault: Address, quoteToken: Address): Promise<Feed[]> {
  const feeds: Feed[] = [];

  for (let i = 0; ; i++) {
    let token: Address;
    try {
      token = (await publicClient.readContract({
        address: vault,
        abi: agentVaultAbi,
        functionName: "allowedTokens",
        args: [BigInt(i)],
      })) as Address;
    } catch {
      break; // past the end of the array
    }

    const [aggregator, , maxStaleness] = (await publicClient.readContract({
      address: vault,
      abi: agentVaultAbi,
      functionName: "priceFeeds",
      args: [token],
    })) as [Address, number, number];

    if (BigInt(aggregator) === 0n) continue;

    const [, answer] = await publicClient.readContract({
      address: aggregator,
      abi: mockAggregatorAbi,
      functionName: "latestRoundData",
    });

    feeds.push({
      token,
      aggregator,
      maxStaleness,
      isQuote: token.toLowerCase() === quoteToken.toLowerCase(),
      anchor: answer,
    });
  }

  return feeds;
}

export interface KeeperResult {
  refreshed: number;
  skipped: number;
}

/// One keeper pass. `force` refreshes every feed regardless of age — used
/// immediately before a free-tier run, so a demo never depends on where the
/// timer happened to be.
export async function refreshDemoFeeds(force = false): Promise<KeeperResult> {
  const demo = config.network.demoVault;
  if (!config.network.isTestnet || !demo || !config.testnetPriceKeeper) {
    return { refreshed: 0, skipped: 0 };
  }

  const wallet = getWalletClient();
  const vault = demo.address as Address;

  cachedFeeds ??= await loadFeeds(vault, config.network.tokens.usdg as Address);

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  let refreshed = 0;
  let skipped = 0;

  for (const feed of cachedFeeds) {
    const [, answer, , updatedAt] = await publicClient.readContract({
      address: feed.aggregator,
      abi: mockAggregatorAbi,
      functionName: "latestRoundData",
    });

    const age = nowSec - updatedAt;
    if (!force && age < BigInt(Math.floor(feed.maxStaleness * REFRESH_AT_FRACTION))) {
      skipped++;
      continue;
    }

    // The quote token keeps its price and only has its timestamp renewed. It is
    // the unit every other price is quoted in and the denominator of NAV —
    // wobbling it would make the whole portfolio appear to move for no reason.
    const newAnswer = feed.isQuote ? answer : nextPrice(answer, feed.anchor);

    const hash = await wallet.writeContract({
      address: feed.aggregator,
      abi: mockAggregatorAbi,
      functionName: "setAnswer",
      args: [newAnswer],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    refreshed++;
  }

  return { refreshed, skipped };
}
