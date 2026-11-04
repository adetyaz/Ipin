// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title StubBtcOracle
/// @notice Stand-in for Mezo's BTC/USD oracle precompile
///         (0x7b7c...0015), which only a real Mezo node can execute. Answers
///         the same Chainlink-style calls Mezo's `PriceFeed` makes. Used only
///         by the local rehearsal script; never deployed.
contract StubBtcOracle {
    /// @notice Price in 18 decimals, written by the rehearsal.
    int256 public price;

    /// @notice Set the BTC price (18 decimals).
    /// @param _price The price.
    function setPrice(int256 _price) external {
        price = _price;
    }

    /// @notice Chainlink round data with a fresh timestamp.
    /// @return roundId Unused (0).
    /// @return answer The price.
    /// @return startedAt Unused (0).
    /// @return updatedAt Now, so PriceFeed's staleness check passes.
    /// @return answeredInRound Unused (0).
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (0, price, 0, block.timestamp, 0);
    }

    /// @notice Chainlink decimals.
    /// @return Always 18.
    function decimals() external pure returns (uint8) {
        return 18;
    }
}
