// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IScaledUIAmount, IScaledUIAmountNewUIMultiplier } from "../src/interfaces/IScaledUIAmount.sol";

/// @notice Stand-in for a Robinhood Stock Token: plain ERC-20 + ERC-8056
/// (uiMultiplier) for corporate actions, exactly per the docs — real
/// stock-token liquidity on testnet isn't guaranteed, so the vertical slice
/// trades against this instead. Free mint for test/seed convenience only.
contract MockStockToken is ERC20, IScaledUIAmount, IScaledUIAmountNewUIMultiplier {
    uint8 private immutable _decimals;

    uint256 public uiMultiplier = 1e18;
    uint256 public newUIMultiplier = 1e18;
    uint256 public effectiveAt;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Simulates a corporate action (split/dividend) taking effect —
    /// raw balances are untouched, only the UI-facing multiplier moves.
    function setUiMultiplier(uint256 newMultiplier, uint256 effectiveAtTimestamp) external {
        uint256 old = uiMultiplier;
        newUIMultiplier = newMultiplier;
        effectiveAt = effectiveAtTimestamp;
        uiMultiplier = newMultiplier;
        emit UIMultiplierUpdated(old, newMultiplier, effectiveAtTimestamp);
    }
}
