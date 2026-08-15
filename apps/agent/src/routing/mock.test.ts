import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, type Address } from "viem";
import { getNetwork, mockRouterAbi } from "@puno/shared";
import { getRouterAdapter, MockRouterAdapter } from "./index.js";

const VAULT = "0xcFA434255f47F4C8777043540d253CEDFb36B5e9" as Address;
const ROUTER = "0x58fc3D03E57aC4b909b04356CF9Ae8b420885719" as Address;
const USDG = "0x5fecF7bA6365E6763b8984c43307B417A498aD40" as Address;
const AAPL = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9" as Address;

const REQ = {
  vault: VAULT,
  tokenIn: USDG,
  tokenOut: AAPL,
  amountIn: 180_000000000000000000n,
  router: ROUTER,
  fairAmountOut: 857142857142857142n,
};

describe("MockRouterAdapter", () => {
  test("produces byte-identical calldata to the encoding it replaced", async () => {
    // This is the whole guarantee of the first B1 step: a seam, not a change.
    // Reproduced here independently rather than imported, so that editing the
    // adapter cannot quietly edit the thing it is being checked against.
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
    // as an argument, so the mock cannot fill worse than modelled. Pinned here
    // so that when the Uniswap adapter lands and its amountOut *does* diverge
    // from fairAmountOut, the difference is visible as a deliberate change.
    assert.equal(plan.amountOut, REQ.fairAmountOut);
  });

  test("names the venue in the route so a surprising fill is diagnosable", async () => {
    const plan = await new MockRouterAdapter().plan(REQ);

    assert.match(plan.route, /MockRouter/);
  });

  test("pays the vault, never the agent", async () => {
    // The recipient argument is what makes the vault's balance-delta accounting
    // work. Encoded with a different recipient the swap would succeed and the
    // vault would still revert on a zero delta, which is a far more confusing
    // failure than this assertion.
    const plan = await new MockRouterAdapter().plan(REQ);

    assert.ok(plan.calldata.toLowerCase().includes(VAULT.slice(2).toLowerCase()));
  });
});

describe("getRouterAdapter", () => {
  test("gives testnet the mock", () => {
    assert.equal(getRouterAdapter(getNetwork("testnet")).name, "mock");
  });

  test("refuses mainnet loudly rather than emitting mock calldata for a real router", () => {
    // The failure this encodes: before the adapter existed, a mainnet agent
    // built MockRouter.swap bytes and handed them to 1inch, which has no such
    // function. It failed safe but said nothing useful. Refusing here is the
    // same safety with a diagnosis attached.
    assert.throws(() => getRouterAdapter(getNetwork("mainnet")), /B1|Uniswap/);
  });

  test("routes by isTestnet, so a new testnet inherits the mock", () => {
    const invented = { ...getNetwork("testnet"), chainId: 99999, name: "Some Future Testnet" };

    assert.equal(getRouterAdapter(invented).name, "mock");
  });
});
