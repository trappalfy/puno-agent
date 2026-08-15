// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { PunoCredits } from "../src/PunoCredits.sol";
import { MockStockToken } from "../mocks/MockStockToken.sol";

/// @dev Takes a cut on every transfer. Exists to prove the contract credits what
/// the treasury actually received rather than what the caller asked to send —
/// PUNO will not behave this way, but the indexer's arithmetic must not depend
/// on that assumption holding forever.
contract FeeOnTransferToken is ERC20 {
    uint256 public feeBps;

    constructor(uint256 feeBps_) ERC20("Fee Token", "FEE") {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || feeBps == 0) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = (value * feeBps) / 10_000;
        super._update(from, to, value - fee);
        if (fee > 0) {
            super._update(from, address(0xdead), fee);
        }
    }
}

/// The money path: every one of these is a way the ledger could end up
/// disagreeing with the chain about what a user paid.
contract PunoCreditsTest is Test {
    PunoCredits internal credits;
    MockStockToken internal puno;

    address internal owner = address(this);
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant MIN_DEPOSIT = 100e18;

    event CreditsPurchased(
        address indexed payer, uint256 tokenAmount, uint256 indexed nonce, address treasury
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    function setUp() public {
        puno = new MockStockToken("Puno Token", "PUNO", 18);
        credits = new PunoCredits(address(puno), treasury, MIN_DEPOSIT);

        puno.mint(alice, 10_000e18);
        puno.mint(bob, 10_000e18);
        vm.prank(alice);
        puno.approve(address(credits), type(uint256).max);
        vm.prank(bob);
        puno.approve(address(credits), type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // Deposit
    // ---------------------------------------------------------------------

    /// D4. Hit for real on testnet 2026-08-14: DeployTestnet made the deployer
    /// both the payer and the treasury, so the only account holding PUNO could
    /// not deposit and the billing path was untestable out of the box.
    ///
    /// The failure it used to produce was "nothing received", which points at a
    /// fee-on-transfer token and not at the real cause. The named check has to
    /// come *before* the transfer, or the self-transfer happens first and the
    /// zero delta wins the race to revert.
    function test_Deposit_RejectsTheTreasuryPayingItself() public {
        puno.mint(treasury, 1_000e18);
        vm.prank(treasury);
        puno.approve(address(credits), type(uint256).max);

        vm.prank(treasury);
        vm.expectRevert("PunoCredits: payer is the treasury");
        credits.deposit(500e18);
    }

    function test_Deposit_TreasuryMayPayOnceRotatedAway() public {
        // The check is against the *current* treasury, not a frozen address, so
        // rotating custody frees the old one to become an ordinary payer. This
        // is exactly the workaround used to rescue the testnet deployment.
        address newTreasury = makeAddr("newTreasury");
        credits.setTreasury(newTreasury);

        puno.mint(treasury, 1_000e18);
        vm.prank(treasury);
        puno.approve(address(credits), type(uint256).max);

        vm.prank(treasury);
        credits.deposit(500e18);

        assertEq(puno.balanceOf(newTreasury), 500e18);
    }

    function test_Deposit_MovesTokensToTreasury() public {
        vm.prank(alice);
        credits.deposit(500e18);

        assertEq(puno.balanceOf(treasury), 500e18);
        assertEq(puno.balanceOf(alice), 9_500e18);
        assertEq(puno.balanceOf(address(credits)), 0, "contract must never hold a balance");
    }

    function test_Deposit_EmitsEventWithPayerAmountAndNonce() public {
        vm.expectEmit(true, true, false, true);
        emit CreditsPurchased(alice, 500e18, 1, treasury);

        vm.prank(alice);
        credits.deposit(500e18);
    }

    /// The nonce is the indexer's dedupe key, so it must be globally unique —
    /// not per-payer, and never reused across payers.
    function test_Deposit_NonceIsGloballyMonotonic() public {
        vm.prank(alice);
        credits.deposit(500e18);
        assertEq(credits.depositNonce(), 1);

        vm.prank(bob);
        credits.deposit(200e18);
        assertEq(credits.depositNonce(), 2);

        vm.prank(alice);
        credits.deposit(300e18);
        assertEq(credits.depositNonce(), 3);
    }

    /// Two deposits inside one transaction are legal, which is exactly why the
    /// indexer keys on the nonce instead of the transaction hash.
    function test_Deposit_TwiceInOneTransaction_ProducesDistinctNonces() public {
        vm.startPrank(alice);
        credits.deposit(500e18);
        credits.deposit(500e18);
        vm.stopPrank();

        assertEq(credits.depositNonce(), 2);
        assertEq(puno.balanceOf(treasury), 1_000e18);
    }

    function test_Deposit_ReturnsAmountReceived() public {
        vm.prank(alice);
        uint256 received = credits.deposit(500e18);
        assertEq(received, 500e18);
    }

    function test_RevertWhen_DepositBelowMinimum() public {
        vm.prank(alice);
        vm.expectRevert("PunoCredits: below minimum");
        credits.deposit(MIN_DEPOSIT - 1);
    }

    function test_Deposit_ExactlyAtMinimum_IsAllowed() public {
        vm.prank(alice);
        credits.deposit(MIN_DEPOSIT);
        assertEq(puno.balanceOf(treasury), MIN_DEPOSIT);
    }

    function test_RevertWhen_DepositingWithoutApproval() public {
        address carol = makeAddr("carol");
        puno.mint(carol, 1_000e18);

        vm.prank(carol);
        vm.expectRevert();
        credits.deposit(500e18);
    }

    function test_RevertWhen_DepositExceedsBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        credits.deposit(50_000e18);
    }

    // ---------------------------------------------------------------------
    // Fee-on-transfer accounting
    // ---------------------------------------------------------------------

    function test_Deposit_CreditsWhatArrived_NotWhatWasSent() public {
        FeeOnTransferToken fee = new FeeOnTransferToken(1_000); // 10%
        PunoCredits c = new PunoCredits(address(fee), treasury, 0);

        fee.mint(alice, 1_000e18);
        vm.prank(alice);
        fee.approve(address(c), type(uint256).max);

        vm.expectEmit(true, true, false, true);
        emit CreditsPurchased(alice, 450e18, 1, treasury);

        vm.prank(alice);
        uint256 received = c.deposit(500e18);

        assertEq(received, 450e18);
        assertEq(fee.balanceOf(treasury), 450e18);
    }

    function test_RevertWhen_TokenSwallowsTheEntireTransfer() public {
        FeeOnTransferToken fee = new FeeOnTransferToken(10_000); // 100%
        PunoCredits c = new PunoCredits(address(fee), treasury, 0);

        fee.mint(alice, 1_000e18);
        vm.prank(alice);
        fee.approve(address(c), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert("PunoCredits: nothing received");
        c.deposit(500e18);
    }

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    function test_RevertWhen_ConstructedWithZeroToken() public {
        vm.expectRevert("PunoCredits: zero token");
        new PunoCredits(address(0), treasury, MIN_DEPOSIT);
    }

    function test_RevertWhen_ConstructedWithZeroTreasury() public {
        vm.expectRevert("PunoCredits: zero treasury");
        new PunoCredits(address(puno), address(0), MIN_DEPOSIT);
    }

    // ---------------------------------------------------------------------
    // Treasury rotation
    // ---------------------------------------------------------------------

    function test_SetTreasury_RedirectsSubsequentDeposits() public {
        address multisig = makeAddr("multisig");

        vm.expectEmit(true, true, false, false);
        emit TreasuryUpdated(treasury, multisig);
        credits.setTreasury(multisig);

        vm.prank(alice);
        credits.deposit(500e18);

        assertEq(puno.balanceOf(multisig), 500e18);
        assertEq(puno.balanceOf(treasury), 0);
    }

    function test_RevertWhen_StrangerSetsTreasury() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        credits.setTreasury(alice);
    }

    function test_RevertWhen_SettingZeroTreasury() public {
        vm.expectRevert("PunoCredits: zero treasury");
        credits.setTreasury(address(0));
    }

    function test_RevertWhen_StrangerSetsMinDeposit() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        credits.setMinDeposit(1);
    }

    function test_SetMinDeposit_TakesEffectImmediately() public {
        credits.setMinDeposit(1_000e18);

        vm.prank(alice);
        vm.expectRevert("PunoCredits: below minimum");
        credits.deposit(500e18);
    }

    // ---------------------------------------------------------------------
    // Ownership handover — two-step, so a typo'd address cannot orphan the
    // treasury controls.
    // ---------------------------------------------------------------------

    function test_OwnershipTransfer_RequiresAcceptance() public {
        credits.transferOwnership(bob);
        assertEq(credits.owner(), owner, "ownership must not move on nomination alone");

        vm.prank(bob);
        credits.acceptOwnership();
        assertEq(credits.owner(), bob);
    }

    /// The half of two-step ownership that is easy to misread as "done".
    ///
    /// DeployMainnet calls transferOwnership in the deploy transaction, and its
    /// console output says so — which invites reading the handover as complete.
    /// It is not: until the nominee accepts, the deployer's hot key still moves
    /// the treasury, and therefore still redirects every payment. Pinned so the
    /// deploy script's wording can never quietly become true early.
    function test_OwnershipTransfer_OldOwnerKeepsControlUntilAccepted() public {
        credits.transferOwnership(bob);

        address interim = makeAddr("interim");
        credits.setTreasury(interim);
        assertEq(credits.treasury(), interim, "nominating an owner must not disarm the current one");

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        credits.setTreasury(treasury);
    }

    function test_OwnershipTransfer_OldOwnerIsPowerlessAfterAcceptance() public {
        credits.transferOwnership(bob);
        vm.prank(bob);
        credits.acceptOwnership();

        // This is the assertion the whole pre-mainnet item exists for: after a
        // completed handover the key that deployed the contract can no longer
        // point payments anywhere.
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        credits.setTreasury(alice);
    }

    function test_OwnershipTransfer_OnlyTheNomineeMayAccept() public {
        credits.transferOwnership(bob);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        credits.acceptOwnership();

        assertEq(credits.owner(), owner);
    }

    // ---------------------------------------------------------------------
    // Stray-token recovery
    // ---------------------------------------------------------------------

    function test_Sweep_ForwardsStrayTokensToTreasury() public {
        vm.prank(alice);
        puno.transfer(address(credits), 42e18);
        assertEq(puno.balanceOf(address(credits)), 42e18);

        uint256 swept = credits.sweep(address(puno));

        assertEq(swept, 42e18);
        assertEq(puno.balanceOf(treasury), 42e18);
        assertEq(puno.balanceOf(address(credits)), 0);
    }

    function test_Sweep_OnEmptyBalance_IsANoOp() public {
        assertEq(credits.sweep(address(puno)), 0);
    }

    function test_RevertWhen_StrangerSweeps() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        credits.sweep(address(puno));
    }

    // ---------------------------------------------------------------------
    // Fuzz — the invariant that matters: whatever the treasury gained is
    // exactly what the payer lost, and the contract keeps nothing.
    // ---------------------------------------------------------------------

    function testFuzz_Deposit_ConservesValue(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, 10_000e18);

        uint256 payerBefore = puno.balanceOf(alice);
        uint256 treasuryBefore = puno.balanceOf(treasury);

        vm.prank(alice);
        uint256 received = credits.deposit(amount);

        assertEq(puno.balanceOf(alice), payerBefore - amount);
        assertEq(puno.balanceOf(treasury), treasuryBefore + received);
        assertEq(received, amount);
        assertEq(puno.balanceOf(address(credits)), 0);
    }
}
