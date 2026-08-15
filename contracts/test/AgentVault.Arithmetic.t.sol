// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { VaultTestBase } from "./helpers/VaultTestBase.sol";
import { AgentVaultHarness } from "./helpers/AgentVaultHarness.sol";
import { AgentVault } from "../src/AgentVault.sol";
import { MockStockToken } from "../mocks/MockStockToken.sol";
import { MockAggregatorV3 } from "../mocks/MockAggregatorV3.sol";

/// @notice Property tests for the vault's pricing and accounting arithmetic.
///
/// The example-based suites check that the right things revert. These check the
/// things that hold for *every* input, which is where decimal conversion and
/// fixed-point rounding hide: the vault converts between a 6-decimal quote, an
/// 18-decimal equity, an 8-decimal feed and a 1e18 USD scale on every trade, and
/// each of those boundaries is a place a value can silently round the wrong way.
///
/// The direction of rounding is the whole point. `_minAcceptableOut` is a *floor*
/// the trade must clear, so an error that rounds it down costs a fraction of a
/// basis point, and one that rounds it up rejects honest fills. Only one of
/// those is safe, and it is not obvious by reading which way the divisions fall.
contract AgentVaultArithmeticTest is VaultTestBase {
    /// The rolling-window tests write to state that only `executeTrade` reaches
    /// in production, so they go through a harness. Everything else uses the
    /// real vault from the shared fixture.
    AgentVaultHarness internal harness;

    function setUp() public override {
        super.setUp();

        harness = new AgentVaultHarness(ownerAddr, address(usdg));
        vm.startPrank(ownerAddr);
        harness.setPriceFeed(address(usdg), address(usdgFeed), USDG_STALENESS);
        harness.setPriceFeed(address(stock), address(stockFeed), STOCK_STALENESS);
        harness.setPolicy(_defaultPolicy());
        vm.stopPrank();
    }

    /// @dev Same shape as MockAggregatorV3 but with a configurable decimals()
    /// so the 18-decimal assumption baked into `_normalizedPrice` can be probed.
    function _feedWithDecimals(uint8 decimals_, int256 answer) internal returns (MockAggregatorV3) {
        return new MockAggregatorV3(decimals_, "PROBE / USD", answer);
    }

    function _openPolicyOn(AgentVaultHarness target) internal {
        AgentVault.Policy memory policy = _defaultPolicy();
        policy.maxNotionalPerTrade = type(uint256).max;
        policy.maxDailyNotional = type(uint256).max;
        vm.prank(ownerAddr);
        target.setPolicy(policy);
    }

    // ---------------------------------------------------------------------
    // _normalizedPrice — feed decimals
    // ---------------------------------------------------------------------

    /// Chainlink feeds on this chain report 8, and the code scales by
    /// `10 ** (18 - priceDecimals)`. Anything above 18 underflows that
    /// subtraction and panics, which would brick the token permanently — every
    /// price read, `nav()` included, reverting forever with an arithmetic panic
    /// rather than a message. `setPriceFeed` now refuses it at configuration
    /// time, which is the only moment anyone is in a position to fix it.
    function testFuzz_SetPriceFeed_RejectsFeedDecimalsAbove18(uint8 decimals_) public {
        decimals_ = uint8(bound(decimals_, 19, 255));
        MockAggregatorV3 odd = _feedWithDecimals(decimals_, 1e8);

        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: price decimals too high");
        vault.setPriceFeed(address(stock), address(odd), STOCK_STALENESS);
    }

    function testFuzz_NormalizedPrice_AnyFeedDecimalsUpTo18Scale(uint8 decimals_, uint64 answer)
        public
    {
        decimals_ = uint8(bound(decimals_, 0, 18));
        answer = uint64(bound(answer, 1, type(uint64).max));

        MockAggregatorV3 probe = _feedWithDecimals(decimals_, int256(uint256(answer)));
        vm.prank(ownerAddr);
        vault.setPriceFeed(address(stock), address(probe), STOCK_STALENESS);

        // One whole token priced through the feed must equal the feed's answer
        // rescaled to 1e18, whatever decimals it reports. `nav()` is the only
        // public surface that exposes the conversion, so value it directly.
        deal(address(stock), address(vault), 1e18);
        uint256 expected = uint256(answer) * (10 ** (18 - decimals_));

        // The vault also holds USDG from the fixture; net it out.
        uint256 usdgValue = (usdg.balanceOf(address(vault)) * 1e18) / 1e6;
        assertEq(vault.nav(), expected + usdgValue);
    }

    // ---------------------------------------------------------------------
    // _minAcceptableOut — the oracle floor
    // ---------------------------------------------------------------------

    /// The floor must never exceed the fair value the oracle implies, or honest
    /// fills get rejected. Every division in the path floors, so this should
    /// hold with no tolerance at all — asserted as `<=`, not `approxEq`, because
    /// a tolerance would hide a sign error in exactly the direction that matters.
    function testFuzz_MinAcceptableOut_NeverExceedsFairValue(uint256 amountIn, uint16 slippageBps)
        public
    {
        amountIn = bound(amountIn, 1e6, 5_000e6); // $1 .. the per-trade cap
        slippageBps = uint16(bound(slippageBps, 0, 10_000));

        AgentVault.Policy memory policy = _defaultPolicy();
        policy.maxSlippageBps = slippageBps;
        vm.prank(ownerAddr);
        vault.setPolicy(policy);

        uint256 floorOut = vault.minAcceptableOut(address(usdg), address(stock), amountIn);

        // Fair value computed independently of the contract: USDG at $1 (6 dec)
        // into TSLA at $250 (18 dec), both through 8-decimal feeds.
        uint256 valueUsd = (amountIn * (USDG_PRICE * 1e10)) / 1e6;
        uint256 fairOut = (valueUsd * 1e18) / (STOCK_PRICE * 1e10);

        assertLe(floorOut, fairOut, "floor must never exceed fair value");
    }

    /// At zero slippage the floor *is* fair value — no rounding may creep in and
    /// make a perfectly-priced fill unacceptable.
    function testFuzz_MinAcceptableOut_ZeroSlippageEqualsFairValue(uint256 amountIn) public {
        amountIn = bound(amountIn, 1e6, 5_000e6);

        AgentVault.Policy memory policy = _defaultPolicy();
        policy.maxSlippageBps = 0;
        vm.prank(ownerAddr);
        vault.setPolicy(policy);

        uint256 valueUsd = (amountIn * (USDG_PRICE * 1e10)) / 1e6;
        uint256 fairOut = (valueUsd * 1e18) / (STOCK_PRICE * 1e10);

        assertEq(vault.minAcceptableOut(address(usdg), address(stock), amountIn), fairOut);
    }

    /// More permitted slippage can only ever lower the bar. Sounds tautological;
    /// it is the property that breaks first if the bps arithmetic is ever
    /// rewritten as a multiplication by a precomputed factor.
    function testFuzz_MinAcceptableOut_MonotonicInSlippage(uint16 lowBps, uint16 highBps) public {
        lowBps = uint16(bound(lowBps, 0, 10_000));
        highBps = uint16(bound(highBps, lowBps, 10_000));
        uint256 amountIn = 1_000e6;

        AgentVault.Policy memory policy = _defaultPolicy();

        policy.maxSlippageBps = lowBps;
        vm.prank(ownerAddr);
        vault.setPolicy(policy);
        uint256 tighter = vault.minAcceptableOut(address(usdg), address(stock), amountIn);

        policy.maxSlippageBps = highBps;
        vm.prank(ownerAddr);
        vault.setPolicy(policy);
        uint256 looser = vault.minAcceptableOut(address(usdg), address(stock), amountIn);

        assertLe(looser, tighter, "a wider slippage allowance must not raise the floor");
    }

    /// A round trip through the USD scale can lose value to flooring but must
    /// never create it. Tokens differ by twelve decimal places here, so this is
    /// the conversion most able to drift.
    function testFuzz_ValueRoundTrip_NeverGainsValue(uint256 rawAmount) public view {
        rawAmount = bound(rawAmount, 1, 1e24);

        uint256 valueUsd = vault.valueOf(address(stock), rawAmount);
        uint256 backToRaw = vault.valueToRaw(address(stock), valueUsd);

        assertLe(backToRaw, rawAmount, "round trip must never mint value");
    }

    // ---------------------------------------------------------------------
    // Daily notional window
    // ---------------------------------------------------------------------

    /// `TradeRecord.notionalUsd` is a uint192, and the value written into it is
    /// bounded only by `maxNotionalPerTrade`, which the owner sets as a uint256.
    /// An unchecked downcast there would truncate a large notional to a small
    /// recorded one and let the rolling daily cap be walked straight past. The
    /// numbers involved are absurd — uint192 is about 6.3e39 USD at 1e18 scale —
    /// but "unreachable" and "unchecked" are different claims, and only one of
    /// them survives a fuzzer.
    function testFuzz_DailyNotional_RejectsAnUnrecordableTrade(uint256 notional) public {
        notional = bound(notional, uint256(type(uint192).max) + 1, type(uint256).max);
        _openPolicyOn(harness);

        vm.expectRevert("AgentVault: notional too large to record");
        harness.exposedCheckAndRecordDailyNotional(notional);
    }

    /// Everything a real policy can produce records exactly, with no truncation
    /// and no rounding — the sum the cap is checked against has to be the sum
    /// that was actually traded.
    function testFuzz_DailyNotional_RecordsExactlyWhatItWasGiven(uint256 notional) public {
        notional = bound(notional, 0, uint256(type(uint192).max));
        _openPolicyOn(harness);

        harness.exposedCheckAndRecordDailyNotional(notional);

        assertEq(harness.recentNotionalUsd(), notional);
    }

    /// Records outside the 24h window stop counting, and the boundary is the
    /// interesting part: a trade exactly `NOTIONAL_WINDOW` old is still inside
    /// it (`timestamp < windowStart` prunes, so equality survives).
    function testFuzz_DailyNotional_PrunesOnlyPastTheWindow(uint256 age) public {
        age = bound(age, 0, 3 days);
        _openPolicyOn(harness);

        harness.exposedCheckAndRecordDailyNotional(1_000e18);
        _advanceTime(age);
        harness.exposedCheckAndRecordDailyNotional(0);

        uint256 expected = age <= 1 days ? 1_000e18 : 0;
        assertEq(harness.recentNotionalUsd(), expected);
    }
}
