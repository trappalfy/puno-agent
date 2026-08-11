// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice ERC-8056 "Scaled UI Amount" extension — how Robinhood Stock Tokens
/// represent corporate actions (splits, dividends) without rebasing raw balances.
/// Required core interface, per the spec.
interface IScaledUIAmount {
    event UIMultiplierUpdated(
        uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAtTimestamp
    );
    event TransferWithUIAmount(
        address indexed from, address indexed to, uint256 amount, uint256 uiAmount
    );

    /// @notice Current multiplier, 18 decimals (1e18 = 1.0). Raw balances and
    /// Transfer values are unaffected by this — only the *displayed* amount is
    /// raw * uiMultiplier() / 1e18. Chainlink price feeds already price in this
    /// multiplier, so AgentVault's NAV/slippage math never needs to read it.
    function uiMultiplier() external view returns (uint256);
}

/// @notice ERC-8056 required "pending multiplier" extension.
interface IScaledUIAmountNewUIMultiplier {
    function newUIMultiplier() external view returns (uint256);

    function effectiveAt() external view returns (uint256);
}
