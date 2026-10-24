// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";

import {Vault} from "../src/Vault.sol";
import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IPots} from "../src/interfaces/IPots.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice multicall: the sender's one-transaction setup (OZ Multicall,
///         delegatecall to self). Every inner call is an ordinary external
///         call with the caller's msg.sender, so every rule still applies.
contract VaultMulticallTest is IpinTest {
    bytes32 private constant _PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    uint256 private constant _HOUSE_CAP = 400e18;
    uint256 private constant _UPKEEP_CAP = 100e18;

    address internal _family;
    uint256 internal _familyKey;
    address internal _vendor;

    function setUp() public override {
        super.setUp();
        (_family, _familyKey) = makeAddrAndKey("family");
        _vendor = makeAddr("vendor");
        _musd.mint(_family, 1000e18);
    }

    // --- Expected Reverts ---

    function test_I5_multicallCannotTouchForeignPot() public {
        uint256 potId = _readyPot(); // owned by _sender, split 1
        uint256 scheduleId = _createScheduleFor(potId);
        address attacker = makeAddr("attacker");
        uint256[] memory ids = new uint256[](1);
        ids[0] = potId;
        uint16[] memory bps = new uint16[](1);
        bps[0] = _BPS;

        bytes[] memory calls = new bytes[](7);
        calls[0] = abi.encodeCall(Vault.addPayee, (potId, attacker));
        calls[1] = abi.encodeCall(Vault.removePayee, (potId, _payee));
        calls[2] = abi.encodeCall(Vault.addRequester, (potId, attacker));
        calls[3] = abi.encodeCall(Vault.setCap, (potId, type(uint256).max));
        calls[4] = abi.encodeCall(Vault.createSchedule, (potId, _payee, 1e18, 0, 1 days));
        calls[5] = abi.encodeCall(Vault.createSplit, (ids, bps, potId));
        calls[6] = abi.encodeCall(Vault.cancelSchedule, (scheduleId));
        bytes memory notOwner = abi.encodeWithSelector(IPots.NotPotOwner.selector, potId, attacker);

        // Each inner call alone is refused with the caller's own address:
        // msg.sender is preserved through the self-delegatecall.
        for (uint256 i = 0; i < calls.length; ++i) {
            bytes[] memory one = new bytes[](1);
            one[0] = calls[i];
            vm.expectRevert(notOwner);
            vm.prank(attacker);
            _vault.multicall(one);
        }
        bytes[] memory dep = new bytes[](1);
        dep[0] = abi.encodeCall(Vault.deposit, (1, 1));
        vm.expectRevert(abi.encodeWithSelector(IPots.NotSplitOwner.selector, 1, attacker));
        vm.prank(attacker);
        _vault.multicall(dep);

        // And so does the whole batch, after a call the attacker may make.
        bytes[] memory batch = new bytes[](2);
        batch[0] = abi.encodeCall(Vault.createPot, ("Mine", 0));
        batch[1] = calls[0];
        uint256 potsBefore = _vault.potCount();
        vm.expectRevert(notOwner);
        vm.prank(attacker);
        _vault.multicall(batch);

        assertEq(_vault.potCount(), potsBefore);
        assertFalse(_vault.isPayee(potId, attacker));
        assertTrue(_vault.isPayee(potId, _payee));
        assertEq(_vault.getPot(potId).cap, _CAP);
        assertTrue(_vault.getSchedule(scheduleId).active);
    }

    function test_R2_multicallRevertsAtomically() public {
        (uint256 house,) = _predictPotIds();
        bytes[] memory calls = _setupBatch(500e18, _vendor);
        // The last call fails: the payee is the zero address.
        calls[calls.length - 1] = abi.encodeCall(Vault.addPayee, (house, address(0)));

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidPayee.selector, address(0)));
        vm.prank(_family);
        _vault.multicall(calls);

        assertEq(_vault.potCount(), 0, "no pot half-created");
        assertEq(_vault.splitCount(), 0, "no split half-created");
        assertEq(_vault.depositCount(), 0, "no deposit half-made");
        assertEq(_musd.balanceOf(_family), 1000e18, "no MUSD pulled");
        assertEq(_musd.nonces(_family), 0, "permit not consumed");
        assertEq(_musd.balanceOf(address(_vault)), 0);
    }

    function test_R2_multicallRevertsWhenPredictedPotIdTaken() public {
        // The app predicts the new pot ids from potCount() just before
        // sending. Another sender's createPot lands first and takes the id.
        (uint256 house, uint256 upkeep) = _predictPotIds();
        bytes[] memory calls = _setupBatch(500e18, _vendor);
        uint256 squatted = _createPot(_sender, 0);
        assertEq(squatted, house);

        // createPot now returns upkeep and upkeep + 1, so createSplit names a
        // pot the family does not own and the whole batch reverts.
        vm.expectRevert(abi.encodeWithSelector(IPots.NotPotOwner.selector, house, _family));
        vm.prank(_family);
        _vault.multicall(calls);

        assertEq(_vault.potCount(), 1, "only the other sender's pot exists");
        assertEq(_vault.getPot(upkeep).owner, address(0));
        assertEq(_vault.splitCount(), 0);
        assertEq(_musd.balanceOf(_family), 1000e18, "no MUSD pulled");
        assertFalse(_vault.isPayee(house, _vendor));
    }

    function test_R3_multicallRejectsReplayedRequestInBatch() public {
        uint256 potId = _readyPot();
        PaymentRequest memory req = _request(potId, 10e18);
        bytes memory sig = _sign(req, _senderKey);
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(Vault.execute, (req, sig));
        calls[1] = calls[0];

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.NonceAlreadyUsed.selector, _sender, req.nonce));
        vm.prank(_relayer);
        _vault.multicall(calls);

        assertFalse(_vault.nonceUsed(_sender, req.nonce), "reverted batch consumes no nonce");
        assertEq(_vault.potBalance(potId), 500e18);
        assertEq(_musd.balanceOf(_payee), 0);

        // The same request alone in a batch settles exactly once.
        bytes[] memory once = new bytes[](1);
        once[0] = calls[0];
        vm.prank(_relayer);
        _vault.multicall(once);
        assertEq(_musd.balanceOf(_payee), 10e18);
        assertEq(_vault.potBalance(potId), 500e18 - 10e18 - _FEE);
    }

    function test_R8_multicallExecuteChecksSignature() public {
        uint256 potId = _readyPot();
        PaymentRequest memory req = _request(potId, 10e18);
        bytes memory sig = _sign(req, _senderKey);
        req.amount = 20e18; // altered after signing
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(Vault.execute, (req, sig));

        vm.expectRevert(abi.encodeWithSelector(IPolicyEngine.InvalidSignature.selector, potId, _sender));
        vm.prank(_relayer);
        _vault.multicall(calls);
    }

    function test_I1_multicallRejectsValue() public {
        // Nothing in the vault is payable, so no msg.value can be reused
        // across inner calls (the classic Multicall + payable pitfall).
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(Vault.createPot, ("House", 0));
        vm.deal(_family, 1 ether);
        vm.prank(_family);
        // A low-level call is the only way to attach value to a non-payable function.
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok,) = address(_vault).call{value: 1 ether}(abi.encodeCall(Vault.multicall, (calls)));
        assertFalse(ok);
        assertEq(address(_vault).balance, 0);
        assertEq(_vault.potCount(), 0);
    }

    // --- System State Changes ---

    function test_R2_multicallSetupInOneTransaction() public {
        (uint256 house, uint256 upkeep) = _predictPotIds();
        uint256 amount = 600e18 + 3; // leaves a remainder
        bytes[] memory calls = _setupBatch(amount, _vendor);

        vm.recordLogs();
        vm.prank(_family);
        bytes[] memory results = _vault.multicall(calls);

        assertEq(abi.decode(results[0], (uint256)), house);
        assertEq(abi.decode(results[1], (uint256)), upkeep);
        assertEq(abi.decode(results[2], (uint256)), 1, "split id");

        // msg.sender was preserved: the family owns everything it created.
        assertEq(_vault.getPot(house).owner, _family);
        assertEq(_vault.getPot(upkeep).owner, _family);
        assertEq(_vault.getPot(house).cap, _HOUSE_CAP);
        assertEq(_vault.getPot(upkeep).cap, _UPKEEP_CAP);
        assertEq(_vault.getSplit(1).owner, _family);
        assertEq(_vault.getSplit(1).remainderPotId, house);
        assertTrue(_vault.isPayee(house, _vendor));

        // R2: floor pieces, remainder to the named House pot.
        uint256 upkeepCredit = amount * 2500 / _BPS;
        assertEq(_vault.potBalance(upkeep), upkeepCredit);
        assertEq(_vault.potBalance(house), amount - upkeepCredit);
        assertEq(_musd.balanceOf(_family), 1000e18 - amount);
        assertEq(_musd.nonces(_family), 1, "permit used");
        assertEq(_musd.allowance(_family, address(_vault)), 0, "no allowance left over");

        // I1: books balance with no surplus.
        assertTrue(_vault.booksBalance());
        assertEq(_vault.totalLiabilities(), amount);
        assertEq(_vault.surplus(), 0);

        // I2: the deposit equals the sum of its PotCredited events.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 deposited = 0;
        uint256 credited = 0;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == IPots.Deposited.selector) {
                deposited += abi.decode(logs[i].data, (uint256));
            } else if (logs[i].topics[0] == IPots.PotCredited.selector) {
                credited += abi.decode(logs[i].data, (uint256));
            }
        }
        assertEq(deposited, amount);
        assertEq(credited, amount);
    }

    function test_R2_multicallTopUpWithPermit() public {
        vm.prank(_family);
        _vault.multicall(_setupBatch(100e18, _vendor));
        (uint8 v, bytes32 r, bytes32 s, uint256 deadline) = _permit(50e18);
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(Vault.depositWithPermit, (1, 50e18, deadline, v, r, s));

        vm.prank(_family);
        _vault.multicall(calls);

        assertEq(_vault.totalLiabilities(), 150e18);
        assertEq(_musd.nonces(_family), 2);
        assertTrue(_vault.booksBalance());
    }

    // --- Helper functions ---

    function _predictPotIds() internal view returns (uint256 house, uint256 upkeep) {
        uint256 count = _vault.potCount();
        (house, upkeep) = (count + 1, count + 2);
    }

    /// @dev The app's setup batch: House and Upkeep pots, a 75/25 split with
    ///      the remainder to House, a permit deposit, and one payee on House.
    function _setupBatch(uint256 _amount, address _payeeAddr) internal view returns (bytes[] memory calls) {
        (uint256 house, uint256 upkeep) = _predictPotIds();
        uint256[] memory ids = new uint256[](2);
        (ids[0], ids[1]) = (house, upkeep);
        uint16[] memory bps = new uint16[](2);
        (bps[0], bps[1]) = (7500, 2500);
        (uint8 v, bytes32 r, bytes32 s, uint256 deadline) = _permit(_amount);
        uint256 splitId = _vault.splitCount() + 1;

        calls = new bytes[](5);
        calls[0] = abi.encodeCall(Vault.createPot, ("House", _HOUSE_CAP));
        calls[1] = abi.encodeCall(Vault.createPot, ("Upkeep", _UPKEEP_CAP));
        calls[2] = abi.encodeCall(Vault.createSplit, (ids, bps, house));
        calls[3] = abi.encodeCall(Vault.depositWithPermit, (splitId, _amount, deadline, v, r, s));
        calls[4] = abi.encodeCall(Vault.addPayee, (house, _payeeAddr));
    }

    function _permit(uint256 _amount) internal view returns (uint8 v, bytes32 r, bytes32 s, uint256 deadline) {
        deadline = vm.getBlockTimestamp() + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(_PERMIT_TYPEHASH, _family, address(_vault), _amount, _musd.nonces(_family), deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _musd.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(_familyKey, digest);
    }

    function _createScheduleFor(uint256 _potId) internal returns (uint256 scheduleId) {
        vm.prank(_sender);
        scheduleId = _vault.createSchedule(_potId, _payee, 1e18, uint64(vm.getBlockTimestamp()), 1 days);
    }
}
