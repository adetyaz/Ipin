// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IPots} from "../src/interfaces/IPots.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice setCap (R7).
contract VaultSetCapTest is IpinTest {
    function test_R7_ownerSetsCap() public {
        uint256 potId = _fundedPot(_CAP, 1e18);
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.CapSet(potId, 5e18);
        vm.prank(_sender);
        _vault.setCap(potId, 5e18);
        assertEq(_vault.getPot(potId).cap, 5e18);

        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, potId, _requester));
        vm.prank(_requester);
        _vault.setCap(potId, 1e30);
    }
}
