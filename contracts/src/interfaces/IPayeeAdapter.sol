// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IPayeeAdapter
/// @notice One payee type (S16): direct MUSD addresses, the airtime adapter, and later the savings
///         vault and bank payouts. Adapters never custody pot money: the vault transfers MUSD
///         straight to the approved payee, and only after the payout is final.
/// @dev A synchronous adapter's payouts are final at settlement. An asynchronous adapter's payouts
///      sit in pending (R5) until the adapter calls `confirmPayout` or `failPayout` on the vault,
///      or until the timeout refund (R6). An async adapter may also report a late reversal of a
///      confirmed payout via `reversePayout`, returning the funds itself (R6, ADR-007).
interface IPayeeAdapter {
    /// @notice Called by the vault after a payout is recorded (pending or final).
    /// @dev For an async adapter this is the signal to start the off-chain delivery.
    /// @param payoutId Vault payout id.
    /// @param potId Pot the payout came from.
    /// @param payee Approved payee.
    /// @param amount MUSD base units owed to the payee.
    function onPayout(uint256 payoutId, uint256 potId, address payee, uint256 amount) external;

    /// @notice Whether payouts through this adapter wait for confirmation (R5).
    /// @dev Read once, when the sender approves a payee with this adapter, and stored by the vault.
    /// @return True for asynchronous (pending) payouts.
    function isAsync() external view returns (bool);
}
