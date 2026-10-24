// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IPots} from "../src/interfaces/IPots.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice addPayee: the pot's allowlist (I5).
contract VaultAddPayeeTest is IpinTest {
    uint256 internal _potId;

    function setUp() public override {
        super.setUp();
        _potId = _fundedPot(_CAP, 100e18);
    }

    // --- Expected Reverts ---

    function test_I5_onlyOwnerAddsPayee() public {
        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, _potId, _requester));
        vm.prank(_requester);
        _vault.addPayee(_potId, _payee);
    }

    function test_I5_payeeCannotBeRequester() public {
        vm.startPrank(_sender);
        _vault.addRequester(_potId, _requester);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.AddressIsRequester.selector, _potId, _requester));
        _vault.addPayee(_potId, _requester);
        vm.stopPrank();
    }

    function test_I5_revertsWhenPayeeAlreadyApproved() public {
        vm.startPrank(_sender);
        _vault.addPayee(_potId, _payee);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.PayeeAlreadyApproved.selector, _potId, _payee));
        _vault.addPayee(_potId, _payee);
        vm.stopPrank();
    }

    function test_I5_rejectsZeroOrVaultPayee() public {
        vm.startPrank(_sender);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidPayee.selector, address(0)));
        _vault.addPayee(_potId, address(0));
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidPayee.selector, address(_vault)));
        _vault.addPayee(_potId, address(_vault));
        vm.stopPrank();
    }

    // --- Emitted Events ---

    function test_I5_emitsPayeeAdded() public {
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.PayeeAdded(_potId, _payee);
        vm.prank(_sender);
        _vault.addPayee(_potId, _payee);
        assertTrue(_vault.isPayee(_potId, _payee));
    }
}
