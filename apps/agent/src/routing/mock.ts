import { encodeFunctionData } from "viem";
import { mockRouterAbi } from "@puno/shared";
import type { RouterAdapter, SwapPlan, SwapRequest } from "./types.js";

/// The testnet stand-in, unchanged in behaviour — this is the encoding that
/// used to sit inline in `simulate.ts`, moved behind the adapter interface and
/// nothing else. `routing/mock.test.ts` asserts the bytes are identical to
/// what that inline call produced, because the point of this first step is a
/// seam, not a change.
///
/// `MockRouter.swap` takes the output amount as an argument, so it always fills
/// at exactly the price the caller modelled (contracts/mocks/MockRouter.sol).
/// That is fine for a test double and is precisely what makes it useless as
/// evidence: `risk.ts`'s sizing has never met a venue that can fill worse than
/// asked. Nothing here should be read as proof that mainnet routing works.
export class MockRouterAdapter implements RouterAdapter {
  readonly name = "mock";

  // Async with nothing to await, deliberately: the interface is async because a
  // real venue has to quote over RPC, and the mock should satisfy that contract
  // rather than the interface being shaped around the test double.
  async plan(req: SwapRequest): Promise<SwapPlan> {
    const calldata = encodeFunctionData({
      abi: mockRouterAbi,
      functionName: "swap",
      args: [req.tokenIn, req.tokenOut, req.amountIn, req.fairAmountOut, req.vault],
    });

    return {
      amountOut: req.fairAmountOut,
      calldata,
      route: "MockRouter.swap (fills at the oracle price by construction)",
    };
  }
}
