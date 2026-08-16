// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { DeployPunoCredits } from "../script/DeployPunoCredits.s.sol";
import { PunoCredits } from "../src/PunoCredits.sol";
import { MockStockToken } from "../mocks/MockStockToken.sol";

/// @notice The launch-day script's refusals.
///
/// Worth testing where most scripts are not, because this one runs exactly once,
/// under time pressure, against real money, and every check in it exists to
/// catch a mistake that cannot be undone afterwards: `PunoCredits.token` is
/// immutable, and whoever ends up owning the contract can move the treasury and
/// therefore redirect every payment the product will ever take.
///
/// Driven through `Config` rather than through the environment, which is why the
/// script separates the two. `vm.setEnv` writes to the process, not to EVM
/// state, so it is not rolled back between tests — and Foundry runs test
/// functions in parallel, so env-driven versions of these tests passed or failed
/// depending on what another test had set a moment earlier. Measured, not
/// assumed: the first attempt reported the same test as both passed and failed
/// in one run.
contract DeployPunoCreditsTest is Test {
    uint256 internal constant MAINNET = 4663;
    uint256 internal constant TESTNET = 46630;
    // Deterministic and meaningless: a test key, never used anywhere else.
    uint256 internal constant DEPLOYER_KEY = uint256(keccak256("puno.deploy.test.key"));
    uint256 internal constant ONE_TOKEN = 1e18;

    DeployPunoCredits internal script;
    address internal deployer;
    address internal token;
    address internal treasury = address(0xBEEF);
    address internal owner = address(0xCAFE);

    function setUp() public {
        script = new DeployPunoCredits();
        deployer = vm.addr(DEPLOYER_KEY);
        token = address(new MockStockToken("Puno", "PUNO", 18));
        vm.chainId(MAINNET);
    }

    /// A configuration that should deploy cleanly. Each test changes one field.
    function _valid() internal view returns (DeployPunoCredits.Config memory) {
        return DeployPunoCredits.Config({
            deployerKey: DEPLOYER_KEY,
            token: token,
            treasury: treasury,
            owner: owner,
            minDeposit: ONE_TOKEN
        });
    }

    /// Ownership is *offered*, never completed, and that is the property worth
    /// asserting rather than "it did not revert". Ownable2Step means a typo'd or
    /// unreachable owner cannot brick the contract — nothing is given away until
    /// that address proves it holds the key. It also means the deploy is not the
    /// end of the handover, which is exactly what a launch runbook forgets.
    function test_offersOwnershipWithoutCompletingIt() public {
        PunoCredits credits = script.deploy(_valid(), MAINNET);

        assertEq(credits.owner(), deployer, "deployer still owns it until the owner accepts");
        assertEq(credits.pendingOwner(), owner, "ownership is offered to the cold wallet");

        // And the handover really does complete when that address acts, so the
        // runbook's last step is reachable rather than theoretical.
        vm.prank(owner);
        Ownable2Step(address(credits)).acceptOwnership();
        assertEq(credits.owner(), owner, "owner takes control by acting, not by being named");
    }

    function test_wiresTheImmutableTokenAndTheSettableTreasury() public {
        PunoCredits credits = script.deploy(_valid(), MAINNET);
        assertEq(address(credits.token()), token, "token is what was passed and cannot change");
        assertEq(credits.treasury(), treasury);
        assertEq(credits.minDeposit(), ONE_TOKEN);
    }

    function test_refusesTheWrongChain() public {
        vm.chainId(1);
        vm.expectRevert("DeployPunoCredits: wrong chain");
        script.validate(_valid(), MAINNET);
    }

    /// Defaulting to mainnet means the dangerous direction is the one requiring
    /// no thought, so pointing it elsewhere has to stay possible.
    function test_allowsAnotherChainWhenAskedExplicitly() public {
        vm.chainId(TESTNET);
        script.validate(_valid(), TESTNET);
    }

    function test_refusesAZeroToken() public {
        DeployPunoCredits.Config memory c = _valid();
        c.token = address(0);
        vm.expectRevert("DeployPunoCredits: PUNO_TOKEN_ADDRESS is zero");
        script.validate(c, MAINNET);
    }

    function test_refusesAZeroTreasury() public {
        DeployPunoCredits.Config memory c = _valid();
        c.treasury = address(0);
        vm.expectRevert("DeployPunoCredits: PUNO_TREASURY is zero");
        script.validate(c, MAINNET);
    }

    /// The guard `DeployTestnet` always had and `DeployMainnet` never did, which
    /// was backwards — the consequence is worse with real money. `deposit`
    /// rejects `msg.sender == treasury`, and payments would land on a hot key
    /// that also holds deploy rights.
    function test_refusesATreasuryEqualToTheDeployer() public {
        DeployPunoCredits.Config memory c = _valid();
        c.treasury = deployer;
        vm.expectRevert("DeployPunoCredits: PUNO_TREASURY must not be the deployer");
        script.validate(c, MAINNET);
    }

    /// `DeployMainnet` made this optional and printed a warning instead. A
    /// warning in a console log is not a control.
    function test_refusesAMissingOwner() public {
        DeployPunoCredits.Config memory c = _valid();
        c.owner = address(0);
        vm.expectRevert("DeployPunoCredits: PUNO_OWNER is required");
        script.validate(c, MAINNET);
    }

    function test_refusesAnOwnerEqualToTheDeployer() public {
        DeployPunoCredits.Config memory c = _valid();
        c.owner = deployer;
        vm.expectRevert("DeployPunoCredits: PUNO_OWNER must not be the deployer");
        script.validate(c, MAINNET);
    }

    /// Zero is a real setting and almost never the intended one — it lets
    /// through dust deposits that cost more to index than they are worth. Made
    /// explicit so that choosing it is a choice rather than an omission.
    function test_refusesAZeroMinimumDeposit() public {
        DeployPunoCredits.Config memory c = _valid();
        c.minDeposit = 0;
        vm.expectRevert("DeployPunoCredits: PUNO_MIN_DEPOSIT must be above zero");
        script.validate(c, MAINNET);
    }

    /// The guards run before anything is broadcast, so a bad configuration
    /// cannot leave a contract at a real address.
    function test_deployRefusesBeforeBroadcasting() public {
        DeployPunoCredits.Config memory c = _valid();
        c.owner = address(0);
        vm.expectRevert("DeployPunoCredits: PUNO_OWNER is required");
        script.deploy(c, MAINNET);
    }
}
