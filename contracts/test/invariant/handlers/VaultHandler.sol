// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Vm} from "forge-std/Vm.sol";

import {Vault} from "../../../src/Vault.sol";
import {IPots} from "../../../src/interfaces/IPots.sol";
import {PaymentRequest} from "../../../src/libraries/PaymentRequests.sol";
import {MockMUSD} from "../../mocks/MockMUSD.sol";

/// @notice Drives the vault as a sender, a requester, a relayer and an
///         attacker, and keeps ghost counters for I1-I6.
// A handler needs one ghost counter per invariant plus its actors.
// solhint-disable-next-line max-states-count
contract VaultHandler is CommonBase, StdCheats, StdUtils {
    uint256 internal constant _CAP = 300e18;
    uint64 internal constant _INTERVAL = 7 days;

    Vault public vault;
    MockMUSD public musd;

    address public sender;
    address public requester;
    address public relayer;
    address public attacker;

    uint256[2] public pots;
    address[3] public payees;

    /// @dev The handler's own model of each allowlist.
    mapping(uint256 potId => mapping(address payee => bool approved)) public modelApproved;
    mapping(address signer => mapping(uint256 nonce => uint256 count)) public settlements;

    uint256 public ghostDonations;
    uint256 public ghostDepositCreditMismatches; // I2
    uint256 public ghostCapViolations; // I3
    uint256 public ghostNonceReuses; // I4
    uint256 public ghostUnapprovedPayouts; // I5
    uint256 public ghostUnsignedSettlements; // I6

    uint256 internal _senderKey;
    uint256 internal _attackerKey;
    uint256 internal _splitId;
    uint256 internal _nonce;
    uint256[] internal _schedules;
    PaymentRequest internal _last;
    bytes internal _lastSig;
    bool internal _hasLast;

    constructor(Vault _vault, MockMUSD _musd, address _relayer) {
        vault = _vault;
        musd = _musd;
        relayer = _relayer;
        (sender, _senderKey) = makeAddrAndKey("inv-sender");
        (attacker, _attackerKey) = makeAddrAndKey("inv-attacker");
        requester = makeAddr("inv-requester");
        payees = [makeAddr("vendor-a"), makeAddr("vendor-b"), makeAddr("vendor-c")];
        musd.mint(sender, 1e30);
        musd.mint(attacker, 1e24);

        vm.startPrank(sender);
        musd.approve(address(vault), type(uint256).max);
        pots[0] = vault.createPot("House", _CAP);
        pots[1] = vault.createPot("Upkeep", _CAP / 3);
        uint256[] memory ids = new uint256[](2);
        (ids[0], ids[1]) = (pots[0], pots[1]);
        uint16[] memory bps = new uint16[](2);
        (bps[0], bps[1]) = (7500, 2500);
        _splitId = vault.createSplit(ids, bps, pots[0]);
        vault.addRequester(pots[0], requester);
        vault.addRequester(pots[1], requester);
        vm.stopPrank();
    }

    // --- Sender actions ---

    function deposit(uint256 _amount) external {
        _amount = bound(_amount, 1, 1e24);
        vm.recordLogs();
        vm.prank(sender);
        vault.deposit(_splitId, _amount);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 credited = 0;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == IPots.PotCredited.selector) {
                credited += abi.decode(logs[i].data, (uint256));
            }
        }
        if (credited != _amount) ++ghostDepositCreditMismatches;
    }

    function addPayee(uint256 _potSeed, uint256 _payeeSeed, bool _tryRequester) external {
        uint256 potId = pots[_potSeed % 2];
        address payee = _tryRequester ? requester : payees[_payeeSeed % 3];
        vm.prank(sender);
        try vault.addPayee(potId, payee) {
            modelApproved[potId][payee] = true;
        } catch {
            modelApproved[potId][payee] = modelApproved[potId][payee];
        }
    }

    function removePayee(uint256 _potSeed, uint256 _payeeSeed) external {
        uint256 potId = pots[_potSeed % 2];
        address payee = payees[_payeeSeed % 3];
        vm.prank(sender);
        try vault.removePayee(potId, payee) {
            modelApproved[potId][payee] = false;
        } catch {
            modelApproved[potId][payee] = modelApproved[potId][payee];
        }
    }

    function createSchedule(uint256 _potSeed, uint256 _payeeSeed, uint256 _amount) external {
        _amount = bound(_amount, 1, 100e18);
        uint64 start = uint64(vm.getBlockTimestamp());
        vm.prank(sender);
        try vault.createSchedule(pots[_potSeed % 2], payees[_payeeSeed % 3], _amount, start, _INTERVAL) returns (
            uint256 id
        ) {
            _schedules.push(id);
        } catch {
            return;
        }
    }

    // --- Relayer actions ---

    function executeSigned(uint256 _potSeed, uint256 _payeeSeed, uint256 _amount) external {
        uint256 potId = pots[_potSeed % 2];
        PaymentRequest memory req = _newRequest(potId, payees[_payeeSeed % 3], _amount);
        bytes memory sig = _sign(req, _senderKey);
        if (_tryExecute(req, sig)) {
            (_last, _lastSig, _hasLast) = (req, sig, true);
        }
    }

    function replayLast() external {
        if (_hasLast) _tryExecute(_last, _lastSig);
    }

    function executeSchedule(uint256 _seed) external {
        if (_schedules.length == 0) return;
        uint256 id = _schedules[_seed % _schedules.length];
        uint256 potId = vault.getSchedule(id).potId;
        address payee = vault.getSchedule(id).payee;
        vm.prank(relayer);
        try vault.executeSchedule(id) {
            _afterPayout(potId, payee);
        } catch {
            return;
        }
    }

    function claimFees() external {
        if (vault.unclaimedFees() > 0) vault.claimFees();
    }

    // --- Attacker actions ---

    function executeForged(uint256 _potSeed, uint256 _amount, bool _toSelf) external {
        address payee = _toSelf ? attacker : payees[0];
        PaymentRequest memory req = _newRequest(pots[_potSeed % 2], payee, _amount);
        bytes memory sig = _sign(req, _attackerKey);
        vm.prank(attacker);
        try vault.execute(req, sig) {
            ++ghostUnsignedSettlements;
        } catch {
            return;
        }
    }

    function requesterPaysSelf(uint256 _potSeed, uint256 _amount) external {
        // Even a request the sender signs to the requester must not settle.
        PaymentRequest memory req = _newRequest(pots[_potSeed % 2], requester, _amount);
        _tryExecute(req, _sign(req, _senderKey));
    }

    function donate(uint256 _amount) external {
        // MUSD that reaches the vault without `deposit` (a donation or an
        // on-ramp delivery): owed to no pot, so it is surplus (I1).
        _amount = bound(_amount, 1, 1e21);
        ghostDonations += _amount;
        musd.mint(address(vault), _amount);
    }

    // --- Time ---

    function warp(uint256 _seconds) external {
        vm.warp(vm.getBlockTimestamp() + bound(_seconds, 1, 20 days));
    }

    // --- Helper functions ---

    function _tryExecute(PaymentRequest memory _req, bytes memory _sig) internal returns (bool ok) {
        vm.prank(relayer);
        try vault.execute(_req, _sig) {
            if (++settlements[sender][_req.nonce] > 1) ++ghostNonceReuses;
            _afterPayout(_req.potId, _req.payee);
            ok = true;
        } catch {
            ok = false;
        }
    }

    function _newRequest(uint256 _potId, address _payee, uint256 _amount) internal returns (PaymentRequest memory) {
        return PaymentRequest({
            potId: _potId,
            payee: _payee,
            amount: bound(_amount, 1, 200e18),
            itemHash: bytes32(_nonce),
            nonce: ++_nonce,
            expiry: vm.getBlockTimestamp() + 1 days
        });
    }

    function _afterPayout(uint256 _potId, address _payee) internal {
        if (!modelApproved[_potId][_payee] || _payee == requester) {
            ++ghostUnapprovedPayouts;
        }
        uint256 period = vault.currentPeriod(_potId);
        if (vault.spent(_potId, period) > vault.getPot(_potId).cap) {
            ++ghostCapViolations;
        }
    }

    function _sign(PaymentRequest memory _req, uint256 _key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, vault.hashPaymentRequest(_req));
        return abi.encodePacked(r, s, v);
    }
}
