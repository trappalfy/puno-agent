// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { VaultTestBase } from "./helpers/VaultTestBase.sol";
import { AgentVault } from "../src/AgentVault.sol";
import { MockStockToken } from "../mocks/MockStockToken.sol";
import { MockRouter } from "../mocks/MockRouter.sol";

contract AgentVaultPolicyTest is VaultTestBase {
    // A fair-value trade at current mock prices: 1000 USDG (6 dec) -> 4 TSLA
    // (18 dec) at $250/share. minOutFloor at 1% max slippage is 3.96e18.
    uint256 internal constant FAIR_AMOUNT_IN = 1_000e6;
    uint256 internal constant FAIR_AMOUNT_OUT = 4e18;
    uint256 internal constant FAIR_MIN_OUT_FLOOR = 3.96e18;

    function _tradeCalldata(uint256 amountIn, uint256 amountOut)
        internal
        view
        returns (bytes memory)
    {
        return _swapCalldata(address(usdg), address(stock), amountIn, amountOut);
    }

    // -- allowlists --------------------------------------------------------

    function test_RevertWhen_RouterNotAllowed() public {
        address randomRouter = makeAddr("randomRouter");
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: router not allowed");
        vault.executeTrade(
            address(usdg), address(stock), FAIR_AMOUNT_IN, FAIR_MIN_OUT_FLOOR, randomRouter, ""
        );
    }

    function test_RevertWhen_TokenInNotAllowed() public {
        MockStockToken notAllowed = new MockStockToken("Not Allowed", "NOPE", 18);
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: tokenIn not allowed");
        vault.executeTrade(address(notAllowed), address(stock), 1e18, 0, address(router), "");
    }

    function test_RevertWhen_TokenOutNotAllowed() public {
        MockStockToken notAllowed = new MockStockToken("Not Allowed", "NOPE", 18);
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: tokenOut not allowed");
        vault.executeTrade(
            address(usdg), address(notAllowed), FAIR_AMOUNT_IN, 0, address(router), ""
        );
    }

    function test_RevertWhen_SetPolicyReferencesTokenWithoutPriceFeed() public {
        MockStockToken noFeed = new MockStockToken("No Feed", "NOFEED", 18);

        address[] memory routers = new address[](1);
        routers[0] = address(router);
        address[] memory tokens = new address[](1);
        tokens[0] = address(noFeed);

        AgentVault.Policy memory policy = AgentVault.Policy({
            allowedRouters: routers,
            allowedTokens: tokens,
            maxNotionalPerTrade: 1,
            maxDailyNotional: 1,
            maxPositionBps: 1,
            minSecondsBetweenTrades: 0,
            maxSlippageBps: 1
        });

        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: token has no price feed");
        vault.setPolicy(policy);
    }

    function test_RevertWhen_NonOwnerSetsPolicy() public {
        vm.prank(strangerAddr);
        vm.expectRevert("AgentVault: not owner");
        vault.setPolicy(_defaultPolicy());
    }

    // -- caps ----------------------------------------------------------

    function test_RevertWhen_ExceedsPerTradeCap() public {
        uint256 tooBig = 6_000e6; // $6,000 > $5,000 cap
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: exceeds per-trade cap");
        vault.executeTrade(
            address(usdg), address(stock), tooBig, 0, address(router), _tradeCalldata(tooBig, 24e18)
        );
    }

    function test_RevertWhen_ExceedsDailyCap() public {
        // Top up so balance is never the binding constraint — only the
        // rolling 24h notional cap should be able to fire here.
        usdg.mint(address(vault), 40_000e6);

        uint256 amountIn = 3_000e6; // $3,000 per trade
        uint256 amountOut = 12e18; // fair at $250/share
        uint256 minOutFloor = 11.88e18; // amountOut * (1 - 1% slippage)

        vm.startPrank(ownerAddr);
        vault.executeTrade(
            address(usdg),
            address(stock),
            amountIn,
            minOutFloor,
            address(router),
            _tradeCalldata(amountIn, amountOut)
        );
        _advanceTime(MIN_SECONDS_BETWEEN_TRADES + 1);
        vault.executeTrade(
            address(usdg),
            address(stock),
            amountIn,
            minOutFloor,
            address(router),
            _tradeCalldata(amountIn, amountOut)
        );
        _advanceTime(MIN_SECONDS_BETWEEN_TRADES + 1);
        vault.executeTrade(
            address(usdg),
            address(stock),
            amountIn,
            minOutFloor,
            address(router),
            _tradeCalldata(amountIn, amountOut)
        );
        // Cumulative so far: $9,000. One more $3,000 trade would be $12,000 > $10,000 cap.
        _advanceTime(MIN_SECONDS_BETWEEN_TRADES + 1);
        vm.expectRevert("AgentVault: exceeds daily notional cap");
        vault.executeTrade(
            address(usdg),
            address(stock),
            amountIn,
            0,
            address(router),
            _tradeCalldata(amountIn, amountOut)
        );
        vm.stopPrank();
    }

    function test_DailyCap_RollsOffAfter24Hours() public {
        // Raise the per-trade cap so a single $9,000 trade (deliberately
        // close to the $10,000 daily cap) doesn't trip it instead.
        AgentVault.Policy memory loosePerTrade = _defaultPolicy();
        loosePerTrade.maxNotionalPerTrade = 20_000e18;
        vm.prank(ownerAddr);
        vault.setPolicy(loosePerTrade);

        usdg.mint(address(vault), 40_000e6);
        uint256 amountIn = 9_000e6; // $9,000 — near the $10,000 daily cap alone

        vm.startPrank(ownerAddr);
        vault.executeTrade(
            address(usdg),
            address(stock),
            amountIn,
            35.64e18,
            address(router),
            _tradeCalldata(amountIn, 36e18)
        );

        // Immediately after, even a small further trade should breach the cap.
        _advanceTime(MIN_SECONDS_BETWEEN_TRADES + 1);
        vm.expectRevert("AgentVault: exceeds daily notional cap");
        vault.executeTrade(
            address(usdg),
            address(stock),
            2_000e6,
            0,
            address(router),
            _tradeCalldata(2_000e6, 8e18)
        );

        // 24h+ later, the first trade has rolled out of the window. Refresh
        // the mock feeds too — real Chainlink updates continuously, so a
        // 25-hour-old mock price would otherwise trip the staleness check
        // that's under test elsewhere, not the daily-cap rollover this test cares about.
        _advanceTime(25 hours);
        usdgFeed.setAnswer(int256(USDG_PRICE));
        stockFeed.setAnswer(int256(STOCK_PRICE));
        vault.executeTrade(
            address(usdg),
            address(stock),
            2_000e6,
            7.92e18,
            address(router),
            _tradeCalldata(2_000e6, 8e18)
        );
        vm.stopPrank();
    }

    function test_RevertWhen_CooldownActive() public {
        vm.startPrank(ownerAddr);
        vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            FAIR_MIN_OUT_FLOOR,
            address(router),
            _tradeCalldata(FAIR_AMOUNT_IN, FAIR_AMOUNT_OUT)
        );

        vm.expectRevert("AgentVault: cooldown active");
        vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            0,
            address(router),
            _tradeCalldata(FAIR_AMOUNT_IN, FAIR_AMOUNT_OUT)
        );
        vm.stopPrank();
    }

    function test_RevertWhen_ExceedsMaxPositionShare() public {
        // Tighten to 10% of NAV so an ordinary-sized trade breaches it.
        AgentVault.Policy memory tight = _defaultPolicy();
        tight.maxPositionBps = 1_000;
        vm.prank(ownerAddr);
        vault.setPolicy(tight);

        uint256 amountIn = 2_000e6; // $2,000 = 20% of the $10,000 NAV
        uint256 fairOut = 8e18;

        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: exceeds max position share");
        vault.executeTrade(
            address(usdg),
            address(stock),
            amountIn,
            fairOut * 99 / 100,
            address(router),
            _tradeCalldata(amountIn, fairOut)
        );
    }

    // -- oracle / slippage corridor ----------------------------------------

    function test_RevertWhen_MinOutBelowOracleFloor() public {
        // Caller tries to authorize a floor worse than the 1% corridor
        // around the Chainlink-implied fair price (3.96e18) allows.
        uint256 belowFloor = 3.5e18;
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: minOut below oracle floor");
        vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            belowFloor,
            address(router),
            _tradeCalldata(FAIR_AMOUNT_IN, belowFloor)
        );
    }

    function test_RevertWhen_RouterDeliversLessThanPromisedMinOut() public {
        // minOut itself clears the oracle floor, but the router shorts it.
        uint256 minOut = FAIR_MIN_OUT_FLOOR;
        uint256 actualOut = 3.9e18; // below minOut, though router call "succeeds"
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: received less than minOut");
        vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            minOut,
            address(router),
            _tradeCalldata(FAIR_AMOUNT_IN, actualOut)
        );
    }

    function test_RevertWhen_PriceIsStale() public {
        vm.warp(block.timestamp + 2 hours); // > STALENESS_THRESHOLD, feeds never refreshed
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: stale price");
        vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            FAIR_MIN_OUT_FLOOR,
            address(router),
            _tradeCalldata(FAIR_AMOUNT_IN, FAIR_AMOUNT_OUT)
        );
    }

    // -- pause / kill switch -------------------------------------------------

    function test_RevertWhen_TradingWhilePaused() public {
        vm.startPrank(ownerAddr);
        vault.pause();
        vm.expectRevert("AgentVault: paused");
        vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            FAIR_MIN_OUT_FLOOR,
            address(router),
            _tradeCalldata(FAIR_AMOUNT_IN, FAIR_AMOUNT_OUT)
        );
        vm.stopPrank();
    }

    function test_TradingResumesAfterUnpause() public {
        vm.startPrank(ownerAddr);
        vault.pause();
        vault.unpause();
        uint256 out = vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            FAIR_MIN_OUT_FLOOR,
            address(router),
            _tradeCalldata(FAIR_AMOUNT_IN, FAIR_AMOUNT_OUT)
        );
        vm.stopPrank();
        assertEq(out, FAIR_AMOUNT_OUT);
    }

    function test_RevertWhen_NonOwnerPauses() public {
        vm.prank(strangerAddr);
        vm.expectRevert("AgentVault: not owner");
        vault.pause();
    }

    // -- happy path ----------------------------------------------------------

    function test_AgentCanTradeWithinPolicy() public {
        _armAgent();
        vm.prank(agentAddr);
        uint256 out = vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            FAIR_MIN_OUT_FLOOR,
            address(router),
            _tradeCalldata(FAIR_AMOUNT_IN, FAIR_AMOUNT_OUT)
        );
        assertEq(out, FAIR_AMOUNT_OUT);
        assertEq(stock.balanceOf(address(vault)), FAIR_AMOUNT_OUT);
        assertEq(usdg.balanceOf(address(vault)), 10_000e6 - FAIR_AMOUNT_IN);
    }

    // -- router call failure bubbling ---------------------------------------

    function test_RevertWhen_RouterCallFailsWithReason_BubblesTheReason() public {
        bytes memory badCalldata = abi.encodeWithSelector(MockRouter.revertWithReason.selector);
        vm.prank(ownerAddr);
        vm.expectRevert("MockRouter: intentional failure");
        vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            FAIR_MIN_OUT_FLOOR,
            address(router),
            badCalldata
        );
    }

    function test_RevertWhen_RouterCallFailsWithNoReason_UsesGenericMessage() public {
        bytes memory unknownSelectorCalldata = hex"deadbeef";
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: swap call failed");
        vault.executeTrade(
            address(usdg),
            address(stock),
            FAIR_AMOUNT_IN,
            FAIR_MIN_OUT_FLOOR,
            address(router),
            unknownSelectorCalldata
        );
    }

    // -- views ----------------------------------------------------------

    function test_Views_ReportAllowlistLengths() public view {
        assertEq(vault.allowedRoutersLength(), 1);
        assertEq(vault.allowedTokensLength(), 2);
    }
}
