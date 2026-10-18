// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Everything a policy may look at when judging one outgoing payment. Built by the
///         PolicyEngine from vault state; policies never read or write money themselves (S15).
/// @param potId Pot the money leaves from.
/// @param potOwner The pot's sender.
/// @param payeeApproved Whether `payee` is approved for `potId` right now (I5).
/// @param scheduled True for a schedule execution (R9), false for a signed request (R8).
/// @param payee Destination of `amount`.
/// @param amount MUSD base units to the payee (fee excluded, R7 note).
/// @param fee Flat relayer fee charged on top (R4).
/// @param potBalance Spendable balance of the pot before this payment.
/// @param cap Spending cap of the pot per period (R7).
/// @param spentInPeriod Amount already spent from the pot in the current period (R7, I3).
/// @param period Current period index: (block.timestamp - pot.createdAt) / PERIOD.
struct PaymentContext {
    uint256 potId;
    address potOwner;
    bool payeeApproved;
    bool scheduled;
    address payee;
    uint256 amount;
    uint256 fee;
    uint256 potBalance;
    uint256 cap;
    uint256 spentInPeriod;
    uint256 period;
}

/// @title IPolicy
/// @notice One spending rule. A policy is a pure check: it reverts with its own custom error when
///         the payment is not allowed and returns otherwise. It never moves money (S15) and is
///         called with STATICCALL by the PolicyEngine.
interface IPolicy {
    /// @notice Reverts if the payment described by `ctx` breaks this policy.
    /// @param ctx The payment under review.
    function check(PaymentContext calldata ctx) external view;
}
