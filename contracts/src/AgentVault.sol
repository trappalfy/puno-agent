// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";

/// @notice One vault per user (deployed by VaultFactory via CREATE2). Holds
/// funds non-custodially: the owner can always withdraw everything; the agent
/// key can only swap within an on-chain policy and can never move funds out.
///
/// This is the phase-1 security boundary described in the design plan (2.2):
/// a plain `agentSigner` + on-chain policy, not ERC-4337 session keys — the
/// policy enforcement here *is* the safety guarantee; account abstraction is
/// a later UX layer on top of it, not a replacement for it.
contract AgentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @dev Hard ceiling on feeBps so a compromised or careless owner can
    /// never configure a 100% performance fee. Phase 1 always runs at 0.
    uint256 public constant MAX_FEE_BPS = 2_000; // 20%

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Chainlink price older than this is treated as unusable — trades
    /// and NAV/fee reads revert rather than act on stale data.
    uint256 public constant STALENESS_THRESHOLD = 1 hours;

    uint256 public constant NOTIONAL_WINDOW = 1 days;

    // ---------------------------------------------------------------------
    // Identity / access
    // ---------------------------------------------------------------------

    address public immutable owner;

    /// @notice Token fee amounts are paid out in (e.g. USDG). Fixed at
    /// construction — the owner cannot redirect fee payout to a token that
    /// dodges the NAV/price-feed accounting below.
    address public immutable quoteToken;

    address public agent;
    uint256 public agentExpiry;

    bool public paused;

    modifier onlyOwner() {
        require(msg.sender == owner, "AgentVault: not owner");
        _;
    }

    // ---------------------------------------------------------------------
    // Trading policy
    // ---------------------------------------------------------------------

    struct Policy {
        address[] allowedRouters;
        address[] allowedTokens;
        uint256 maxNotionalPerTrade; // 1e18-scaled USD
        uint256 maxDailyNotional; // 1e18-scaled USD, rolling 24h window
        uint256 maxPositionBps; // out of BPS_DENOMINATOR, share of NAV
        uint256 minSecondsBetweenTrades;
        uint256 maxSlippageBps; // out of BPS_DENOMINATOR, vs Chainlink price
    }

    address[] public allowedRouters;
    mapping(address => bool) public isRouterAllowed;

    address[] public allowedTokens;
    mapping(address => bool) public isTokenAllowed;
    mapping(address => uint8) public tokenDecimals;

    uint256 public maxNotionalPerTrade;
    uint256 public maxDailyNotional;
    uint256 public maxPositionBps;
    uint256 public minSecondsBetweenTrades;
    uint256 public maxSlippageBps;

    uint256 public lastTradeTimestamp;

    struct PriceFeed {
        address aggregator;
        uint8 priceDecimals;
    }

    /// @dev Owner-controlled. executeTrade's caller (the agent) never supplies
    /// a price source directly — if it did, a compromised agent key could
    /// point the slippage check at a feed it controls.
    mapping(address => PriceFeed) public priceFeeds;

    // Rolling 24h notional window: a queue of trade records, pruned from the
    // head on every trade. Bounded in practice by minSecondsBetweenTrades.
    struct TradeRecord {
        uint64 timestamp;
        uint192 notionalUsd;
    }
    TradeRecord[] private tradeHistory;
    uint256 private tradeHistoryHead;

    // ---------------------------------------------------------------------
    // Fee hooks (phase 1: feeBps is always 0 — see plan 2.2 / 3.5)
    // ---------------------------------------------------------------------

    address public feeRecipient;
    uint256 public feeBps;
    uint256 public highWaterMark; // 1e18-scaled USD NAV
    bool public highWaterMarkInitialized;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Deposited(address indexed from, address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount, address indexed to);
    event TradeExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address router,
        uint256 notionalUsd
    );
    event AgentSet(address indexed agent, uint256 expiry);
    event AgentRevoked();
    event PolicyUpdated();
    event PriceFeedSet(address indexed token, address indexed aggregator);
    event VaultPaused();
    event VaultUnpaused();
    event FeeConfigUpdated(address indexed recipient, uint256 bps);
    event FeeCollected(address indexed recipient, uint256 amountPaid, uint256 nav);

    constructor(address _owner, address _quoteToken) {
        require(_owner != address(0), "AgentVault: zero owner");
        require(_quoteToken != address(0), "AgentVault: zero quote token");
        owner = _owner;
        quoteToken = _quoteToken;
    }

    // ---------------------------------------------------------------------
    // Funds — deposit is open, withdraw is owner-only. The agent key is never
    // a party to either function: it cannot appear in `deposit`'s effect on
    // the vault beyond funding it, and `withdraw` doesn't check msg.sender
    // against `agent` at all, only against `owner`.
    // ---------------------------------------------------------------------

    function deposit(address token, uint256 amount) external {
        require(isTokenAllowed[token], "AgentVault: token not allowed");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount, address to) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, amount, to);
    }

    // ---------------------------------------------------------------------
    // Agent key lifecycle
    // ---------------------------------------------------------------------

    function setAgent(address newAgent, uint256 expiry) external onlyOwner {
        require(newAgent != address(0), "AgentVault: zero agent");
        require(expiry > block.timestamp, "AgentVault: expiry in past");
        agent = newAgent;
        agentExpiry = expiry;
        emit AgentSet(newAgent, expiry);
    }

    function revokeAgent() external onlyOwner {
        agent = address(0);
        agentExpiry = 0;
        emit AgentRevoked();
    }

    // ---------------------------------------------------------------------
    // Policy configuration
    // ---------------------------------------------------------------------

    function setPriceFeed(address token, address aggregator) external onlyOwner {
        require(aggregator != address(0), "AgentVault: zero aggregator");
        uint8 priceDecimals = AggregatorV3Interface(aggregator).decimals();
        priceFeeds[token] = PriceFeed({ aggregator: aggregator, priceDecimals: priceDecimals });
        emit PriceFeedSet(token, aggregator);
    }

    function setPolicy(Policy calldata policy) external onlyOwner {
        require(policy.maxPositionBps <= BPS_DENOMINATOR, "AgentVault: maxPositionBps too high");
        require(policy.maxSlippageBps <= BPS_DENOMINATOR, "AgentVault: maxSlippageBps too high");

        uint256 oldRoutersLen = allowedRouters.length;
        for (uint256 i = 0; i < oldRoutersLen; i++) {
            isRouterAllowed[allowedRouters[i]] = false;
        }
        delete allowedRouters;

        uint256 oldTokensLen = allowedTokens.length;
        for (uint256 i = 0; i < oldTokensLen; i++) {
            isTokenAllowed[allowedTokens[i]] = false;
        }
        delete allowedTokens;

        uint256 newRoutersLen = policy.allowedRouters.length;
        for (uint256 i = 0; i < newRoutersLen; i++) {
            address router = policy.allowedRouters[i];
            require(router != address(0), "AgentVault: zero router");
            if (!isRouterAllowed[router]) {
                isRouterAllowed[router] = true;
                allowedRouters.push(router);
            }
        }

        uint256 newTokensLen = policy.allowedTokens.length;
        for (uint256 i = 0; i < newTokensLen; i++) {
            address token = policy.allowedTokens[i];
            require(
                priceFeeds[token].aggregator != address(0), "AgentVault: token has no price feed"
            );
            if (!isTokenAllowed[token]) {
                isTokenAllowed[token] = true;
                allowedTokens.push(token);
                tokenDecimals[token] = IERC20Metadata(token).decimals();
            }
        }

        maxNotionalPerTrade = policy.maxNotionalPerTrade;
        maxDailyNotional = policy.maxDailyNotional;
        maxPositionBps = policy.maxPositionBps;
        minSecondsBetweenTrades = policy.minSecondsBetweenTrades;
        maxSlippageBps = policy.maxSlippageBps;

        emit PolicyUpdated();
    }

    function pause() external onlyOwner {
        paused = true;
        emit VaultPaused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit VaultUnpaused();
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    function executeTrade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address router,
        bytes calldata swapCalldata
    ) external nonReentrant returns (uint256 amountOut) {
        require(msg.sender == agent || msg.sender == owner, "AgentVault: not authorized");
        require(!paused, "AgentVault: paused");
        if (msg.sender == agent) {
            require(block.timestamp <= agentExpiry, "AgentVault: agent key expired");
        }
        require(isTokenAllowed[tokenIn], "AgentVault: tokenIn not allowed");
        require(isTokenAllowed[tokenOut], "AgentVault: tokenOut not allowed");
        require(isRouterAllowed[router], "AgentVault: router not allowed");
        require(
            block.timestamp >= lastTradeTimestamp + minSecondsBetweenTrades,
            "AgentVault: cooldown active"
        );

        uint256 notionalUsd = _valueOf(tokenIn, amountIn);
        require(notionalUsd <= maxNotionalPerTrade, "AgentVault: exceeds per-trade cap");
        _checkAndRecordDailyNotional(notionalUsd);

        uint256 minOutFloor = _minAcceptableOut(tokenIn, tokenOut, amountIn);
        require(minOut >= minOutFloor, "AgentVault: minOut below oracle floor");

        // Effects before the external call.
        lastTradeTimestamp = block.timestamp;

        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        IERC20(tokenIn).forceApprove(router, amountIn);
        (bool success, bytes memory returndata) = router.call(swapCalldata);
        if (!success) {
            _bubbleRevert(returndata);
        }
        IERC20(tokenIn).forceApprove(router, 0);

        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;
        require(amountOut >= minOut, "AgentVault: received less than minOut");

        uint256 navValue = _nav();
        if (navValue > 0) {
            uint256 tokenOutValue = _valueOf(tokenOut, IERC20(tokenOut).balanceOf(address(this)));
            require(
                tokenOutValue * BPS_DENOMINATOR <= maxPositionBps * navValue,
                "AgentVault: exceeds max position share"
            );
        }

        emit TradeExecuted(tokenIn, tokenOut, amountIn, amountOut, router, notionalUsd);
    }

    // ---------------------------------------------------------------------
    // Fee hooks — dead code path in phase 1 (feeBps is always 0), but
    // deployed and tested so no user migration is needed if it's turned on
    // later. See plan 2.2 / 3.5.
    // ---------------------------------------------------------------------

    function setFeeConfig(address recipient, uint256 bps) external onlyOwner {
        require(bps <= MAX_FEE_BPS, "AgentVault: fee exceeds cap");
        feeRecipient = recipient;
        feeBps = bps;
        emit FeeConfigUpdated(recipient, bps);
    }

    function collectFee() external nonReentrant returns (uint256 amountPaid) {
        require(msg.sender == feeRecipient, "AgentVault: not fee recipient");
        if (feeBps == 0) {
            return 0;
        }

        uint256 navValue = _nav();

        // First-ever call establishes the baseline instead of charging a fee
        // on 100% of principal — without this, a cold-start highWaterMark of
        // 0 would read the initial deposit itself as "profit". This does not
        // account for deposits made *after* the baseline is set (a deposit
        // would still look like appreciation) — that is a real gap, but one
        // that only matters once feeBps is turned on for real, which is an
        // explicit later decision (plan 3.5), not a phase-1 concern.
        if (!highWaterMarkInitialized) {
            highWaterMark = navValue;
            highWaterMarkInitialized = true;
            return 0;
        }

        if (navValue <= highWaterMark) {
            return 0;
        }

        uint256 profit = navValue - highWaterMark;
        uint256 feeValueUsd = (profit * feeBps) / BPS_DENOMINATOR;
        highWaterMark = navValue;

        if (feeValueUsd == 0) {
            return 0;
        }

        amountPaid = _valueToRaw(quoteToken, feeValueUsd);
        if (amountPaid > 0) {
            IERC20(quoteToken).safeTransfer(feeRecipient, amountPaid);
        }
        emit FeeCollected(feeRecipient, amountPaid, navValue);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function nav() external view returns (uint256) {
        return _nav();
    }

    function allowedRoutersLength() external view returns (uint256) {
        return allowedRouters.length;
    }

    function allowedTokensLength() external view returns (uint256) {
        return allowedTokens.length;
    }

    // ---------------------------------------------------------------------
    // Internal — pricing and accounting
    // ---------------------------------------------------------------------

    /// @dev USD value (1e18 fixed point) of `rawAmount` of `token`, per its
    /// configured Chainlink feed. Reverts on missing feed, non-positive
    /// price, or a price older than STALENESS_THRESHOLD — the vault fails
    /// closed rather than trading or reporting NAV on bad data.
    function _valueOf(address token, uint256 rawAmount) internal view returns (uint256) {
        if (rawAmount == 0) return 0;
        uint256 price = _normalizedPrice(token);
        return (rawAmount * price) / (10 ** tokenDecimals[token]);
    }

    function _valueToRaw(address token, uint256 valueUsd) internal view returns (uint256) {
        if (valueUsd == 0) return 0;
        uint256 price = _normalizedPrice(token);
        return (valueUsd * (10 ** tokenDecimals[token])) / price;
    }

    /// @dev Chainlink price scaled to 1e18, regardless of the feed's own decimals.
    function _normalizedPrice(address token) internal view returns (uint256) {
        PriceFeed memory feed = priceFeeds[token];
        require(feed.aggregator != address(0), "AgentVault: no price feed");
        (, int256 answer,, uint256 updatedAt,) =
            AggregatorV3Interface(feed.aggregator).latestRoundData();
        require(answer > 0, "AgentVault: bad price");
        require(block.timestamp - updatedAt <= STALENESS_THRESHOLD, "AgentVault: stale price");
        return uint256(answer) * (10 ** (18 - feed.priceDecimals));
    }

    function _minAcceptableOut(address tokenIn, address tokenOut, uint256 amountIn)
        internal
        view
        returns (uint256)
    {
        uint256 valueUsd = _valueOf(tokenIn, amountIn);
        uint256 fairOut = _valueToRaw(tokenOut, valueUsd);
        return (fairOut * (BPS_DENOMINATOR - maxSlippageBps)) / BPS_DENOMINATOR;
    }

    function _nav() internal view returns (uint256 total) {
        uint256 len = allowedTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token = allowedTokens[i];
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal == 0) continue;
            total += _valueOf(token, bal);
        }
    }

    function _checkAndRecordDailyNotional(uint256 notionalUsd) internal {
        uint256 windowStart =
            block.timestamp > NOTIONAL_WINDOW ? block.timestamp - NOTIONAL_WINDOW : 0;
        uint256 head = tradeHistoryHead;
        uint256 len = tradeHistory.length;

        while (head < len && tradeHistory[head].timestamp < windowStart) {
            delete tradeHistory[head];
            head++;
        }

        uint256 sum = notionalUsd;
        for (uint256 i = head; i < len; i++) {
            sum += tradeHistory[i].notionalUsd;
        }
        require(sum <= maxDailyNotional, "AgentVault: exceeds daily notional cap");

        tradeHistoryHead = head;
        tradeHistory.push(
            TradeRecord({ timestamp: uint64(block.timestamp), notionalUsd: uint192(notionalUsd) })
        );
    }

    function _bubbleRevert(bytes memory returndata) internal pure {
        if (returndata.length > 0) {
            assembly {
                revert(add(returndata, 32), mload(returndata))
            }
        }
        revert("AgentVault: swap call failed");
    }
}
