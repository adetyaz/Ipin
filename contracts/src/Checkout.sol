// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PolicyEngine} from "./PolicyEngine.sol";
import {IBorrowerOperationsSignatures} from "./interfaces/IBorrowerOperationsSignatures.sol";
import {ICheckout} from "./interfaces/ICheckout.sol";
import {PaymentRequest} from "./libraries/PaymentRequests.sol";

/// @title Checkout
/// @notice R13: pay at checkout by borrowing MUSD against BTC instead of
///         selling it. Mezo mints the loan to the Vault, the Vault credits it to
///         the pot, and the same transaction settles the payment through the
///         policy engine. If any check fails, nothing is borrowed or paid.
/// @dev ADR-020. The borrower is always the pot's owner (Mezo verifies their
///      signature for that address). The external call comes first because
///      the credit must match MUSD that actually arrived; the entry is
///      `nonReentrant` and the payment then runs the full {_settle} checks.
///      Admin powers: none; the borrower-operations address is immutable.
abstract contract Checkout is ICheckout, PolicyEngine {
    /// @inheritdoc ICheckout
    address public immutable borrowerOperations;

    /// @param _borrowerOperations Mezo's BorrowerOperationsSignatures, or
    ///        address(0) to disable borrow-to-pay.
    // forge-lint: disable-next-line(missing-zero-check) address(0) disables borrow-to-pay.
    constructor(address _borrowerOperations) {
        borrowerOperations = _borrowerOperations;
    }

    /// @notice Accept Mezo's zero-value BTC call that ends every borrow
    ///         (`ActivePool.sendCollateral(recipient, 0)`, which reverts
    ///         "Sending BTC failed" if the recipient refuses it). Any real BTC
    ///         is refused, since nothing could ever move it out again.
    receive() external payable {
        if (msg.value != 0) revert NativeBtcNotAccepted();
    }

    /// @inheritdoc ICheckout
    function borrowAndPay(Borrow calldata _loan, PaymentRequest calldata _request, bytes calldata _signature)
        external
        nonReentrant
    {
        if (borrowerOperations == address(0)) revert BorrowingDisabled();
        uint256 expected = _request.amount + fee;
        if (_loan.amount != expected) revert BorrowAmountMismatch(expected, _loan.amount);
        _borrowInto(_request.potId, _loan);
        _settle(_request, _signature);
    }

    /// @dev Mint the loan to this Vault on the pot owner's trove and credit
    ///      the pot with exactly what arrived.
    function _borrowInto(uint256 _potId, Borrow calldata _loan) internal {
        address owner = _pots[_potId].owner;
        if (owner == address(0)) revert PotNotFound(_potId);
        uint256 before = musd.balanceOf(address(this));
        // Credit only MUSD that arrived, so the mint comes first; nonReentrant.
        // forge-lint: disable-start(reentrancy-no-eth)
        IBorrowerOperationsSignatures(borrowerOperations)
            .withdrawMUSDWithSignature(
                _loan.amount, _loan.upperHint, _loan.lowerHint, owner, address(this), _loan.signature, _loan.deadline
            );
        // forge-lint: disable-end(reentrancy-no-eth)
        uint256 received = musd.balanceOf(address(this)) - before;
        if (received < _loan.amount) revert BorrowShortfall(_loan.amount, received);

        _pots[_potId].balance += _loan.amount;
        totalPotBalance += _loan.amount;
        // forge-lint: disable-next-line(reentrancy-events) after the mint by design; nonReentrant.
        emit Borrowed(_potId, owner, _loan.amount);
    }
}
