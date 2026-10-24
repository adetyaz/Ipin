// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";
import {MockERC1271Wallet} from "./mocks/MockERC1271Wallet.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice invalidateNonce: the sender revokes a signed request before it
///         settles or expires (R3, security review M-01).
contract VaultInvalidateNonceTest is IpinTest {
    uint256 internal _potId;

    function setUp() public override {
        super.setUp();
        _potId = _readyPot();
    }

    // --- Expected Reverts ---

    function test_R3_rejectsRevokedRequest() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        bytes memory sig = _sign(req, _senderKey);

        vm.prank(_sender);
        _vault.invalidateNonce(req.nonce);

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.NonceAlreadyUsed.selector, _sender, req.nonce));
        _vault.execute(req, sig);
        assertEq(_musd.balanceOf(_payee), 0);
        assertEq(_vault.potBalance(_potId), 500e18);
    }

    function test_R3_revertsWhenInvalidatingUsedNonce() public {
        PaymentRequest memory req = _request(_potId, 5e18);
        _execute(req);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.NonceAlreadyUsed.selector, _sender, req.nonce));
        vm.prank(_sender);
        _vault.invalidateNonce(req.nonce);
    }

    // --- Emitted Events ---

    function test_R3_emitsNonceInvalidated() public {
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.NonceInvalidated(_sender, 42);
        vm.prank(_sender);
        _vault.invalidateNonce(42);
    }

    // --- System State Changes ---

    function test_R3_invalidateOnlyTouchesCallerNamespace() public {
        // Anyone may call it, but only for their own nonces: an attacker
        // cannot cancel the sender's request.
        PaymentRequest memory req = _request(_potId, 5e18);
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        _vault.invalidateNonce(req.nonce);
        assertTrue(_vault.nonceUsed(attacker, req.nonce));
        assertFalse(_vault.nonceUsed(_sender, req.nonce));

        _execute(req);
        assertEq(_musd.balanceOf(_payee), 5e18);
    }

    function test_R3_revokedRequestStaysDeadAfterPayeeReAdded() public {
        // removePayee alone is not a revocation: re-adding the payee revives
        // every unexpired signed request to it. invalidateNonce is.
        PaymentRequest memory stale = _request(_potId, 5e18);
        bytes memory staleSig = _sign(stale, _senderKey);
        PaymentRequest memory revoked = _request(_potId, 7e18);
        bytes memory revokedSig = _sign(revoked, _senderKey);

        vm.startPrank(_sender);
        _vault.removePayee(_potId, _payee);
        _vault.invalidateNonce(revoked.nonce);
        _vault.addPayee(_potId, _payee);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.NonceAlreadyUsed.selector, _sender, revoked.nonce));
        _vault.execute(revoked, revokedSig);

        _vault.execute(stale, staleSig); // not revoked, so it settles again
        assertEq(_musd.balanceOf(_payee), 5e18);
    }

    function test_R3_erc1271SenderInvalidatesNonce() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("passport-owner");
        MockERC1271Wallet wallet = new MockERC1271Wallet(owner);
        vm.startPrank(address(wallet));
        uint256 potId = _vault.createPot("Upkeep", _CAP);
        _vault.addPayee(potId, _payee);
        vm.stopPrank();

        PaymentRequest memory req = _request(potId, 5e18);
        bytes memory sig = _sign(req, ownerKey);
        vm.prank(address(wallet));
        _vault.invalidateNonce(req.nonce);

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.NonceAlreadyUsed.selector, address(wallet), req.nonce));
        _vault.execute(req, sig);
    }
}
