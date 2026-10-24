// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vault} from "../src/Vault.sol";
import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {MockMUSD} from "./mocks/MockMUSD.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice claimFees (R4).
contract VaultClaimFeesTest is IpinTest {
    function test_R4_claimFeesPaysRelayer() public {
        uint256 potId = _readyPot();
        _execute(_request(potId, 5e18));
        _execute(_request(potId, 5e18));

        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.FeesWithdrawn(_relayer, 2 * _FEE);
        _vault.claimFees();
        assertEq(_musd.balanceOf(_relayer), 2 * _FEE);
        assertEq(_vault.unclaimedFees(), 0);
        assertTrue(_vault.booksBalance());

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.NoFeesToWithdraw.selector));
        _vault.claimFees();
    }

    function test_R4_blockedRelayerOnlyFreezesFees() public {
        // relayerAddress is immutable (ADR-016). If transfers to it fail, the
        // fees stay in the vault as a liability; pot payments keep working.
        uint256 potId = _readyPot();
        _execute(_request(potId, 5e18));
        _musd.setBlocked(_relayer, true);
        vm.expectRevert(abi.encodeWithSelector(MockMUSD.RecipientBlocked.selector, _relayer));
        _vault.claimFees();

        _execute(_request(potId, 5e18));
        assertEq(_vault.unclaimedFees(), 2 * _FEE);
        assertTrue(_vault.booksBalance());
    }

    function test_R4_constructorBoundsFee() public {
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.FeeOutOfRange.selector, 0));
        new Vault(_musd, _relayer, 0);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.FeeOutOfRange.selector, 1e18 + 1));
        new Vault(_musd, _relayer, 1e18 + 1);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.ZeroAddress.selector));
        new Vault(_musd, address(0), _FEE);
    }
}
