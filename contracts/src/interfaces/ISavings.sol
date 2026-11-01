// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ISavings
/// @notice R10: idle pot money in Mezo's MUSD savings vault (sMUSD). Saved
///         money stays credited to its pot and comes back to the same pot.
///         Yield is credited to pots in proportion to what each has saved.
interface ISavings {
    // --- Events ---

    /// @notice `amount` moved from a pot's spendable balance into sMUSD.
    event SavingsDeposited(uint256 indexed potId, uint256 amount);
    /// @notice `amount` moved from sMUSD back to the same pot.
    event SavingsWithdrawn(uint256 indexed potId, uint256 amount);
    /// @notice Yield received from the savings vault, now owed to saving pots.
    event YieldHarvested(uint256 amount);
    /// @notice A pot's share of harvested yield, added to its balance.
    event YieldCredited(uint256 indexed potId, uint256 amount);

    // --- Errors ---

    error SavingsDisabled();
    error InsufficientBalance(uint256 potId, uint256 balance, uint256 required);
    error InsufficientSaved(uint256 potId, uint256 saved, uint256 required);
    error SavingsShortfall(uint256 expected, uint256 received);

    // --- Sender actions ---

    /// @notice Move `_amount` of a pot's spendable balance into sMUSD (owner only).
    /// @param _potId Pot id.
    /// @param _amount MUSD base units, at most the pot's balance.
    function moveToSavings(uint256 _potId, uint256 _amount) external;

    /// @notice Move `_amount` of a pot's savings back to its balance (owner only).
    /// @param _potId Pot id.
    /// @param _amount MUSD base units, at most what the pot has saved.
    function withdrawFromSavings(uint256 _potId, uint256 _amount) external;

    /// @notice Claim yield from the savings vault and owe it to saving pots.
    ///         Anyone may call it; it only ever adds to pots.
    function harvestYield() external;

    // --- Views ---

    /// @notice Mezo's savings vault, or address(0) when savings is disabled.
    /// @return The MUSDSavingsRate address.
    function savingsRate() external view returns (address);

    /// @notice MUSD a pot has in savings (principal).
    /// @param _potId Pot id.
    /// @return MUSD base units.
    function savedOf(uint256 _potId) external view returns (uint256);

    /// @notice Harvested yield owed to a pot and not yet added to its balance.
    /// @param _potId Pot id.
    /// @return MUSD base units.
    function pendingYield(uint256 _potId) external view returns (uint256);

    /// @notice Sum of every pot's savings.
    /// @return MUSD base units.
    function totalSaved() external view returns (uint256);

    /// @notice All yield ever received from the savings vault.
    /// @return MUSD base units.
    function totalYieldHarvested() external view returns (uint256);

    /// @notice All yield ever added to pot balances.
    /// @return MUSD base units.
    function totalYieldCredited() external view returns (uint256);
}
