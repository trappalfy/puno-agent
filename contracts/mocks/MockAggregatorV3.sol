// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "../src/interfaces/AggregatorV3Interface.sol";

/// @notice Controllable Chainlink feed for tests and testnet — real feeds
/// exist per-ticker on mainnet, but testnet coverage isn't guaranteed.
contract MockAggregatorV3 is AggregatorV3Interface {
    uint8 private immutable _decimals;
    string private _description;

    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _roundId;

    constructor(uint8 decimals_, string memory description_, int256 initialAnswer) {
        _decimals = decimals_;
        _description = description_;
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
        _roundId = 1;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external pure override returns (uint256) {
        return 4;
    }

    /// @notice Sets the price and marks it fresh as of now.
    function setAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _updatedAt = block.timestamp;
        _roundId += 1;
    }

    /// @notice Lets tests simulate a stale or malformed feed directly.
    function setRoundData(int256 newAnswer, uint256 updatedAt_) external {
        _answer = newAnswer;
        _updatedAt = updatedAt_;
        _roundId += 1;
    }

    function getRoundData(
        uint80 requestedRoundId
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (requestedRoundId, _answer, _updatedAt, _updatedAt, requestedRoundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }
}
