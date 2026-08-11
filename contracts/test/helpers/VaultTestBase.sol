// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";

import { AgentVault } from "../../src/AgentVault.sol";
import { VaultFactory } from "../../src/VaultFactory.sol";
import { MockStockToken } from "../../mocks/MockStockToken.sol";
import { MockAggregatorV3 } from "../../mocks/MockAggregatorV3.sol";
import { MockRouter } from "../../mocks/MockRouter.sol";

/// @notice Shared fixture: a funded, policy-configured vault trading a mock
/// 6-decimal quote token (USDG's real decimals — see network config) against
/// an 18-decimal mock stock token, through a MockRouter with test-controlled
/// swap output. Deliberately mismatched decimals: real USDG has 6, not 18,
/// and the vault's NAV/slippage math must handle that correctly.
abstract contract VaultTestBase is Test {
    address internal ownerAddr = makeAddr("owner");
    address internal agentAddr = makeAddr("agent");
    address internal strangerAddr = makeAddr("stranger");
    address internal feeRecipientAddr = makeAddr("feeRecipient");

    MockStockToken internal usdg;
    MockStockToken internal stock;
    MockAggregatorV3 internal usdgFeed;
    MockAggregatorV3 internal stockFeed;
    MockRouter internal router;

    VaultFactory internal factory;
    AgentVault internal vault;

    uint256 internal constant USDG_PRICE = 1e8; // $1.00, 8-decimal feed
    uint256 internal constant STOCK_PRICE = 250e8; // $250.00, 8-decimal feed

    uint256 internal constant MAX_NOTIONAL_PER_TRADE = 5_000e18; // $5,000
    uint256 internal constant MAX_DAILY_NOTIONAL = 10_000e18; // $10,000
    uint256 internal constant MAX_POSITION_BPS = 8_000; // 80% of NAV
    uint256 internal constant MIN_SECONDS_BETWEEN_TRADES = 60;
    uint256 internal constant MAX_SLIPPAGE_BPS = 100; // 1%

    // Tests track "now" themselves rather than re-reading block.timestamp
    // after a warp: under via-ir (needed elsewhere for executeTrade's local
    // count), solc can treat repeated block.timestamp reads within one
    // function as call-invariant and cache the pre-warp value — confirmed
    // empirically (two sequential `vm.warp(block.timestamp + N)` calls both
    // resolved to the same timestamp). Always warp from this counter instead.
    uint256 internal currentTime;

    function _advanceTime(uint256 delta) internal {
        currentTime += delta;
        vm.warp(currentTime);
    }

    function setUp() public virtual {
        // AgentVault.lastTradeTimestamp defaults to 0, so the very first
        // trade's cooldown check (block.timestamp >= 0 + minSecondsBetweenTrades)
        // would fail against Foundry's near-zero default starting timestamp.
        // A fresh chain is never actually at timestamp ~1 in practice — warp
        // to a realistic time before anything else happens.
        currentTime = 1_700_000_000;
        vm.warp(currentTime);

        usdg = new MockStockToken("Mock Global Dollar", "USDG", 6);
        stock = new MockStockToken("Mock Tesla Stock", "TSLA", 18);

        usdgFeed = new MockAggregatorV3(8, "USDG / USD", int256(USDG_PRICE));
        stockFeed = new MockAggregatorV3(8, "TSLA / USD", int256(STOCK_PRICE));

        router = new MockRouter();

        factory = new VaultFactory(address(usdg));

        vm.prank(ownerAddr);
        vault = AgentVault(factory.createVault());

        vm.startPrank(ownerAddr);
        vault.setPriceFeed(address(usdg), address(usdgFeed));
        vault.setPriceFeed(address(stock), address(stockFeed));

        AgentVault.Policy memory policy = _defaultPolicy();
        vault.setPolicy(policy);
        vm.stopPrank();

        // Fund the vault with quote token and the router with both sides of
        // the swap so trades can go either direction in tests.
        usdg.mint(address(vault), 10_000e6);
        usdg.mint(address(router), 100_000e6);
        stock.mint(address(router), 1_000e18);
    }

    function _defaultPolicy() internal view returns (AgentVault.Policy memory policy) {
        address[] memory routers = new address[](1);
        routers[0] = address(router);

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdg);
        tokens[1] = address(stock);

        policy = AgentVault.Policy({
            allowedRouters: routers,
            allowedTokens: tokens,
            maxNotionalPerTrade: MAX_NOTIONAL_PER_TRADE,
            maxDailyNotional: MAX_DAILY_NOTIONAL,
            maxPositionBps: MAX_POSITION_BPS,
            minSecondsBetweenTrades: MIN_SECONDS_BETWEEN_TRADES,
            maxSlippageBps: MAX_SLIPPAGE_BPS
        });
    }

    /// @dev Builds calldata for MockRouter.swap and always routes proceeds
    /// back to the vault, matching how a real router integration would.
    function _swapCalldata(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)
        internal
        view
        returns (bytes memory)
    {
        return abi.encodeWithSelector(
            MockRouter.swap.selector, tokenIn, tokenOut, amountIn, amountOut, address(vault)
        );
    }

    function _armAgent() internal {
        vm.prank(ownerAddr);
        vault.setAgent(agentAddr, block.timestamp + 7 days);
    }
}
