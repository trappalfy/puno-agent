// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AgentVault } from "../../src/AgentVault.sol";

/// @notice Test-only subclass exposing one internal for property testing.
///
/// `_checkAndRecordDailyNotional` deliberately stays internal in production:
/// it *writes* to the rolling window, so a public version would let anyone pad
/// the history with fabricated notional and push a vault past its own daily cap
/// without trading. The read-only half of that state is public on the real
/// contract (`recentNotionalUsd`), which is all a caller legitimately needs.
///
/// Exercising the write path through `executeTrade` instead would mean routing
/// every case through a mock swap, and the arithmetic under test would be
/// buried under allowlist, cooldown and slippage checks that have their own
/// suites. This keeps the property tests aimed at the arithmetic.
contract AgentVaultHarness is AgentVault {
    constructor(address owner_, address quoteToken_) AgentVault(owner_, quoteToken_) { }

    function exposedCheckAndRecordDailyNotional(uint256 notionalUsd) external {
        _checkAndRecordDailyNotional(notionalUsd);
    }
}
