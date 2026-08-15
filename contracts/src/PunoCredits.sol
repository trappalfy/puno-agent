// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Takes PUNO from a user and forwards it to the treasury, emitting the
/// one event our billing backend indexes to credit that user's balance.
///
/// Deliberately knows nothing about dollars. Prices are canonical in USD and the
/// PUNO/USD conversion happens server-side at credit time, so putting a rate (or
/// an oracle, or a balance) on-chain here would only create a second source of
/// truth that can disagree with the ledger. This contract's whole job is to make
/// "who paid how much, exactly once" indisputable.
contract PunoCredits is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The token accepted as payment. Immutable: redirecting payment to
    /// a different token is a different product, not a config change.
    IERC20 public immutable token;

    /// @notice Where payments land. Mutable so treasury custody can be rotated
    /// (hot wallet -> multisig) without redeploying and re-pointing the app.
    address public treasury;

    /// @notice Payments below this are rejected. A deposit worth less than the
    /// gas to index it is a net loss, and dust spam would bloat the ledger.
    uint256 public minDeposit;

    /// @notice Monotonic, never reused. This — not the transaction hash — is the
    /// idempotency key the indexer dedupes on: one transaction can legitimately
    /// contain several deposits, and keying on the hash would silently drop all
    /// but one of them.
    uint256 public depositNonce;

    event CreditsPurchased(
        address indexed payer, uint256 tokenAmount, uint256 indexed nonce, address treasury
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MinDepositUpdated(uint256 oldMinDeposit, uint256 newMinDeposit);
    event Swept(address indexed token, address indexed to, uint256 amount);

    constructor(address token_, address treasury_, uint256 minDeposit_) Ownable(msg.sender) {
        require(token_ != address(0), "PunoCredits: zero token");
        require(treasury_ != address(0), "PunoCredits: zero treasury");
        token = IERC20(token_);
        treasury = treasury_;
        minDeposit = minDeposit_;
    }

    // ---------------------------------------------------------------------
    // Payment
    // ---------------------------------------------------------------------

    /// @notice Pays `amount` of PUNO toward the caller's credit balance. Requires
    /// a prior `approve` — this is the second of the two transactions the top-up
    /// UI walks the user through.
    /// @return received The amount the treasury actually gained. Reported rather
    /// than echoing `amount` because those differ under a fee-on-transfer token;
    /// the backend credits what arrived, never what was requested.
    function deposit(uint256 amount) external nonReentrant returns (uint256 received) {
        require(amount >= minDeposit, "PunoCredits: below minimum");

        address treasury_ = treasury;
        // Checked explicitly, ahead of the transfer, because the failure it
        // prevents is otherwise unreadable: a self-transfer moves the treasury's
        // balance to itself, the delta below is zero, and the deposit reverts
        // with "nothing received" — which points at a fee-on-transfer token
        // rather than at the real cause. Hit for real on testnet 2026-08-14,
        // where DeployTestnet made the deployer both payer and treasury and the
        // billing path could not be exercised at all until it was rotated.
        //
        // It is also a genuine invariant, not just ergonomics: crediting the
        // treasury for paying itself would mint balance out of nothing.
        require(msg.sender != treasury_, "PunoCredits: payer is the treasury");

        uint256 balanceBefore = token.balanceOf(treasury_);
        token.safeTransferFrom(msg.sender, treasury_, amount);
        received = token.balanceOf(treasury_) - balanceBefore;

        // A token that took the whole transfer as fee would otherwise emit a
        // zero-value event and hand the indexer a credit of nothing to reconcile.
        require(received > 0, "PunoCredits: nothing received");

        uint256 nonce = ++depositNonce;
        emit CreditsPurchased(msg.sender, received, nonce, treasury_);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "PunoCredits: zero treasury");
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setMinDeposit(uint256 newMinDeposit) external onlyOwner {
        uint256 old = minDeposit;
        minDeposit = newMinDeposit;
        emit MinDepositUpdated(old, newMinDeposit);
    }

    /// @notice Forwards tokens sent directly to this contract on to the treasury.
    /// `deposit` never leaves a balance here, so this only ever recovers funds
    /// someone transferred in by mistake — and it can only ever move them to the
    /// treasury, never to an arbitrary address.
    function sweep(address token_) external onlyOwner returns (uint256 amount) {
        amount = IERC20(token_).balanceOf(address(this));
        if (amount > 0) {
            IERC20(token_).safeTransfer(treasury, amount);
            emit Swept(token_, treasury, amount);
        }
    }
}
