// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AgentVault } from "./AgentVault.sol";

/// @notice Deploys one AgentVault per owner via CREATE2, so the vault address
/// is deterministic from the owner's address alone — computable (and
/// fundable) before the vault is even deployed.
contract VaultFactory {
    address public immutable quoteToken;

    mapping(address => address) public vaultOf;

    event VaultCreated(address indexed owner, address vault);

    constructor(address _quoteToken) {
        require(_quoteToken != address(0), "VaultFactory: zero quote token");
        quoteToken = _quoteToken;
    }

    function createVault() external returns (address vault) {
        require(vaultOf[msg.sender] == address(0), "VaultFactory: vault already exists");
        bytes32 salt = _salt(msg.sender);
        vault = address(new AgentVault{ salt: salt }(msg.sender, quoteToken));
        vaultOf[msg.sender] = vault;
        emit VaultCreated(msg.sender, vault);
    }

    /// @notice Predicts the vault address for `owner_` before it's deployed.
    function computeVaultAddress(address owner_) external view returns (address predicted) {
        bytes32 salt = _salt(owner_);
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(type(AgentVault).creationCode, abi.encode(owner_, quoteToken))
        );
        predicted = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash))
                )
            )
        );
    }

    function _salt(address owner_) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner_));
    }
}
