// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";

import { AgentVault } from "../src/AgentVault.sol";
import { VaultFactory } from "../src/VaultFactory.sol";
import { PunoCredits } from "../src/PunoCredits.sol";
import { MockStockToken } from "../mocks/MockStockToken.sol";
import { MockAggregatorV3 } from "../mocks/MockAggregatorV3.sol";
import { MockRouter } from "../mocks/MockRouter.sol";

/// @notice Deploys the mock trading environment for Robinhood Chain testnet
/// (46630) — quote token, a handful of stock tokens, Chainlink-shaped price
/// feeds, a swap router, VaultFactory, and one demo vault ready to trade.
///
/// Real testnet liquidity isn't a given: Uniswap v3 is documented as live on
/// Robinhood Chain *mainnet* (4663) — see
/// https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments,
/// which lists mainnet-only addresses and no testnet deployment. Until real
/// testnet DEX addresses are confirmed, this script deploys the mock router
/// from contracts/mocks/ instead of wiring up Uniswap v3 pool creation — the
/// switch the plan calls for (2.2: "переключение реальный/мок — через
/// конфиг сети, один флаг") is a real follow-up, not done here.
///
/// Usage:
///   DEPLOYER_PRIVATE_KEY=0x... forge script script/DeployTestnet.s.sol \
///     --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast
contract DeployTestnet is Script {
    uint256 internal constant USDG_PRICE = 1e8; // $1.00, 8-decimal feed
    uint256 internal constant TSLA_PRICE = 250e8; // $250.00
    uint256 internal constant AAPL_PRICE = 230e8; // $230.00

    uint256 internal constant MAX_NOTIONAL_PER_TRADE = 1_000e18; // $1,000
    uint256 internal constant MAX_DAILY_NOTIONAL = 3_000e18; // $3,000
    uint256 internal constant MAX_POSITION_BPS = 8_000; // 80% of NAV
    uint256 internal constant MIN_SECONDS_BETWEEN_TRADES = 60;
    uint256 internal constant MAX_SLIPPAGE_BPS = 100; // 1%

    // Per-feed staleness windows, sized the way mainnet's real feeds behave:
    // Chainlink's equity feeds on Robinhood Chain republish on deviation every
    // few minutes, while USDG/USD is a peg that only moves on its 24h
    // heartbeat. The mocks below always report a fresh timestamp, so these
    // values are documentation of production's asymmetry as much as config —
    // a single short threshold here would look fine and break on mainnet.
    uint32 internal constant QUOTE_STALENESS = 26 hours;
    uint32 internal constant EQUITY_STALENESS = 1 hours;

    // Mock PUNO supply for exercising the credit top-up flow end to end.
    uint256 internal constant PUNO_MINT = 1_000_000e18;
    uint256 internal constant PUNO_MIN_DEPOSIT = 1e18;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        MockStockToken usdg = new MockStockToken("Mock Global Dollar", "USDG", 6);
        MockStockToken tsla = new MockStockToken("Mock Tesla Stock", "TSLA", 18);
        MockStockToken aapl = new MockStockToken("Mock Apple Stock", "AAPL", 18);

        MockAggregatorV3 usdgFeed = new MockAggregatorV3(8, "Mock USDG / USD", int256(USDG_PRICE));
        MockAggregatorV3 tslaFeed = new MockAggregatorV3(8, "Mock TSLA / USD", int256(TSLA_PRICE));
        MockAggregatorV3 aaplFeed = new MockAggregatorV3(8, "Mock AAPL / USD", int256(AAPL_PRICE));

        MockRouter router = new MockRouter();

        // Router liquidity — deep enough that the demo vault's trade caps
        // below are never the router's problem to solve.
        usdg.mint(address(router), 1_000_000e6);
        tsla.mint(address(router), 10_000e18);
        aapl.mint(address(router), 10_000e18);

        VaultFactory factory = new VaultFactory(address(usdg));

        AgentVault vault = AgentVault(factory.createVault());

        vault.setPriceFeed(address(usdg), address(usdgFeed), QUOTE_STALENESS);
        vault.setPriceFeed(address(tsla), address(tslaFeed), EQUITY_STALENESS);
        vault.setPriceFeed(address(aapl), address(aaplFeed), EQUITY_STALENESS);

        address[] memory routers = new address[](1);
        routers[0] = address(router);
        address[] memory tokens = new address[](3);
        tokens[0] = address(usdg);
        tokens[1] = address(tsla);
        tokens[2] = address(aapl);

        vault.setPolicy(
            AgentVault.Policy({
                allowedRouters: routers,
                allowedTokens: tokens,
                maxNotionalPerTrade: MAX_NOTIONAL_PER_TRADE,
                maxDailyNotional: MAX_DAILY_NOTIONAL,
                maxPositionBps: MAX_POSITION_BPS,
                minSecondsBetweenTrades: MIN_SECONDS_BETWEEN_TRADES,
                maxSlippageBps: MAX_SLIPPAGE_BPS
            })
        );

        // Light funding so the demo vault can trade immediately after deploy.
        usdg.mint(address(vault), 1_000e6);

        // Billing sandbox: a stand-in PUNO plus the payment contract, so the
        // approve -> deposit -> watcher -> credit path can be exercised without
        // waiting for the real token. The deployer gets the supply to test with.
        MockStockToken puno = new MockStockToken("Mock Puno Token", "PUNO", 18);
        PunoCredits credits = new PunoCredits(address(puno), deployer, PUNO_MIN_DEPOSIT);
        puno.mint(deployer, PUNO_MINT);

        vm.stopBroadcast();

        console.log("Deployer            ", deployer);
        console.log("MockStockToken USDG ", address(usdg));
        console.log("MockStockToken TSLA ", address(tsla));
        console.log("MockStockToken AAPL ", address(aapl));
        console.log("MockAggregatorV3 USDG", address(usdgFeed));
        console.log("MockAggregatorV3 TSLA", address(tslaFeed));
        console.log("MockAggregatorV3 AAPL", address(aaplFeed));
        console.log("MockRouter          ", address(router));
        console.log("VaultFactory        ", address(factory));
        console.log("Demo AgentVault     ", address(vault));
        console.log("Mock PUNO           ", address(puno));
        console.log("PunoCredits         ", address(credits));
        console.log("");
        console.log("Put VaultFactory / Mock PUNO / PunoCredits into");
        console.log("packages/shared/src/network/config.ts (testnet.vaultFactory,");
        console.log("testnet.punoToken, testnet.punoCredits), then set a PUNO/USD");
        console.log("rate in token_price_overrides or no deposit can be credited.");
    }
}
