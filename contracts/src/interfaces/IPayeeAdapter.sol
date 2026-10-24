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
    /// @notice Deliver `_amount` of `_token` to `_to`, or revert.
    /// @param _token Token the vault sent (MUSD).
    /// @param _to Recipient as the adapter understands it (approved payee).
    /// @param _amount Token base units.
    function pay(IERC20 _token, address _to, uint256 _amount) external;
}
