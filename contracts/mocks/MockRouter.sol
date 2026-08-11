// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal swap router for tests: pulls an exact `amountIn` of
/// `tokenIn` from the caller (AgentVault, which pre-approves it) and pays out
/// an exact, test-controlled `amountOut` of `tokenOut`. Real integration
/// (Uniswap v2/v3/v4, 1inch, etc.) is a testnet/mainnet-only concern — this
/// exists purely so executeTrade's policy checks can be exercised against a
/// deterministic swap outcome.
contract MockRouter {
    using SafeERC20 for IERC20;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address to
    ) external {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, amountOut);
    }

    /// @notice Lets tests exercise AgentVault's revert-bubbling path with a
    /// known reason, instead of relying on an incidental OZ custom error shape.
    function revertWithReason() external pure {
        revert("MockRouter: intentional failure");
    }
}
