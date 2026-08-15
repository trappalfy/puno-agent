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

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Ceiling on any single feed's configured staleness window. Feeds
    /// differ by more than an order of magnitude — on Robinhood Chain the
    /// equity feeds refresh every few minutes on deviation while USDG/USD only
    /// moves on its 24h heartbeat — so the window is per-feed (see
    /// PriceFeed.maxStaleness), not one constant. This cap exists so that
    /// "configurable" can't become "effectively disabled": two days is roughly
    /// double the longest documented heartbeat on this chain.
    uint256 public constant MAX_STALENESS_LIMIT = 2 days;

    uint256 public constant NOTIONAL_WINDOW = 1 days;

    // ---------------------------------------------------------------------
    // Identity / access
    // ---------------------------------------------------------------------

    address public immutable owner;

    /// @notice The unit the vault denominates trades in (e.g. USDG), and the
    /// token every swap must have on one side. Fixed at construction rather
    /// than settable: the owner changing it mid-life would re-denominate the
    /// position history and the rolling notional window against a different
    /// asset, silently invalidating the caps already recorded in them.
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
        /// @dev How old this specific feed's answer may be before it is refused,
        /// in seconds. Must be set to the feed's own heartbeat plus a margin: a
        /// single global threshold either rejects a healthy stablecoin feed that
        /// legitimately only updates daily, or accepts an equity feed that has
        /// been dead for hours. Packs into the same slot as the two fields above.
        uint32 maxStaleness;
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
    event PriceFeedSet(address indexed token, address indexed aggregator, uint32 maxStaleness);
    event VaultPaused();
    event VaultUnpaused();

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

    /// @param maxStaleness Seconds this feed's answer stays usable. Set it from
    /// the feed's published heartbeat plus a margin — too low and every trade
    /// reverts between heartbeats, too high and the vault trades on a dead feed.
    function setPriceFeed(address token, address aggregator, uint32 maxStaleness)
        external
        onlyOwner
    {
        require(aggregator != address(0), "AgentVault: zero aggregator");
        require(maxStaleness > 0, "AgentVault: zero staleness window");
        require(maxStaleness <= MAX_STALENESS_LIMIT, "AgentVault: staleness window too long");
        uint8 priceDecimals = AggregatorV3Interface(aggregator).decimals();
        // `_normalizedPrice` scales by 10 ** (18 - priceDecimals). Above 18 that
        // subtraction underflows and panics, which would not fail this call —
        // it would brick the token permanently, reverting every price read and
        // `nav()` with an arithmetic panic and no message. Caught here because
        // configuration time is the only moment anyone can still fix it.
        require(priceDecimals <= 18, "AgentVault: price decimals too high");
        priceFeeds[token] = PriceFeed({
            aggregator: aggregator, priceDecimals: priceDecimals, maxStaleness: maxStaleness
        });
        emit PriceFeedSet(token, aggregator, maxStaleness);
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

    // Removed 2026-08-16: a high-water-mark performance fee (`setFeeConfig`,
    // `collectFee`, MAX_FEE_BPS, feeRecipient, feeBps, highWaterMark,
    // highWaterMarkInitialized, and two events).
    //
    // It was never active — feeBps was 0 in every deployment and nothing set it
    // — and it could not have served the product's billing either, since
    // `setFeeConfig` is onlyOwner and the owner is the user, so it could only
    // ever pay a fee the user configured for themselves. Puno charges per
    // action in PUNO, through PunoCredits, which never touches this contract.
    //
    // It was not free to keep. `collectFee` transferred the quote token out,
    // making it a second path by which value left a vault, and "withdraw is the
    // only way out, and it is owner-only" is the single claim this contract
    // most needs to be able to state without a caveat. It also carried a known
    // accounting gap: a deposit made after the high-water mark was initialised
    // read as appreciation and would have been charged as profit.
    //
    // The original rationale — ship it dormant so no migration is needed if it
    // is ever switched on — does not survive the business model it was written
    // before. If a profit fee ever returns it will be a deliberate decision with
    // its own design, and vault code is immutable anyway, so existing vaults
    // could never have been switched on in place.

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function nav() external view returns (uint256) {
        return _nav();
    }

    /// @notice The oracle-derived floor `executeTrade` will require `minOut` to
    /// clear, for a hypothetical trade.
    ///
    /// Exposed because the off-chain risk engine reimplements this formula to
    /// veto a trade before it costs an RPC round-trip, and a reimplementation
    /// that drifts from the contract is a silent source of trades that pass
    /// locally and revert on chain. Callers that can afford the call should ask
    /// rather than approximate.
    function minAcceptableOut(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256)
    {
        return _minAcceptableOut(tokenIn, tokenOut, amountIn);
    }

    /// @notice USD value (1e18) of `rawAmount` of `token` at its configured feed.
    function valueOf(address token, uint256 rawAmount) external view returns (uint256) {
        return _valueOf(token, rawAmount);
    }

    /// @notice Inverse of `valueOf` — raw token amount for a 1e18 USD value.
    function valueToRaw(address token, uint256 valueUsd) external view returns (uint256) {
        return _valueToRaw(token, valueUsd);
    }

    /// @notice Notional already used inside the rolling 24h window.
    ///
    /// The one policy limit the off-chain engine structurally cannot mirror —
    /// the history lives in a private array with no getter, which is why
    /// `risk.ts` defers this single check to the pre-trade simulation. With
    /// this, a caller can see how much room is left instead of discovering it
    /// by reverting.
    function recentNotionalUsd() external view returns (uint256 sum) {
        uint256 windowStart =
            block.timestamp > NOTIONAL_WINDOW ? block.timestamp - NOTIONAL_WINDOW : 0;
        uint256 len = tradeHistory.length;
        for (uint256 i = tradeHistoryHead; i < len; i++) {
            if (tradeHistory[i].timestamp < windowStart) continue;
            sum += tradeHistory[i].notionalUsd;
        }
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
    /// configured Chainlink feed. Reverts on missing feed, non-positive price,
    /// or a price older than that feed's own maxStaleness — the vault fails
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
        require(block.timestamp - updatedAt <= feed.maxStaleness, "AgentVault: stale price");
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

        // Checked, not silent. `notionalUsd` is bounded only by
        // `maxNotionalPerTrade`, which the owner sets as a uint256, so an
        // unchecked downcast would truncate a large notional into a small
        // recorded one and let the rolling daily cap be walked straight past by
        // trades that each look tiny in the history. The threshold is absurd —
        // uint192 is about 6.3e39 USD at 1e18 scale — but "unreachable" and
        // "unchecked" are different claims, and only one of them is enforced.
        require(notionalUsd <= type(uint192).max, "AgentVault: notional too large to record");

        tradeHistoryHead = head;
        // Both casts below are checked, not assumed: the require above rejects
        // anything above type(uint192).max, and uint64(block.timestamp) holds
        // until the year 584942417355. The directive has to sit on the line
        // immediately above the cast itself — with prose in between it silences
        // nothing, which is worse than no directive at all because it reads as
        // if the warning had been dealt with.
        tradeHistory.push(
            // forge-lint: disable-next-line(unsafe-typecast)
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
