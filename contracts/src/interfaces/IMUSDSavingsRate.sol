// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IMUSDSavingsRate
/// @notice The parts of Mezo's MUSD savings vault (`MUSDSavingsRate`, sMUSD)
///         the Vault uses. Verified source: docs/research/mezo.md section 1.
///         Not ERC-4626: shares are 1:1 with principal, and yield is paid
///         separately in MUSD by `claimYield()` (or inside `withdraw()`).
interface IMUSDSavingsRate {
    /// @notice Pull `amount` MUSD from the caller and mint `amount` sMUSD to it.
    /// @param amount MUSD base units.
    function deposit(uint256 amount) external;

    /// @notice Burn `amount` sMUSD and return `amount` MUSD, plus any yield the
    ///         caller had accrued.
    /// @param amount sMUSD base units.
    function withdraw(uint256 amount) external;

    /// @notice Pay the caller's accrued yield in MUSD.
    /// @return The MUSD paid.
    function claimYield() external returns (uint256);

    /// @notice sMUSD held by `account` (equal to its MUSD principal).
    /// @param account Holder.
    /// @return sMUSD base units.
    function balanceOf(address account) external view returns (uint256);
}
