// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vault} from "../src/Vault.sol";
import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IPots} from "../src/interfaces/IPots.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";
import {MockERC1271Wallet} from "./mocks/MockERC1271Wallet.sol";
import {MockMUSD} from "./mocks/MockMUSD.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice execute: the signed-request payment path (R3, R4, R6, R7, R8, I5).
contract VaultExecuteTest is IpinTest {
    uint256 private constant _SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    uint256 internal _potId;

    function setUp() public override {
        super.setUp();
        _potId = _readyPot();
    }

    // --- Expected Reverts ---

    function test_R3_rejectsReplayedNonce() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);
        _vault.execute(req, sig);

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.NonceAlreadyUsed.selector, _sender, req.nonce));
        _vault.execute(req, sig);
    }

    function test_R3_rejectsExpiredRequest() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);
        vm.warp(req.expiry + 1);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.RequestExpired.selector, req.expiry, req.expiry + 1));
        _vault.execute(req, sig);
    }

    function test_R3_acceptsAtExactExpiry() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);
        vm.warp(req.expiry);
        _vault.execute(req, sig);
        assertEq(_musd.balanceOf(_payee), 5e18);
    }

    function test_R3_revertedCallDoesNotConsumeNonce() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);
        vm.prank(_sender);
        _vault.setCap(_potId, 1e18);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.CapExceeded.selector, _potId, 0, 5e18, 1e18));
        _vault.execute(req, sig);
        assertFalse(_vault.nonceUsed(_sender, req.nonce));

        vm.prank(_sender);
        _vault.setCap(_potId, _CAP);
        _vault.execute(req, sig);
        assertTrue(_vault.nonceUsed(_sender, req.nonce));
    }

    function test_R4_rejectsWhenPotCannotCoverAmountPlusFee() public {
        PaymentRequest memory req = _request(_potId, 500e18); // pot holds exactly 500
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(
            abi.encodeWithSelector(IPolicyEngine.InsufficientPotBalance.selector, _potId, 500e18, 500e18 + _FEE)
        );
        _vault.execute(req, sig);
    }

    function test_R7_rejectsSpendAboveCap() public {
        vm.prank(_sender);
        _vault.setCap(_potId, 10e18);
        _execute(_request(_potId, 6e18));
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.CapExceeded.selector, _potId, 6e18, 5e18, 10e18));
        _vault.execute(req, sig);
    }

    function test_R8_rejectsNonSenderSignature() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _requesterKey);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidSignature.selector, _potId, _sender));
        _vault.execute(req, sig);
    }

    function test_R8_rejectsWrongDomain() public {
        Vault other = new Vault(_musd, _relayer, _FEE);
        PaymentRequest memory req = _request(_potId, 5e18);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_senderKey, other.hashPaymentRequest(req));
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidSignature.selector, _potId, _sender));
        _vault.execute(req, abi.encodePacked(r, s, v));

        // Same contract, other chain id: the domain separator changes.
        bytes memory sig = _sign(req, _senderKey);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidSignature.selector, _potId, _sender));
        _vault.execute(req, sig);
    }

    function test_R8_rejectsMalleableSignature() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_senderKey, _vault.hashPaymentRequest(req));
        bytes32 highS = bytes32(_SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidSignature.selector, _potId, _sender));
        _vault.execute(req, abi.encodePacked(r, highS, flippedV));
    }

    function test_I5_rejectsUnapprovedPayee() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        req.payee = makeAddr("stranger");
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.PayeeNotApproved.selector, _potId, req.payee));
        _vault.execute(req, sig);
    }

    function test_I5_rejectsRemovedPayee() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey); // signed while approved
        vm.prank(_sender);
        _vault.removePayee(_potId, _payee);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.PayeeNotApproved.selector, _potId, _payee));
        _vault.execute(req, sig);
    }

    function test_I5_requesterNeverPaid() public {
        // The sender signs a request to the requester's own address: still
        // refused, because a requester can never be approved as a payee.
        PaymentRequest memory req = _request(_potId, 5e18);
        req.payee = _requester;
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.PayeeNotApproved.selector, _potId, _requester));
        _vault.execute(req, sig);
    }

    function test_R4_rejectsZeroAmount() public {
        PaymentRequest memory req = _request(_potId, 0);
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(abi.encodeWithSelector(IPots.ZeroAmount.selector));
        _vault.execute(req, sig);
    }

    function test_R6_failedPayoutRevertsAtomically() public {
        // Wave 1: every payout is synchronous. A payee whose transfer fails
        // reverts the whole execute: pot, fee, cap and nonce are untouched.
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);
        _musd.setBlocked(_payee, true);
        uint256 period = _vault.currentPeriod(_potId);

        vm.expectRevert(abi.encodeWithSelector(MockMUSD.RecipientBlocked.selector, _payee));
        _vault.execute(req, sig);

        assertEq(_vault.potBalance(_potId), 500e18);
        assertEq(_vault.unclaimedFees(), 0);
        assertEq(_vault.spent(_potId, period), 0);
        assertFalse(_vault.nonceUsed(_sender, req.nonce));
        assertTrue(_vault.booksBalance());
    }

    // --- Emitted Events ---

    function test_R4_feeRecordedAsOwnEntry() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.FeeCharged(_potId, _relayer, _FEE);
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.PaymentSettled(_potId, _payee, req.nonce, 5e18, req.itemHash);
        _vault.execute(req, sig);
    }

    // --- System State Changes ---

    function test_R7_capResetsNextPeriod() public {
        vm.prank(_sender);
        _vault.setCap(_potId, 10e18);
        _execute(_request(_potId, 10e18));
        assertEq(_vault.remainingCap(_potId), 0);

        vm.warp(vm.getBlockTimestamp() + _vault.PERIOD());
        assertEq(_vault.currentPeriod(_potId), 1);
        assertEq(_vault.remainingCap(_potId), 10e18);
        _execute(_request(_potId, 10e18));
        assertEq(_vault.spent(_potId, 1), 10e18);
    }

    function test_R8_acceptsERC1271Sender() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("passport-owner");
        MockERC1271Wallet wallet = new MockERC1271Wallet(owner);
        _musd.mint(address(wallet), 100e18);
        vm.startPrank(address(wallet));
        _musd.approve(address(_vault), type(uint256).max);
        uint256 potId = _vault.createPot("Upkeep", _CAP);
        uint256[] memory pots = new uint256[](1);
        pots[0] = potId;
        uint16[] memory bps = new uint16[](1);
        bps[0] = _BPS;
        _vault.deposit(_vault.createSplit(pots, bps, potId), 100e18);
        _vault.addPayee(potId, _payee);
        vm.stopPrank();

        PaymentRequest memory req = _request(potId, 5e18);
        bytes memory sig = _sign(req, ownerKey);
        _vault.execute(req, sig);
        assertEq(_musd.balanceOf(_payee), 5e18);
    }

    function test_I1_booksBalanceAfterPayments() public {
        _execute(_request(_potId, 5e18));
        _execute(_request(_potId, 7e18));
        assertEq(_vault.totalLiabilities(), 500e18 - 12e18);
        assertEq(_vault.surplus(), 0);
        assertTrue(_vault.booksBalance());
    }

    // --- Balance changes ---

    function test_R4_chargesFlatFeeOnce() public {
        uint256 potBefore = _vault.potBalance(_potId);
        uint256 vaultBefore = _musd.balanceOf(address(_vault));
        _execute(_request(_potId, 5e18));
        assertEq(_musd.balanceOf(_payee), 5e18, "payee gets amount, fee not folded in");
        assertEq(_vault.potBalance(_potId), potBefore - 5e18 - _FEE);
        assertEq(_musd.balanceOf(address(_vault)), vaultBefore - 5e18, "fee stays in vault until claimed");
        assertEq(_vault.unclaimedFees(), _FEE);
        assertEq(_vault.spent(_potId, 0), 5e18, "cap counts amount only");
    }

    function test_R4_feeFromSamePot() public {
        uint256 other = _fundedPot(_CAP, 50e18);
        _execute(_request(_potId, 5e18));
        assertEq(_vault.potBalance(other), 50e18);
        assertEq(_vault.potBalance(_potId), 500e18 - 5e18 - _FEE);
    }

    // --- Fuzz ---

    function testFuzz_R7_spendNeverExceedsCap(uint256 _cap, uint256 _a, uint256 _b) public {
        _cap = bound(_cap, 1, 400e18);
        _a = bound(_a, 1, 1e30);
        _b = bound(_b, 1, 1e30);
        vm.prank(_sender);
        _vault.setCap(_potId, _cap);
        _tryExecute(_a);
        _tryExecute(_b);
        assertLe(_vault.spent(_potId, 0), _cap);
        assertTrue(_vault.booksBalance());
    }

    function testFuzz_R8_rejectsAnyAlteredField(uint8 _field, uint256 _delta) public {
        _delta = bound(_delta, 1, type(uint64).max);
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);
        _field = uint8(bound(_field, 0, 5));
        if (_field == 0) req.potId += _delta;
        else if (_field == 1) req.payee = address(uint160(req.payee) ^ uint160(_delta));
        else if (_field == 2) req.amount += _delta;
        else if (_field == 3) req.itemHash = bytes32(uint256(req.itemHash) ^ _delta);
        else if (_field == 4) req.nonce += _delta;
        else req.expiry += _delta;
        vm.expectRevert();
        _vault.execute(req, sig);
        assertEq(_musd.balanceOf(_payee), 0);
    }

    function _tryExecute(uint256 _amount) private returns (bool settled) {
        PaymentRequest memory req = _request(_potId, _amount);
        bytes memory sig = _sign(req, _senderKey);
        try _vault.execute(req, sig) {
            settled = true;
        } catch {
            settled = false;
        }
    }
}
