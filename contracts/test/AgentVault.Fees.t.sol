// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { VaultTestBase } from "./helpers/VaultTestBase.sol";

/// @notice Phase 1 ships with feeBps always 0 (plan 3.5) — but the hooks are
/// deployed and must behave correctly today, so no user migration is needed
/// if performance fees are switched on later.
contract AgentVaultFeesTest is VaultTestBase {
    function test_RevertWhen_SetFeeConfigExceedsCap() public {
        uint256 tooHigh = vault.MAX_FEE_BPS() + 1;
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: fee exceeds cap");
        vault.setFeeConfig(feeRecipientAddr, tooHigh);
    }

    function test_RevertWhen_NonOwnerSetsFeeConfig() public {
        vm.prank(strangerAddr);
        vm.expectRevert("AgentVault: not owner");
        vault.setFeeConfig(feeRecipientAddr, 1_000);
    }

    function test_RevertWhen_NonRecipientCollectsFee() public {
        vm.prank(ownerAddr);
        vault.setFeeConfig(feeRecipientAddr, 1_000);

        vm.prank(strangerAddr);
        vm.expectRevert("AgentVault: not fee recipient");
        vault.collectFee();
    }

    function test_CollectFee_NoOpWhenFeeBpsIsZero() public {
        // Recipient configured, but bps left at its phase-1 default of 0.
        vm.prank(ownerAddr);
        vault.setFeeConfig(feeRecipientAddr, 0);

        vm.prank(feeRecipientAddr);
        uint256 paid = vault.collectFee();
        assertEq(paid, 0);
        assertEq(usdg.balanceOf(feeRecipientAddr), 0);
    }

    function test_CollectFee_FirstCallEstablishesBaseline_NoFeeOnPrincipal() public {
        vm.prank(ownerAddr);
        vault.setFeeConfig(feeRecipientAddr, 1_000); // 10%

        // NAV is $10,000 of principal, no appreciation yet. The first call
        // must not treat that principal as profit.
        vm.prank(feeRecipientAddr);
        uint256 paid = vault.collectFee();

        assertEq(paid, 0);
        assertEq(usdg.balanceOf(feeRecipientAddr), 0);
        assertEq(vault.highWaterMark(), vault.nav());
        assertTrue(vault.highWaterMarkInitialized());
    }

    function test_CollectFee_NoOpBelowHighWaterMark() public {
        vm.startPrank(ownerAddr);
        vault.setFeeConfig(feeRecipientAddr, 1_000);
        vm.stopPrank();

        vm.prank(feeRecipientAddr);
        vault.collectFee(); // establishes baseline at current NAV ($10,000)

        // Simulate a loss: owner withdraws, NAV drops below the high-water mark.
        vm.prank(ownerAddr);
        vault.withdraw(address(usdg), 2_000e6, ownerAddr);

        vm.prank(feeRecipientAddr);
        uint256 paid = vault.collectFee();
        assertEq(paid, 0, "no fee should be taken while NAV is below the high-water mark");
    }

    function test_CollectFee_TakesShareOfProfitAboveHighWaterMark_AndRaisesHWM() public {
        vm.prank(ownerAddr);
        vault.setFeeConfig(feeRecipientAddr, 1_000); // 10%

        vm.prank(feeRecipientAddr);
        vault.collectFee(); // baseline: $10,000

        // Simulate profit by minting the vault more quote token directly
        // (equivalent to trading gains realized back into USDG).
        usdg.mint(address(vault), 1_000e6); // NAV now $11,000 -> $1,000 profit

        uint256 navAtCollection = vault.nav();
        assertEq(navAtCollection, 11_000e18);

        vm.prank(feeRecipientAddr);
        uint256 paid = vault.collectFee();

        // 10% of $1,000 profit = $100 = 100e6 raw USDG (6 decimals).
        assertEq(paid, 100e6);
        assertEq(usdg.balanceOf(feeRecipientAddr), 100e6);
        assertEq(vault.highWaterMark(), navAtCollection);

        // Calling again immediately (no further profit) is a no-op.
        vm.prank(feeRecipientAddr);
        uint256 paidAgain = vault.collectFee();
        assertEq(paidAgain, 0);
    }

    function test_CollectFee_NoOpWhenProfitRoundsDownToZeroFee() public {
        vm.prank(ownerAddr);
        vault.setFeeConfig(feeRecipientAddr, 1); // 0.01%, the smallest nonzero bps

        vm.prank(feeRecipientAddr);
        vault.collectFee(); // establishes baseline

        // 1 wei of the 18-decimal stock token is worth 250 (1e18-scaled USD)
        // at the $250 mock price — a "profit" too small for 0.01% of it to
        // survive (profit * feeBps) / 10_000 integer division.
        stock.mint(address(vault), 1);
        assertTrue(vault.nav() > vault.highWaterMark(), "sanity: NAV must have moved");

        vm.prank(feeRecipientAddr);
        uint256 paid = vault.collectFee();
        assertEq(paid, 0, "fee rounds down to zero on dust-sized profit");
    }
}
