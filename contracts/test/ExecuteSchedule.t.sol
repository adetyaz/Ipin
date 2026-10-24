// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IPots} from "../src/interfaces/IPots.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice createSchedule / cancelSchedule / executeSchedule (R9).
contract VaultExecuteScheduleTest is IpinTest {
    uint64 internal constant _INTERVAL = 30 days;
    uint256 internal constant _ALLOWANCE = 50e18;

    uint256 internal _potId;
    uint256 internal _scheduleId;
    uint64 internal _start;

    function setUp() public override {
        super.setUp();
        _potId = _readyPot();
        _start = uint64(vm.getBlockTimestamp() + 1 days);
        vm.prank(_sender);
        _scheduleId = _vault.createSchedule(_potId, _payee, _ALLOWANCE, _start, _INTERVAL);
    }

    // --- Expected Reverts ---

    function test_R9_rejectsBeforeDueDate() public {
        vm.warp(_start - 1);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.ScheduleNotDue.selector, _scheduleId, _start, _start - 1));
        _vault.executeSchedule(_scheduleId);
    }

    function test_R9_runsOncePerPeriod() public {
        vm.warp(_start);
        _vault.executeSchedule(_scheduleId);
        vm.warp(_start + _INTERVAL - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPolicyEngine.ScheduleNotDue.selector, _scheduleId, _start + _INTERVAL, _start + _INTERVAL - 1
            )
        );
        _vault.executeSchedule(_scheduleId);

        vm.warp(_start + _INTERVAL);
        _vault.executeSchedule(_scheduleId);
        assertEq(_musd.balanceOf(_payee), 2 * _ALLOWANCE);
    }

    function test_R9_rejectsCancelledSchedule() public {
        vm.prank(_sender);
        _vault.cancelSchedule(_scheduleId);
        vm.warp(_start);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.ScheduleNotActive.selector, _scheduleId));
        _vault.executeSchedule(_scheduleId);
    }

    function test_R9_onlyOwnerCreatesOrCancels() public {
        vm.startPrank(_requester);
        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, _potId, _requester));
        _vault.createSchedule(_potId, _payee, 1e18, _start, _INTERVAL);
        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, _potId, _requester));
        _vault.cancelSchedule(_scheduleId);
        vm.stopPrank();
    }

    function test_R9_createRejectsUnapprovedPayeeAndZeroInterval() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(_sender);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.PayeeNotApproved.selector, _potId, stranger));
        _vault.createSchedule(_potId, stranger, 1e18, _start, _INTERVAL);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.IntervalZero.selector));
        _vault.createSchedule(_potId, _payee, 1e18, _start, 0);
        vm.stopPrank();
    }

    function test_R9_paysOnlyNamedPayee() public {
        // The schedule pays its own payee and nobody else; once that payee is
        // removed from the pot it stops paying entirely.
        vm.warp(_start);
        _vault.executeSchedule(_scheduleId);
        assertEq(_musd.balanceOf(_payee), _ALLOWANCE);
        assertEq(_musd.balanceOf(address(this)), 0);

        vm.prank(_sender);
        _vault.removePayee(_potId, _payee);
        vm.warp(_start + _INTERVAL);
        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.PayeeNotApproved.selector, _potId, _payee));
        _vault.executeSchedule(_scheduleId);
    }

    function test_R7_scheduleCountsTowardCap() public {
        vm.prank(_sender);
        _vault.setCap(_potId, _ALLOWANCE + 10e18);
        _execute(_request(_potId, 20e18));
        vm.warp(_start);
        vm.expectRevert(
            abi.encodeWithSelector(IPolicyEngine.CapExceeded.selector, _potId, 20e18, _ALLOWANCE, _ALLOWANCE + 10e18)
        );
        _vault.executeSchedule(_scheduleId);
    }

    // --- Emitted Events ---

    function test_R9_emitsScheduledPaymentAndFee() public {
        vm.warp(_start);
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.FeeCharged(_potId, _relayer, _FEE);
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPolicyEngine.ScheduledPaymentSettled(_scheduleId, _potId, _payee, 0, _ALLOWANCE);
        _vault.executeSchedule(_scheduleId);
    }

    // --- System State Changes ---

    function test_R9_skipsMissedPeriods() public {
        // Executed late in period 2: pays period 2 once; periods 0 and 1 are
        // forfeited, never paid as a lump.
        uint256 late = _start + 2 * uint256(_INTERVAL) + 5 days;
        vm.warp(late);
        _vault.executeSchedule(_scheduleId);
        assertEq(_musd.balanceOf(_payee), _ALLOWANCE);
        assertEq(_vault.getSchedule(_scheduleId).nextPeriod, 3);
        assertEq(_vault.nextDue(_scheduleId), _start + 3 * uint256(_INTERVAL));

        vm.expectRevert(
            abi.encodeWithSelector(
                IPolicyEngine.ScheduleNotDue.selector, _scheduleId, _start + 3 * uint256(_INTERVAL), late
            )
        );
        _vault.executeSchedule(_scheduleId);
    }

    // --- Balance changes ---

    function test_R4_scheduleChargesFeeFromPot() public {
        uint256 before = _vault.potBalance(_potId);
        vm.warp(_start);
        _vault.executeSchedule(_scheduleId);
        assertEq(_vault.potBalance(_potId), before - _ALLOWANCE - _FEE);
        assertEq(_vault.unclaimedFees(), _FEE);
        assertTrue(_vault.booksBalance());
    }
}
