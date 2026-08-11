// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { VaultTestBase } from "./helpers/VaultTestBase.sol";
import { MockStockToken } from "../mocks/MockStockToken.sol";

/// @notice The core security guarantee of the whole design (plan 2.2): the
/// agent key can never move funds out of the vault, only swap within policy.
contract AgentVaultAccessTest is VaultTestBase {
    function test_RevertWhen_AgentCallsWithdraw() public {
        _armAgent();
        vm.prank(agentAddr);
        vm.expectRevert("AgentVault: not owner");
        vault.withdraw(address(usdg), 1e6, agentAddr);
    }

    function test_RevertWhen_StrangerCallsWithdraw() public {
        vm.prank(strangerAddr);
        vm.expectRevert("AgentVault: not owner");
        vault.withdraw(address(usdg), 1e6, strangerAddr);
    }

    function test_Owner_CanWithdraw() public {
        uint256 before = usdg.balanceOf(ownerAddr);
        vm.prank(ownerAddr);
        vault.withdraw(address(usdg), 1_000e6, ownerAddr);
        assertEq(usdg.balanceOf(ownerAddr), before + 1_000e6);
    }

    function test_Owner_CanWithdrawToAnyAddress_NotJustSelf() public {
        vm.prank(ownerAddr);
        vault.withdraw(address(usdg), 500e6, strangerAddr);
        assertEq(usdg.balanceOf(strangerAddr), 500e6);
    }

    function test_Deposit_AnyoneCanFundAnAllowedToken() public {
        usdg.mint(strangerAddr, 1_000e6);
        vm.startPrank(strangerAddr);
        usdg.approve(address(vault), 1_000e6);
        vault.deposit(address(usdg), 1_000e6);
        vm.stopPrank();
        assertEq(usdg.balanceOf(address(vault)), 11_000e6);
    }

    function test_RevertWhen_DepositingDisallowedToken() public {
        MockStockToken notAllowed = new MockStockToken("Not Allowed", "NOPE", 18);
        notAllowed.mint(address(this), 1);
        notAllowed.approve(address(vault), 1);
        vm.expectRevert("AgentVault: token not allowed");
        vault.deposit(address(notAllowed), 1);
    }
}
