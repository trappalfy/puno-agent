import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, encodeFunctionData, type Address, type PublicClient } from "viem";
import { getNetwork, mockRouterAbi, uniswapV3SwapRouter02Abi } from "@puno/shared";
import { getRouterAdapter, MockRouterAdapter, UniswapV3Adapter } from "./index.js";

const VAULT = "0xcFA434255f47F4C8777043540d253CEDFb36B5e9" as Address;
const MOCK_ROUTER = "0x58fc3D03E57aC4b909b04356CF9Ae8b420885719" as Address;
const USDG = "0x5fecF7bA6365E6763b8984c43307B417A498aD40" as Address;
const AAPL = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9" as Address;

const REQ = {
  vault: VAULT,
  tokenIn: USDG,
  tokenOut: AAPL,
  amountIn: 180_000000000000000000n,
  router: MOCK_ROUTER,
  fairAmountOut: 857142857142857142n,
  minOut: 848571428571428571n,
};

describe("MockRouterAdapter", () => {
  test("produces byte-identical calldata to the encoding it replaced", async () => {
    // The whole guarantee of B1's first step: a seam, not a change. Reproduced
    // here independently rather than imported, so that editing the adapter
    // cannot quietly edit the thing it is being checked against.
    const before = encodeFunctionData({
      abi: mockRouterAbi,
      functionName: "swap",
      args: [REQ.tokenIn, REQ.tokenOut, REQ.amountIn, REQ.fairAmountOut, REQ.vault],
    });

    const plan = await new MockRouterAdapter().plan(REQ);

    assert.equal(plan.calldata, before);
  });

  test("fills at exactly the oracle amount it was handed", async () => {
    const plan = await new MockRouterAdapter().plan(REQ);

    // Not an accident to be tidied up later — MockRouter.swap takes the output
    // as an argument, so the mock cannot fill worse than modelled. Pinned so
    // that a real adapter's diverging amountOut reads as the deliberate change
    // it is.
    assert.equal(plan.amountOut, REQ.fairAmountOut);
  });

  test("names the venue in the route so a surprising fill is diagnosable", async () => {
    const plan = await new MockRouterAdapter().plan(REQ);

    assert.match(plan.route, /MockRouter/);
  });

  test("pays the vault, never the agent", async () => {
    const plan = await new MockRouterAdapter().plan(REQ);

    assert.ok(plan.calldata.toLowerCase().includes(VAULT.slice(2).toLowerCase()));
  });
});

const MAINNET = getNetwork("mainnet");
const UNI = MAINNET.uniswapV3!;

/// A PublicClient stub that answers `quoteExactInputSingle` from a fee -> output
/// table. A fee absent from the table throws, which is exactly how a real
/// QuoterV2 reports "no pool at this tier".
function clientQuoting(byFee: Record<number, bigint>): PublicClient {
  return {
    simulateContract: (args: { args: readonly [{ fee: number }] }) => {
      const fee = args.args[0].fee;
      const out = byFee[fee];
      if (out === undefined) throw new Error("execution reverted");
      return Promise.resolve({ result: [out, 0n, 1, 0n] as const });
    },
  } as unknown as PublicClient;
}

const UNI_REQ = { ...REQ, router: UNI.swapRouter02 };

function decodeParams(calldata: `0x${string}`) {
  const { args } = decodeFunctionData({ abi: uniswapV3SwapRouter02Abi, data: calldata });
  return args[0];
}

describe("UniswapV3Adapter", () => {
  test("takes the best-quoting tier, not the deepest or the first", async () => {
    // Measured on 4663: AAPL's thinner 500 pool quoted 0.18% better than its
    // deeper 3000 pool at 1,000 USDG. A "pick the deepest tier" heuristic, or a
    // hardcoded 3000, would have taken the worse fill on real money.
    const adapter = new UniswapV3Adapter(clientQuoting({ 500: 999n, 3000: 1000n }), UNI);

    const plan = await adapter.plan(UNI_REQ);

    assert.equal(plan.amountOut, 1000n);
    assert.equal(decodeParams(plan.calldata).fee, 3000);
  });

  test("skips tiers with no pool instead of failing the trade", async () => {
    // Most pairs have pools at one or two tiers out of four; a revert on the
    // other tiers is the normal case, not an error.
    const adapter = new UniswapV3Adapter(clientQuoting({ 10000: 42n }), UNI);

    const plan = await adapter.plan(UNI_REQ);

    assert.equal(decodeParams(plan.calldata).fee, 10000);
  });

  test("ignores a pool that quotes zero", async () => {
    // A pool can exist and hold nothing on the output side. Encoding a swap
    // against it reverts at the router for a reason nobody would connect back
    // to liquidity.
    const adapter = new UniswapV3Adapter(clientQuoting({ 100: 0n, 3000: 7n }), UNI);

    const plan = await adapter.plan(UNI_REQ);

    assert.equal(plan.amountOut, 7n);
  });

  test("says single-hop when no tier quotes at all", async () => {
    const adapter = new UniswapV3Adapter(clientQuoting({}), UNI);

    await assert.rejects(() => adapter.plan(UNI_REQ), /no direct pool|single-hop/);
  });

  test("refuses to encode for a router the vault allowlisted but it does not serve", async () => {
    // An adapter that quoted one venue and encoded for another would be routing
    // around the vault's allowlist.
    const adapter = new UniswapV3Adapter(clientQuoting({ 3000: 1n }), UNI);

    await assert.rejects(
      () => adapter.plan({ ...UNI_REQ, router: MOCK_ROUTER }),
      /only builds calldata for SwapRouter02/,
    );
  });

  test("puts the oracle floor in the calldata, not a number derived from its own quote", async () => {
    // The check has to come from outside the venue that fills the trade.
    // AgentVault requires minOut >= _minAcceptableOut against its own Chainlink
    // feeds, so a quote-derived minimum would also be rejected on-chain.
    const adapter = new UniswapV3Adapter(clientQuoting({ 3000: 999_999_999n }), UNI);

    const plan = await adapter.plan(UNI_REQ);

    assert.equal(decodeParams(plan.calldata).amountOutMinimum, UNI_REQ.minOut);
  });

  test("pays the vault and sets no price limit", async () => {
    const adapter = new UniswapV3Adapter(clientQuoting({ 500: 5n }), UNI);

    const params = decodeParams((await adapter.plan(UNI_REQ)).calldata);

    assert.equal(params.recipient, VAULT);
    assert.equal(params.sqrtPriceLimitX96, 0n);
  });
});

describe("getRouterAdapter", () => {
  const anyClient = clientQuoting({});

  test("gives testnet the mock", () => {
    assert.equal(getRouterAdapter(getNetwork("testnet"), anyClient).name, "mock");
  });

  test("gives mainnet Uniswap V3", () => {
    assert.equal(getRouterAdapter(MAINNET, anyClient).name, "uniswap-v3");
  });

  test("routes by isTestnet, so a new testnet inherits the mock", () => {
    const invented = { ...getNetwork("testnet"), chainId: 99999, name: "Some Future Testnet" };

    assert.equal(getRouterAdapter(invented, anyClient).name, "mock");
  });

  test("refuses a live network with no venue rather than falling back to the mock", () => {
    // The failure this encodes: before the adapter existed, a mainnet agent
    // built MockRouter.swap bytes and handed them to 1inch, which has no such
    // function. It failed safe but said nothing useful.
    const noVenue = { ...MAINNET, uniswapV3: null };

    assert.throws(() => getRouterAdapter(noVenue, anyClient), /no router adapter/);
  });
});
