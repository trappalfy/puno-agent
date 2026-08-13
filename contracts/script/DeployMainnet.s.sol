// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";

import { VaultFactory } from "../src/VaultFactory.sol";
import { PunoCredits } from "../src/PunoCredits.sol";

/// @notice Production deploy for Robinhood Chain mainnet (4663).
///
/// Deliberately the opposite of DeployTestnet: no mock tokens, no mock router,
/// no demo vault. Deploying those here would put fake "TSLA" and a fake router
/// with fake liquidity at real addresses on a real chain — which is worse than
/// useless, it is a trap for anyone who finds them.
///
/// It also does not create a vault or set any price feed. Vaults are created by
/// their owners through the factory, and feeds are per-vault owner-only config
/// set by the wizard, using the addresses and per-feed staleness windows in
/// packages/shared/src/network/config.ts.
///
/// Usage:
///   DEPLOYER_PRIVATE_KEY=0x... forge script script/DeployMainnet.s.sol \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast
///
/// Optional, once PUNO exists — deploys the billing contract in the same run:
///   PUNO_TOKEN_ADDRESS=0x... PUNO_TREASURY=0x... PUNO_MIN_DEPOSIT=<wei>
contract DeployMainnet is Script {
    /// @dev Global Dollar on Robinhood Chain mainnet, verified against
    /// https://docs.robinhood.com/chain/connecting and mirrored in
    /// packages/shared/src/network/config.ts. Hard-coded rather than read from
    /// env: the quote token is immutable in VaultFactory, so a typo here is not
    /// a misconfiguration, it is a permanently wrong deployment.
    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    uint256 internal constant EXPECTED_CHAIN_ID = 4663;

    function run() external {
        require(block.chainid == EXPECTED_CHAIN_ID, "DeployMainnet: wrong chain");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Optional until the token launches. Read before broadcasting so a
        // missing treasury fails before anything is sent, not halfway through.
        address punoToken = vm.envOr("PUNO_TOKEN_ADDRESS", address(0));
        address treasury = vm.envOr("PUNO_TREASURY", address(0));
        uint256 minDeposit = vm.envOr("PUNO_MIN_DEPOSIT", uint256(0));
        if (punoToken != address(0)) {
            require(treasury != address(0), "DeployMainnet: PUNO_TREASURY required with token");
        }

        vm.startBroadcast(deployerKey);

        VaultFactory factory = new VaultFactory(USDG);

        address credits = address(0);
        if (punoToken != address(0)) {
            credits = address(new PunoCredits(punoToken, treasury, minDeposit));
        }

        vm.stopBroadcast();

        console.log("Chain id            ", block.chainid);
        console.log("Deployer            ", deployer);
        console.log("Quote token (USDG)  ", USDG);
        console.log("VaultFactory        ", address(factory));
        if (credits == address(0)) {
            console.log("PunoCredits          (skipped - PUNO_TOKEN_ADDRESS not set)");
        } else {
            console.log("PunoCredits         ", credits);
            console.log("Treasury            ", treasury);
        }
        console.log("");
        console.log("Next: write these into packages/shared/src/network/config.ts");
        console.log("under NETWORKS.mainnet, and verify the contracts on Blockscout.");
    }
}
