// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { VaultTestBase } from "./helpers/VaultTestBase.sol";

contract AgentVaultAgentLifecycleTest is VaultTestBase {
    function test_RevertWhen_NonOwnerSetsAgent() public {
        vm.prank(strangerAddr);
        vm.expectRevert("AgentVault: not owner");
        vault.setAgent(agentAddr, block.timestamp + 1 days);
    }

    function test_RevertWhen_RevokedAgentTrades() public {
        _armAgent();
        vm.prank(ownerAddr);
        vault.revokeAgent();

        vm.prank(agentAddr);
        vm.expectRevert("AgentVault: not authorized");
        vault.executeTrade(
            address(usdg),
            address(stock),
            1_000e6,
            0,
            address(router),
            _swapCalldata(address(usdg), address(stock), 1_000e6, 4e18)
        );
    }

    function test_RevertWhen_ExpiredAgentKeyTrades() public {
        vm.prank(ownerAddr);
        vault.setAgent(agentAddr, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(agentAddr);
        vm.expectRevert("AgentVault: agent key expired");
        vault.executeTrade(
            address(usdg),
            address(stock),
            1_000e6,
            0,
            address(router),
            _swapCalldata(address(usdg), address(stock), 1_000e6, 4e18)
        );
    }

    function test_RevertWhen_ExpiryInPast() public {
        vm.prank(ownerAddr);
        vm.expectRevert("AgentVault: expiry in past");
        vault.setAgent(agentAddr, block.timestamp);
    }

    function test_Owner_CanTradeWithoutAnAgentSet() public {
        // owner is never subject to the expiry check, only agent-key trades are
        uint256 minOut = 3.96e18 wei;
        vm.prank(ownerAddr);
        uint256 out = vault.executeTrade(
            address(usdg),
            address(stock),
            1_000e6,
            minOut,
            address(router),
            _swapCalldata(address(usdg), address(stock), 1_000e6, 4e18)
        );
        assertEq(out, 4e18);
    }
}
