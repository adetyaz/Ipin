// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IPayeeAdapter
/// @notice A payee that is not a plain MUSD address (e.g. the airtime adapter). Synchronous: the
///         payout is final when `pay` returns.
/// @dev Called by the vault only after the PolicyEngine approved the payment, with `amount` of
///      `token` already sent to the adapter. If delivery fails, `pay` reverts and the whole
///      settlement reverts with it, so the pot is never debited for an undelivered payment.
interface IPayeeAdapter {
    /// @notice Deliver `amount` of `token` to `to`, or revert.
    /// @param token Token the vault sent (MUSD).
    /// @param to Recipient as the adapter understands it (approved payee).
    /// @param amount Token base units.
    function pay(IERC20 token, address to, uint256 amount) external;
}
