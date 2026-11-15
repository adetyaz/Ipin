// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vault} from "../src/Vault.sol";
import {ICheckout} from "../src/interfaces/ICheckout.sol";
import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";
import {MockBorrowerOperationsSignatures} from "./mocks/MockBorrowerOperationsSignatures.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice R13: borrow MUSD against the pot owner's BTC trove (Mezo's
///         BorrowerOperationsSignatures) and pay an approved payee in the
///         same transaction. All or nothing.
contract VaultCheckoutTest is IpinTest {
    uint256 internal _shop;

    function setUp() public override {
        super.setUp();
        // An empty pot: the purchase is paid entirely with borrowed MUSD.
        _shop = _createPot(_sender, 50e18);
        vm.prank(_sender);
        _vault.addPayee(_shop, _payee);
    }

    function test_R13_borrowAndPayInOneTransaction() public {
        PaymentRequest memory req = _request(_shop, 10e18);
        ICheckout.Borrow memory loan = _borrow(_senderKey, 10e18 + _FEE);

        vm.expectEmit(address(_vault));
        emit ICheckout.Borrowed(_shop, _sender, 10e18 + _FEE);
        vm.prank(_relayer);
        _vault.borrowAndPay(loan, req, _sign(req, _senderKey));

        assertEq(_musd.balanceOf(_payee), 10e18, "merchant paid");
        assertEq(_borrowerOps.debt(_sender), (10e18 + _FEE) * 1001 / 1000, "debt on the sender's trove");
        assertEq(_vault.potBalance(_shop), 0, "borrowed exactly what was spent");
        assertEq(_vault.unclaimedFees(), _FEE);
        assertTrue(_vault.booksBalance());
    }

    function test_R13_borrowsExactlyAmountPlusFee() public {
        PaymentRequest memory req = _request(_shop, 10e18);
        ICheckout.Borrow memory loan = _borrow(_senderKey, 11e18);
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(abi.encodeWithSelector(ICheckout.BorrowAmountMismatch.selector, 10e18 + _FEE, 11e18));
        vm.prank(_relayer);
        _vault.borrowAndPay(loan, req, sig);
    }

    function test_R13_failedPaymentBorrowsNothing() public {
        PaymentRequest memory req = _request(_shop, 10e18);
        req.payee = makeAddr("not-approved");
        ICheckout.Borrow memory loan = _borrow(_senderKey, 10e18 + _FEE);
        bytes memory sig = _sign(req, _senderKey);

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.PayeeNotApproved.selector, _shop, req.payee));
        vm.prank(_relayer);
        _vault.borrowAndPay(loan, req, sig);

        assertEq(_borrowerOps.debt(_sender), 0, "no debt without payment");
        assertEq(_borrowerOps.getNonce(_sender), 0, "borrow signature still unused");
    }

    function test_R13_onlyPotOwnerBorrowsIntoPot() public {
        (, uint256 strangerKey) = makeAddrAndKey("stranger");
        PaymentRequest memory req = _request(_shop, 10e18);
        ICheckout.Borrow memory loan = _borrow(strangerKey, 10e18 + _FEE);
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(MockBorrowerOperationsSignatures.InvalidSignature.selector);
        vm.prank(_relayer);
        _vault.borrowAndPay(loan, req, sig);
    }

    function test_R13_rejectsBadBorrowSignature() public {
        PaymentRequest memory req = _request(_shop, 10e18);
        ICheckout.Borrow memory loan = _borrow(_senderKey, 10e18 + _FEE);
        loan.deadline = vm.getBlockTimestamp() + 2 hours; // signed for a different deadline
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(MockBorrowerOperationsSignatures.InvalidSignature.selector);
        vm.prank(_relayer);
        _vault.borrowAndPay(loan, req, sig);
    }

    function test_R13_paymentNeedsSenderApproval() public {
        (, uint256 strangerKey) = makeAddrAndKey("stranger");
        PaymentRequest memory req = _request(_shop, 10e18);
        ICheckout.Borrow memory loan = _borrow(_senderKey, 10e18 + _FEE);
        bytes memory badSig = _sign(req, strangerKey);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidSignature.selector, _shop, _sender));
        vm.prank(_relayer);
        _vault.borrowAndPay(loan, req, badSig);
        assertEq(_borrowerOps.debt(_sender), 0);
    }

    function test_R13_capStillApplies() public {
        PaymentRequest memory req = _request(_shop, 60e18); // cap is 50
        ICheckout.Borrow memory loan = _borrow(_senderKey, 60e18 + _FEE);
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.CapExceeded.selector, _shop, 0, 60e18, 50e18));
        vm.prank(_relayer);
        _vault.borrowAndPay(loan, req, sig);
        assertEq(_borrowerOps.debt(_sender), 0);
    }

    function test_R13_disabledWithoutBorrowerOperations() public {
        Vault plain = new Vault(_musd, _relayer, _FEE, address(_savings), address(0));
        PaymentRequest memory req = _request(_shop, 1e18);
        ICheckout.Borrow memory loan = _borrow(_senderKey, 1e18 + _FEE);
        vm.expectRevert(ICheckout.BorrowingDisabled.selector);
        plain.borrowAndPay(loan, req, "");
    }

    function test_R13_acceptsMezosZeroValueCollateralCall() public {
        // During borrowAndPay, Mezo's ActivePool.sendCollateral(vault, 0) must
        // succeed: covered end to end by test_R13_borrowAndPayInOneTransaction.
        // Outside a checkout the same call is refused (M-02).
        (bool ok,) = address(_vault).call{value: 0}("");
        assertFalse(ok, "zero-value call outside a checkout is refused");
    }

    function test_R13_loanSignatureUnusableOutsideCheckout() public {
        // M-02: anyone who sees the sender's WithdrawMUSD signature (relayer,
        // mempool) submits it to Mezo directly. Without the guard Mezo would
        // mint into the Vault, owed to no pot, and the sender carries the debt.
        ICheckout.Borrow memory loan = _borrow(_senderKey, 10e18 + _FEE);
        vm.expectRevert(MockBorrowerOperationsSignatures.SendingBtcFailed.selector);
        _borrowerOps.withdrawMUSDWithSignature(
            loan.amount, address(0), address(0), _sender, address(_vault), loan.signature, loan.deadline
        );
        assertEq(_borrowerOps.debt(_sender), 0, "no debt");
        assertEq(_musd.balanceOf(address(_vault)), 0, "nothing stranded in the vault");
    }

    function test_R13_rejectsNativeBtc() public {
        vm.deal(_sender, 1 ether);
        vm.prank(_sender);
        (bool ok,) = address(_vault).call{value: 1}("");
        assertFalse(ok, "BTC sent to the vault would be stuck");
        assertEq(address(_vault).balance, 0);
    }

    // --- Helper functions ---

    /// @dev The sender's borrow signature: mint `_amount` to the vault.
    function _borrow(uint256 _key, uint256 _amount) internal view returns (ICheckout.Borrow memory loan) {
        address borrower = vm.addr(_key);
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes32 digest =
            _borrowerOps.withdrawDigest(_amount, borrower, address(_vault), _borrowerOps.getNonce(borrower), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, digest);
        loan = ICheckout.Borrow({
            amount: _amount,
            upperHint: address(0),
            lowerHint: address(0),
            deadline: deadline,
            signature: abi.encodePacked(r, s, v)
        });
    }
}
