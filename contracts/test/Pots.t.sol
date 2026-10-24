// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPots} from "../src/interfaces/IPots.sol";
import {IpinTest} from "./utils/IpinTest.sol";
import {Vm} from "forge-std/Vm.sol";

/// @notice Pots, splits and deposits: R1, R2, I1, I2.
contract PotsTest is IpinTest {
    bytes32 private constant _PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function test_R1_amountsAreBaseUnits() public {
        uint256 potId = _createPot(_sender, 0);
        uint256 splitId = _singleSplit(_sender, potId);
        assertEq(_musd.decimals(), 18);

        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPots.PotCredited(potId, 1, 1);
        vm.prank(_sender);
        _vault.deposit(splitId, 1); // one base unit, no scaling anywhere

        assertEq(_vault.potBalance(potId), 1);
        assertEq(_musd.balanceOf(address(_vault)), 1);
    }

    function test_R2_remainderGoesToNamedPot() public {
        uint256 a = _createPot(_sender, 0);
        uint256 b = _createPot(_sender, 0);
        uint256 c = _createPot(_sender, 0);
        uint256[] memory pots = new uint256[](3);
        (pots[0], pots[1], pots[2]) = (a, b, c);
        uint16[] memory bps = new uint16[](3);
        (bps[0], bps[1], bps[2]) = (3333, 3333, 3334);
        vm.prank(_sender);
        uint256 splitId = _vault.createSplit(pots, bps, b);

        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPots.RemainderCredited(b, 1, 1);
        vm.prank(_sender);
        _vault.deposit(splitId, 10); // floor pieces 3,3,3; remainder 1 goes to pot b

        assertEq(_vault.potBalance(a), 3);
        assertEq(_vault.potBalance(b), 4);
        assertEq(_vault.potBalance(c), 3);
    }

    function test_R2_rejectsWeightsNot10000() public {
        uint256 a = _createPot(_sender, 0);
        uint256 b = _createPot(_sender, 0);
        uint256[] memory pots = new uint256[](2);
        (pots[0], pots[1]) = (a, b);
        uint16[] memory bps = new uint16[](2);
        (bps[0], bps[1]) = (5000, 4999);
        vm.expectRevert(abi.encodeWithSelector(IPots.SplitWeightsInvalid.selector, uint256(9999)));
        vm.prank(_sender);
        _vault.createSplit(pots, bps, a);
    }

    function test_R2_rejectsZeroWeight() public {
        uint256 a = _createPot(_sender, 0);
        uint256 b = _createPot(_sender, 0);
        uint256[] memory pots = new uint256[](2);
        (pots[0], pots[1]) = (a, b);
        uint16[] memory bps = new uint16[](2);
        (bps[0], bps[1]) = (_BPS, 0);
        vm.expectRevert(abi.encodeWithSelector(IPots.ZeroWeight.selector, uint256(1)));
        vm.prank(_sender);
        _vault.createSplit(pots, bps, a);
    }

    function test_R2_rejectsDuplicatePot() public {
        uint256 a = _createPot(_sender, 0);
        uint256[] memory pots = new uint256[](2);
        (pots[0], pots[1]) = (a, a);
        uint16[] memory bps = new uint16[](2);
        (bps[0], bps[1]) = (5000, 5000);
        vm.expectRevert(abi.encodeWithSelector(IPots.DuplicatePot.selector, a));
        vm.prank(_sender);
        _vault.createSplit(pots, bps, a);
    }

    function test_R2_rejectsRemainderPotOutsideSplit() public {
        uint256 a = _createPot(_sender, 0);
        uint256 other = _createPot(_sender, 0);
        uint256[] memory pots = new uint256[](1);
        pots[0] = a;
        uint16[] memory bps = new uint16[](1);
        bps[0] = _BPS;
        vm.expectRevert(abi.encodeWithSelector(IPots.RemainderPotNotInSplit.selector, other));
        vm.prank(_sender);
        _vault.createSplit(pots, bps, other);
    }

    function test_R2_rejectsForeignPotInSplit() public {
        address stranger = makeAddr("stranger");
        uint256 theirs = _createPot(stranger, 0);
        uint256[] memory pots = new uint256[](1);
        pots[0] = theirs;
        uint16[] memory bps = new uint16[](1);
        bps[0] = _BPS;
        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, theirs, _sender));
        vm.prank(_sender);
        _vault.createSplit(pots, bps, theirs);
    }

    function test_R2_onlySplitOwnerDeposits() public {
        uint256 potId = _createPot(_sender, 0);
        uint256 splitId = _singleSplit(_sender, potId);
        address stranger = makeAddr("stranger");
        vm.expectRevert(abi.encodeWithSelector(IPots.NotSplitOwner.selector, splitId, stranger));
        vm.prank(stranger);
        _vault.deposit(splitId, 1e18);
    }

    function test_R2_depositWithPermit() public {
        (address holder, uint256 key) = makeAddrAndKey("holder");
        _musd.mint(holder, 100e18);
        uint256 potId = _createPot(holder, 0);
        uint256 splitId = _singleSplit(holder, potId);
        uint256 amount = 40e18;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, holder, address(_vault), amount, 0, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _musd.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);

        vm.prank(holder);
        _vault.depositWithPermit(splitId, amount, deadline, v, r, s);

        assertEq(_vault.potBalance(potId), amount);
        assertTrue(_vault.booksBalance());
    }

    function test_I1_booksBalanceAfterDeposits() public {
        _fundedPot(0, 123e18);
        _fundedPot(0, 7);
        assertEq(_vault.totalLiabilities(), 123e18 + 7);
        assertEq(_vault.surplus(), 0);
        assertTrue(_vault.booksBalance());
    }

    function test_I1_surplusDoesNotBreakBooks() public {
        uint256 potId = _fundedPot(0, 50e18);
        // MUSD sent straight to the vault (a donation, a card on-ramp delivery, later savings
        // yield) is owed to no pot: it shows as surplus and the books still balance.
        _musd.mint(address(_vault), 3);
        assertEq(_vault.surplus(), 3);
        assertEq(_vault.potBalance(potId), 50e18);
        assertTrue(_vault.booksBalance());
    }

    function testFuzz_R2_splitSumsToDeposit(uint256 amount, uint256 count, uint256 seed, uint256 remainderIndex)
        public
    {
        amount = bound(amount, 1, 1e30);
        count = bound(count, 1, 5);
        remainderIndex = bound(remainderIndex, 0, count - 1);
        (uint256[] memory pots, uint16[] memory bps) = _randomSplit(count, seed);
        vm.prank(_sender);
        uint256 splitId = _vault.createSplit(pots, bps, pots[remainderIndex]);

        vm.recordLogs();
        vm.prank(_sender);
        _vault.deposit(splitId, amount);
        // I2: the PotCredited events of this deposit sum to the deposit.
        assertEq(_sumPotCredited(vm.getRecordedLogs()), amount, "I2: credits emitted == deposit");

        uint256 credited;
        uint256 floorSum;
        for (uint256 i = 0; i < count; ++i) {
            credited += _vault.potBalance(pots[i]);
            floorSum += amount * bps[i] / _BPS;
        }
        assertEq(credited, amount, "sum of credits == deposit");
        assertLt(amount - floorSum, count, "remainder < number of pots");
        assertEq(
            _vault.potBalance(pots[remainderIndex]),
            amount * bps[remainderIndex] / _BPS + (amount - floorSum),
            "remainder to named pot"
        );
        assertTrue(_vault.booksBalance());
    }

    /// @dev `count` new pots with random weights, each >= 1 bps, summing to 10_000.
    function _randomSplit(uint256 count, uint256 seed) private returns (uint256[] memory pots, uint16[] memory bps) {
        pots = new uint256[](count);
        bps = new uint16[](count);
        uint256 left = _BPS;
        for (uint256 i = 0; i < count; ++i) {
            pots[i] = _createPot(_sender, 0);
            uint256 maxHere = left - (count - 1 - i); // leave at least 1 bps for each later pot
            uint256 w = i == count - 1 ? left : bound(uint256(keccak256(abi.encode(seed, i))), 1, maxHere);
            bps[i] = uint16(w);
            left -= w;
        }
    }

    function _sumPotCredited(Vm.Log[] memory logs) private pure returns (uint256 sum) {
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == IPots.PotCredited.selector) sum += abi.decode(logs[i].data, (uint256));
        }
    }
}
