// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PaymentRequest} from "../libraries/PaymentRequests.sol";

/// @title ICheckout
/// @notice R13 borrow-to-pay: borrow MUSD against the pot owner's BTC trove
///         (Mezo's BorrowerOperationsSignatures), credit it to the pot and pay
///         an approved payee in one transaction. All or nothing.
interface ICheckout {
    /// @notice The pot owner's signed instruction to Mezo: mint `amount` MUSD
    ///         to the Vault as new trove debt.
    struct Borrow {
        uint256 amount;
        address upperHint;
        address lowerHint;
        uint256 deadline;
        bytes signature;
    }

    /// @notice `amount` borrowed on `borrower`'s trove and credited to the pot.
    event Borrowed(uint256 indexed potId, address indexed borrower, uint256 amount);

    error BorrowingDisabled();
    error BorrowAmountMismatch(uint256 expected, uint256 got);
    error BorrowShortfall(uint256 expected, uint256 received);

    /// @notice Borrow exactly `_request.amount + fee` against the pot owner's
    ///         trove and settle `_request` (sender-signed, as {execute}).
    ///         Anyone may submit; both signatures come from the pot owner.
    /// @param _loan The owner's signed borrow instruction (recipient: this Vault).
    /// @param _request The payment the owner approved.
    /// @param _signature The owner's EIP-712 signature over `_request`.
    function borrowAndPay(Borrow calldata _loan, PaymentRequest calldata _request, bytes calldata _signature) external;

    /// @notice Mezo's BorrowerOperationsSignatures, or address(0) when disabled.
    /// @return The address.
    function borrowerOperations() external view returns (address);
}
