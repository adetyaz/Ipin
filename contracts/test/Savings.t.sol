// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vault} from "../src/Vault.sol";
import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IPots} from "../src/interfaces/IPots.sol";
import {ISavings} from "../src/interfaces/ISavings.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice R10: idle pot money in Mezo's MUSD savings vault (sMUSD) stays
///         credited to its pot; withdrawals return to the same pot; yield is
///         credited to pots in proportion to what each has saved.
contract VaultSavingsTest is IpinTest {
    uint256 internal _house;

    function setUp() public override {
        super.setUp();
        _house = _readyPot(); // 500 MUSD
    }

    // --- Moving money in and out ---

    function test_R10_depositKeepsPotCredit() public {
        uint256 liabilities = _vault.totalLiabilities();

        vm.expectEmit(address(_vault));
        emit ISavings.SavingsDeposited(_house, 200e18);
        vm.prank(_sender);
        _vault.moveToSavings(_house, 200e18);

        assertEq(_vault.potBalance(_house), 300e18, "spendable");
        assertEq(_vault.savedOf(_house), 200e18, "saved, still the pot's");
        assertEq(_vault.totalSaved(), 200e18);
        assertEq(_savings.balanceOf(address(_vault)), 200e18, "sMUSD held by the vault");
        assertEq(_vault.totalLiabilities(), liabilities, "nothing owed changed");
        assertTrue(_vault.booksBalance());
    }

    function test_R10_withdrawReturnsToSamePot() public {
        uint256 other = _fundedPot(_CAP, 100e18);
        vm.startPrank(_sender);
        _vault.moveToSavings(_house, 200e18);
        _vault.moveToSavings(other, 50e18);

        vm.expectEmit(address(_vault));
        emit ISavings.SavingsWithdrawn(_house, 120e18);
        _vault.withdrawFromSavings(_house, 120e18);
        vm.stopPrank();

        assertEq(_vault.potBalance(_house), 420e18);
        assertEq(_vault.savedOf(_house), 80e18);
        assertEq(_vault.potBalance(other), 50e18, "other pot untouched");
        assertEq(_vault.savedOf(other), 50e18);
        assertTrue(_vault.booksBalance());
    }

    function test_R10_savedMoneyIsNotSpendable() public {
        vm.prank(_sender);
        _vault.moveToSavings(_house, 450e18);

        PaymentRequest memory req = _request(_house, 100e18);
        bytes memory sig = _sign(req, _senderKey);
        vm.expectRevert(
            abi.encodeWithSelector(IPolicyEngine.InsufficientPotBalance.selector, _house, 50e18, 100e18 + _FEE)
        );
        vm.prank(_relayer);
        _vault.execute(req, sig);
    }

    // --- Yield ---

    function test_R10_yieldCreditedProRata() public {
        uint256 other = _fundedPot(_CAP, 100e18);
        vm.startPrank(_sender);
        _vault.moveToSavings(_house, 300e18);
        _vault.moveToSavings(other, 100e18);
        vm.stopPrank();

        _savings.addYield(address(_vault), 8e18);
        vm.expectEmit(address(_vault));
        emit ISavings.YieldHarvested(8e18);
        _vault.harvestYield();

        assertEq(_vault.pendingYield(_house), 6e18, "3/4 of the yield");
        assertEq(_vault.pendingYield(other), 2e18, "1/4 of the yield");

        vm.prank(_sender);
        _vault.withdrawFromSavings(_house, 300e18);
        assertEq(_vault.potBalance(_house), 200e18 + 300e18 + 6e18, "principal + yield back in the pot");
        assertEq(_vault.totalYieldCredited(), 6e18);
        assertTrue(_vault.booksBalance());
    }

    function test_R10_withdrawRealizesUnharvestedYield() public {
        vm.prank(_sender);
        _vault.moveToSavings(_house, 400e18);
        _savings.addYield(address(_vault), 4e18);

        vm.prank(_sender);
        _vault.withdrawFromSavings(_house, 400e18);

        assertEq(_vault.potBalance(_house), 504e18, "yield claimed on the way out is credited");
        assertEq(_vault.totalYieldHarvested(), 4e18);
        assertEq(_vault.surplus(), 0, "no yield left unallocated");
    }

    function test_R10_newSaverDoesNotTakeEarlierYield() public {
        vm.prank(_sender);
        _vault.moveToSavings(_house, 100e18);
        _savings.addYield(address(_vault), 10e18); // earned before `late` saved

        uint256 late = _fundedPot(_CAP, 100e18);
        vm.prank(_sender);
        _vault.moveToSavings(late, 100e18);

        assertEq(_vault.pendingYield(_house), 10e18, "all of it to the earlier saver");
        assertEq(_vault.pendingYield(late), 0);
    }

    function testFuzz_R10_yieldNeverOverCredited(uint96 _a, uint96 _b, uint96 _yield) public {
        uint256 a = bound(uint256(_a), 1, 400e18);
        uint256 b = bound(uint256(_b), 1, 400e18);
        uint256 other = _fundedPot(_CAP, 400e18);
        vm.startPrank(_sender);
        _vault.moveToSavings(_house, a);
        _vault.moveToSavings(other, b);
        vm.stopPrank();
        _savings.addYield(address(_vault), _yield);
        _vault.harvestYield();

        assertLe(_vault.pendingYield(_house) + _vault.pendingYield(other), _yield, "rounds down, never up");
        assertTrue(_vault.booksBalance());
    }

    // --- Guards ---

    function test_R10_onlyOwnerMovesSavings() public {
        address stranger = makeAddr("stranger");
        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, _house, stranger));
        vm.prank(stranger);
        _vault.moveToSavings(_house, 1e18);

        vm.prank(_sender);
        _vault.moveToSavings(_house, 1e18);
        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, _house, stranger));
        vm.prank(stranger);
        _vault.withdrawFromSavings(_house, 1e18);
    }

    function test_R10_rejectsMoreThanAvailable() public {
        vm.startPrank(_sender);
        vm.expectRevert(abi.encodeWithSelector(ISavings.InsufficientBalance.selector, _house, 500e18, 501e18));
        _vault.moveToSavings(_house, 501e18);

        _vault.moveToSavings(_house, 10e18);
        vm.expectRevert(abi.encodeWithSelector(ISavings.InsufficientSaved.selector, _house, 10e18, 11e18));
        _vault.withdrawFromSavings(_house, 11e18);

        vm.expectRevert(IPots.ZeroAmount.selector);
        _vault.moveToSavings(_house, 0);
        vm.stopPrank();
    }

    function test_R10_disabledWithoutSavingsVault() public {
        Vault plain = new Vault(_musd, _relayer, _FEE, address(0), address(0));
        vm.startPrank(_sender);
        uint256 potId = plain.createPot("House", _CAP);
        vm.expectRevert(ISavings.SavingsDisabled.selector);
        plain.moveToSavings(potId, 1);
        vm.stopPrank();
    }
}
