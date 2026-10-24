// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IPots} from "../src/interfaces/IPots.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice addRequester / removeRequester.
contract VaultAddRequesterTest is IpinTest {
    uint256 internal _potId;

    function setUp() public override {
        super.setUp();
        _potId = _fundedPot(_CAP, 100e18);
    }

    // --- Expected Reverts ---

    function test_I5_requesterCannotBePayee() public {
        vm.startPrank(_sender);
        _vault.addPayee(_potId, _payee);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.AddressIsPayee.selector, _potId, _payee));
        _vault.addRequester(_potId, _payee);
        vm.stopPrank();
    }

    function test_I5_onlyOwnerAddsRequester() public {
        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, _potId, _requester));
        vm.prank(_requester);
        _vault.addRequester(_potId, _requester);
    }

    function test_I5_revertsWhenRequesterAlreadyRegistered() public {
        vm.startPrank(_sender);
        _vault.addRequester(_potId, _requester);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.RequesterAlreadyRegistered.selector, _potId, _requester));
        _vault.addRequester(_potId, _requester);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.ZeroAddress.selector));
        _vault.addRequester(_potId, address(0));
        vm.stopPrank();
    }

    // --- Emitted Events ---

    function test_I5_emitsRequesterAddedAndRemoved() public {
        vm.startPrank(_sender);
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.RequesterAdded(_potId, _requester);
        _vault.addRequester(_potId, _requester);
        assertTrue(_vault.isRequester(_potId, _requester));

        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.RequesterRemoved(_potId, _requester);
        _vault.removeRequester(_potId, _requester);
        assertFalse(_vault.isRequester(_potId, _requester));

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.RequesterNotRegistered.selector, _potId, _requester));
        _vault.removeRequester(_potId, _requester);
        vm.stopPrank();
    }
}
