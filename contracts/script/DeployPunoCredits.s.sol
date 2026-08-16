// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";

import { PunoCredits } from "../src/PunoCredits.sol";

/// @notice Deploys the billing contract, and nothing else, once PUNO exists.
///
/// Split out of DeployMainnet because that script *always* deploys a
/// VaultFactory. The intended sequence is to deploy the factory well ahead of
/// the token launch — it has no PUNO dependency, and doing it early means the
/// riskiest step of launch day has already been rehearsed — and then to deploy
/// only PunoCredits on the day. Re-running DeployMainnet at that point would
/// create a **second** factory at a fresh address while the first one, already
/// recorded in config.ts and possibly already holding user vaults, stayed where
/// it was. Two live factories on one chain is not a state worth being one
/// forgotten flag away from.
///
/// This exists at all because `PunoCredits.token` is immutable: the contract
/// cannot be deployed before the token it accepts. That is the whole reason
/// launch day contains an on-chain deploy rather than a config edit.
///
/// Usage:
///   DEPLOYER_PRIVATE_KEY=0x... \
///   PUNO_TOKEN_ADDRESS=0x... PUNO_TREASURY=0x... PUNO_OWNER=0x... \
///   PUNO_MIN_DEPOSIT=<raw token units> \
///   forge script script/DeployPunoCredits.s.sol \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast
///
/// Set CHAIN_ID to run it against testnet; it defaults to mainnet so the
/// dangerous direction is the one that requires an explicit act.
contract DeployPunoCredits is Script {
    uint256 internal constant MAINNET_CHAIN_ID = 4663;

    /// Everything the deploy needs, separated from where it came from.
    ///
    /// `run()` reads the environment and fills this in; `validate` and `deploy`
    /// take it as an argument and never touch `vm.envX`. That split is what
    /// makes the guards testable: `vm.setEnv` writes to the *process*, not to
    /// EVM state, so it is not rolled back between tests and Foundry runs test
    /// functions in parallel — env-driven tests of these checks pass or fail
    /// depending on what another test happened to set a moment earlier.
    struct Config {
        uint256 deployerKey;
        address token;
        address treasury;
        address owner;
        uint256 minDeposit;
    }

    /// Every refusal, checked before anything is broadcast so a bad
    /// configuration costs nothing instead of leaving a half-configured contract
    /// at a real address.
    function validate(Config memory c, uint256 expectedChainId) public view {
        require(block.chainid == expectedChainId, "DeployPunoCredits: wrong chain");

        address deployer = vm.addr(c.deployerKey);

        require(c.token != address(0), "DeployPunoCredits: PUNO_TOKEN_ADDRESS is zero");
        require(c.treasury != address(0), "DeployPunoCredits: PUNO_TREASURY is zero");

        // DeployTestnet has always had this check and DeployMainnet never did,
        // which is exactly backwards — the consequence is worse with real money.
        // PunoCredits.deposit rejects `msg.sender == treasury`, so a treasury
        // equal to the deployer means the deployer can never top up, and more
        // importantly it means payments land on a hot key that also holds deploy
        // rights.
        require(c.treasury != deployer, "DeployPunoCredits: PUNO_TREASURY must not be the deployer");

        // Required here, unlike in DeployMainnet where it was optional with a
        // printed warning. Whoever owns this contract can move the treasury and
        // therefore redirect every payment the product ever takes; a warning in
        // a console log is not a control. Ownable2Step means naming an owner
        // costs nothing if it is wrong — nothing is given away until that
        // address calls acceptOwnership() itself.
        require(c.owner != address(0), "DeployPunoCredits: PUNO_OWNER is required");
        require(c.owner != deployer, "DeployPunoCredits: PUNO_OWNER must not be the deployer");

        // A zero minimum is a real setting, but it is almost never the intended
        // one: it lets dust deposits through, and each one costs more to index
        // than it is worth. Required explicitly so that choosing zero is a
        // choice rather than an omission.
        require(c.minDeposit > 0, "DeployPunoCredits: PUNO_MIN_DEPOSIT must be above zero");
    }

    function deploy(Config memory c, uint256 expectedChainId) public returns (PunoCredits) {
        validate(c, expectedChainId);

        vm.startBroadcast(c.deployerKey);
        PunoCredits credits = new PunoCredits(c.token, c.treasury, c.minDeposit);
        // Two-step by design, and the second step is not ours to take: the
        // deployer stays owner until `c.owner` calls acceptOwnership() itself.
        credits.transferOwnership(c.owner);
        vm.stopBroadcast();

        return credits;
    }

    function run() external {
        uint256 expectedChainId = vm.envOr("CHAIN_ID", MAINNET_CHAIN_ID);

        Config memory c = Config({
            deployerKey: vm.envUint("DEPLOYER_PRIVATE_KEY"),
            token: vm.envAddress("PUNO_TOKEN_ADDRESS"),
            treasury: vm.envAddress("PUNO_TREASURY"),
            owner: vm.envAddress("PUNO_OWNER"),
            minDeposit: vm.envUint("PUNO_MIN_DEPOSIT")
        });

        PunoCredits credits = deploy(c, expectedChainId);

        console.log("Chain id            ", block.chainid);
        console.log("Deployer            ", vm.addr(c.deployerKey));
        console.log("PUNO token          ", c.token);
        console.log("PunoCredits         ", address(credits));
        console.log("Treasury            ", c.treasury);
        console.log("Min deposit         ", c.minDeposit);
        console.log("Ownership offered to", c.owner);
        console.log("");
        console.log("NOT YET TRANSFERRED - that address must call acceptOwnership() itself.");
        console.log("Verify with: cast call <credits> \"owner()\" - never from this log.");
        console.log("");
        console.log("Next: write punoToken and punoCredits into NETWORKS.mainnet in");
        console.log("packages/shared/src/network/config.ts, and set the worker's");
        console.log("CREDITS_WATCHER_START_BLOCK to this deployment's block number.");
    }
}
