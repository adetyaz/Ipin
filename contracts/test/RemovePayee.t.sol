// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice removePayee.
contract VaultRemovePayeeTest is IpinTest {
    function test_I5_removePayeeRevokesApproval() public {
        uint256 potId = _readyPot();
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.PayeeRemoved(potId, _payee);
        vm.prank(_sender);
        _vault.removePayee(potId, _payee);
        assertFalse(_vault.isPayee(potId, _payee));
    }

    function test_I5_revertsWhenRemovingUnknownPayee() public {
        uint256 potId = _fundedPot(_CAP, 1e18);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.PayeeNotApproved.selector, potId, _payee));
        vm.prank(_sender);
        _vault.removePayee(potId, _payee);
    }
}
