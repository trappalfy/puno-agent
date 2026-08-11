// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { VaultFactory } from "../src/VaultFactory.sol";
import { AgentVault } from "../src/AgentVault.sol";
import { MockStockToken } from "../mocks/MockStockToken.sol";

contract VaultFactoryTest is Test {
    VaultFactory internal factory;
    MockStockToken internal quoteToken;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        quoteToken = new MockStockToken("Mock USDG", "USDG", 6);
        factory = new VaultFactory(address(quoteToken));
    }

    function test_CreateVault_AddressMatchesComputedAddress() public {
        address predicted = factory.computeVaultAddress(alice);

        vm.prank(alice);
        address created = factory.createVault();

        assertEq(created, predicted);
    }

    function test_CreateVault_SetsCorrectOwnerAndQuoteToken() public {
        vm.prank(alice);
        AgentVault vault = AgentVault(factory.createVault());

        assertEq(vault.owner(), alice);
        assertEq(vault.quoteToken(), address(quoteToken));
    }

    function test_CreateVault_IsRecordedInVaultOf() public {
        vm.prank(alice);
        address created = factory.createVault();
        assertEq(factory.vaultOf(alice), created);
    }

    function test_DifferentOwners_GetDifferentDeterministicAddresses() public {
        vm.prank(alice);
        address aliceVault = factory.createVault();

        vm.prank(bob);
        address bobVault = factory.createVault();

        assertTrue(aliceVault != bobVault);
        assertEq(aliceVault, factory.computeVaultAddress(alice));
        assertEq(bobVault, factory.computeVaultAddress(bob));
    }

    function test_RevertWhen_CreatingASecondVaultForTheSameOwner() public {
        vm.startPrank(alice);
        factory.createVault();
        vm.expectRevert("VaultFactory: vault already exists");
        factory.createVault();
        vm.stopPrank();
    }

    function test_RevertWhen_QuoteTokenIsZero() public {
        vm.expectRevert("VaultFactory: zero quote token");
        new VaultFactory(address(0));
    }
}
