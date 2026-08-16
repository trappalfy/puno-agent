// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";

import { VaultFactory } from "../src/VaultFactory.sol";

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
/// It also no longer deploys `PunoCredits`. That moved to
/// `DeployPunoCredits.s.sol`, because the two have opposite timing: the factory
/// has no PUNO dependency and should go out **early**, so that the riskiest step
/// of launch day is already rehearsed, while `PunoCredits.token` is immutable
/// and so the billing contract cannot exist until the token does. Leaving both
/// in one script meant the launch-day run would silently deploy a **second**
/// VaultFactory at a fresh address, while the first — already in config.ts,
/// possibly already holding user vaults — stayed where it was.
///
/// Usage:
///   DEPLOYER_PRIVATE_KEY=0x... forge script script/DeployMainnet.s.sol \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast
///
/// Run once, ahead of the token launch. Deploying the billing contract later is
/// `DeployPunoCredits.s.sol`.
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

        // Refused rather than ignored. Anyone reaching for the old combined
        // invocation is expecting this run to deploy billing too, and silently
        // deploying only half of what they asked for is how a second
        // VaultFactory ends up on chain — they would run it again with the
        // right script and get one. Naming the replacement costs one line.
        require(
            vm.envOr("PUNO_TOKEN_ADDRESS", address(0)) == address(0),
            "DeployMainnet: PUNO_TOKEN_ADDRESS is for DeployPunoCredits.s.sol, not this script"
        );

        vm.startBroadcast(deployerKey);
        VaultFactory factory = new VaultFactory(USDG);
        vm.stopBroadcast();

        console.log("Chain id            ", block.chainid);
        console.log("Deployer            ", deployer);
        console.log("Quote token (USDG)  ", USDG);
        console.log("VaultFactory        ", address(factory));
        console.log("");
        console.log("Next: write vaultFactory into NETWORKS.mainnet in");
        console.log("packages/shared/src/network/config.ts, and verify on Blockscout.");
        console.log("");
        console.log("Mainnet stays closed to users until PUNO launches - see whyClosed()");
        console.log("in packages/shared/src/network/policy.ts. Recording this address does");
        console.log("not open it, because punoCredits is what the wizard gates on.");
    }
}
