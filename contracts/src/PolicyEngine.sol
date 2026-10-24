// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {Pots} from "./Pots.sol";
import {IPolicyEngine} from "./interfaces/IPolicyEngine.sol";
import {PaymentRequest, PaymentRequests} from "./libraries/PaymentRequests.sol";

/// @title PolicyEngine
/// @notice The only door out of a pot (S17). Every payment, signed request or
///         schedule, passes the same checks in {_checkAndDebit}: approved payee
///         that is not a requester, amount > 0, within the cap for the current
///         period, pot covers amount + fee. Then MUSD goes straight from the
///         vault to the payee.
/// @dev ADR-013. Admin powers: none. The fee and relayer are immutable.
abstract contract PolicyEngine is EIP712, IPolicyEngine, Pots {
    using SafeERC20 for IERC20;

    /// @inheritdoc IPolicyEngine
    uint256 public constant PERIOD = 30 days;
    /// @notice Upper bound on the flat fee: 1 MUSD.
    uint256 public constant MAX_FEE = 1e18;

    /// @inheritdoc IPolicyEngine
    uint256 public immutable fee;
    /// @inheritdoc IPolicyEngine
    address public immutable relayerAddress;

    /// @inheritdoc IPolicyEngine
    uint256 public unclaimedFees;
    /// @inheritdoc IPolicyEngine
    uint256 public scheduleCount;

    /// @inheritdoc IPolicyEngine
    mapping(uint256 potId => mapping(address payee => bool approved)) public isPayee;
    /// @inheritdoc IPolicyEngine
    mapping(uint256 potId => mapping(address requester => bool registered)) public isRequester;
    /// @inheritdoc IPolicyEngine
    mapping(address signer => mapping(uint256 nonce => bool used)) public nonceUsed;
    /// @inheritdoc IPolicyEngine
    mapping(uint256 potId => mapping(uint256 period => uint256 amount)) public spent;

    mapping(uint256 scheduleId => Schedule schedule) private _schedules;

    /// @param _relayerAddress Receives withdrawn fees (non-zero).
    /// @param _fee Flat fee per settled payment, 0 < fee <= MAX_FEE (ADR-002).
    constructor(address _relayerAddress, uint256 _fee) EIP712("Ipin", "1") {
        if (_relayerAddress == address(0)) revert ZeroAddress();
        if (_fee == 0 || _fee > MAX_FEE) revert FeeOutOfRange(_fee);
        relayerAddress = _relayerAddress;
        fee = _fee;
    }

    // --- Pot policy (sender only) ---

    /// @inheritdoc IPolicyEngine
    function setCap(uint256 _potId, uint256 _cap) external onlyPotOwner(_potId) {
        _pots[_potId].cap = _cap;
        emit CapSet(_potId, _cap);
    }

    /// @inheritdoc IPolicyEngine
    function addPayee(uint256 _potId, address _payee) external onlyPotOwner(_potId) {
        if (_payee == address(0) || _payee == address(this)) {
            revert InvalidPayee(_payee);
        }
        if (isRequester[_potId][_payee]) {
            revert AddressIsRequester(_potId, _payee);
        }
        if (isPayee[_potId][_payee]) {
            revert PayeeAlreadyApproved(_potId, _payee);
        }
        isPayee[_potId][_payee] = true;
        emit PayeeAdded(_potId, _payee);
    }

    /// @inheritdoc IPolicyEngine
    function removePayee(uint256 _potId, address _payee) external onlyPotOwner(_potId) {
        if (!isPayee[_potId][_payee]) revert PayeeNotApproved(_potId, _payee);
        isPayee[_potId][_payee] = false;
        emit PayeeRemoved(_potId, _payee);
    }

    /// @inheritdoc IPolicyEngine
    function addRequester(uint256 _potId, address _requester) external onlyPotOwner(_potId) {
        if (_requester == address(0)) revert ZeroAddress();
        if (isPayee[_potId][_requester]) {
            revert AddressIsPayee(_potId, _requester);
        }
        if (isRequester[_potId][_requester]) {
            revert RequesterAlreadyRegistered(_potId, _requester);
        }
        isRequester[_potId][_requester] = true;
        emit RequesterAdded(_potId, _requester);
    }

    /// @inheritdoc IPolicyEngine
    function removeRequester(uint256 _potId, address _requester) external onlyPotOwner(_potId) {
        if (!isRequester[_potId][_requester]) {
            revert RequesterNotRegistered(_potId, _requester);
        }
        isRequester[_potId][_requester] = false;
        emit RequesterRemoved(_potId, _requester);
    }

    /// @inheritdoc IPolicyEngine
    function createSchedule(uint256 _potId, address _payee, uint256 _amount, uint64 _start, uint64 _interval)
        external
        onlyPotOwner(_potId)
        returns (uint256 scheduleId)
    {
        if (!isPayee[_potId][_payee]) revert PayeeNotApproved(_potId, _payee);
        if (_amount == 0) revert ZeroAmount();
        if (_interval == 0) revert IntervalZero();
        scheduleId = ++scheduleCount;
        _schedules[scheduleId] = Schedule({
            potId: _potId,
            payee: _payee,
            amount: _amount,
            start: _start,
            interval: _interval,
            nextPeriod: 0,
            active: true
        });
        emit ScheduleCreated(scheduleId, _potId, _payee, _amount, _start, _interval);
    }

    /// @inheritdoc IPolicyEngine
    function cancelSchedule(uint256 _scheduleId) external {
        Schedule storage schedule = _schedules[_scheduleId];
        if (schedule.potId == 0) revert ScheduleNotFound(_scheduleId);
        _requirePotOwner(schedule.potId);
        if (!schedule.active) revert ScheduleNotActive(_scheduleId);
        schedule.active = false;
        emit ScheduleCancelled(_scheduleId, schedule.potId);
    }

    // --- Payments (anyone may submit) ---

    /// @inheritdoc IPolicyEngine
    function execute(PaymentRequest calldata _request, bytes calldata _signature) external nonReentrant {
        uint256 potId = _request.potId;
        address signer = _pots[potId].owner;
        if (signer == address(0)) revert PotNotFound(potId);
        // R3: the expiry is a wall-clock deadline chosen by the sender.
        // forge-lint: disable-next-line(block-timestamp) R3 expiry is a wall-clock deadline; minutes of drift are fine.
        if (block.timestamp > _request.expiry) {
            revert RequestExpired(_request.expiry, block.timestamp);
        }
        if (nonceUsed[signer][_request.nonce]) {
            revert NonceAlreadyUsed(signer, _request.nonce);
        }
        bytes32 digest = _hashTypedDataV4(PaymentRequests.hash(_request));
        // R8: EOA (non-malleable ECDSA) or ERC-1271 smart-account sender.
        if (!SignatureChecker.isValidSignatureNow(signer, digest, _signature)) {
            revert InvalidSignature(potId, signer);
        }

        // Effects: nonce consumed before the external transfer (S14).
        nonceUsed[signer][_request.nonce] = true;
        _checkAndDebit(potId, _request.payee, _request.amount);
        // forge-lint: disable-next-line(reentrancy-events) only prior call is SignatureChecker's ERC-1271 staticcall.
        emit PaymentSettled(potId, _request.payee, _request.nonce, _request.amount, _request.itemHash);

        // Interaction last. A failed transfer reverts everything (R6 Wave 1).
        musd.safeTransfer(_request.payee, _request.amount);
    }

    /// @inheritdoc IPolicyEngine
    function executeSchedule(uint256 _scheduleId) external nonReentrant {
        Schedule storage schedule = _schedules[_scheduleId];
        if (schedule.potId == 0) revert ScheduleNotFound(_scheduleId);
        if (!schedule.active) revert ScheduleNotActive(_scheduleId);
        uint256 due = _nextDue(schedule);
        // forge-lint: disable-next-line(block-timestamp) R9 due dates are wall-clock dates; drift is bounded.
        if (block.timestamp < due) {
            revert ScheduleNotDue(_scheduleId, due, block.timestamp);
        }
        // R9: pay the current period once; earlier unpaid periods are skipped.
        uint256 period = (block.timestamp - schedule.start) / schedule.interval;
        schedule.nextPeriod = SafeCast.toUint64(period + 1);

        uint256 potId = schedule.potId;
        address payee = schedule.payee;
        uint256 amount = schedule.amount;
        _checkAndDebit(potId, payee, amount);
        emit ScheduledPaymentSettled(_scheduleId, potId, payee, period, amount);

        musd.safeTransfer(payee, amount);
    }

    /// @inheritdoc IPolicyEngine
    function claimFees() external nonReentrant {
        uint256 amount = unclaimedFees;
        if (amount == 0) revert NoFeesToWithdraw();
        unclaimedFees = 0;
        emit FeesWithdrawn(relayerAddress, amount);
        musd.safeTransfer(relayerAddress, amount);
    }

    // --- Views ---

    /// @inheritdoc IPolicyEngine
    function getSchedule(uint256 _scheduleId) external view returns (Schedule memory) {
        return _schedules[_scheduleId];
    }

    /// @inheritdoc IPolicyEngine
    function nextDue(uint256 _scheduleId) external view returns (uint256) {
        Schedule storage schedule = _schedules[_scheduleId];
        if (schedule.potId == 0) revert ScheduleNotFound(_scheduleId);
        return _nextDue(schedule);
    }

    /// @inheritdoc IPolicyEngine
    function hashPaymentRequest(PaymentRequest calldata _request) external view returns (bytes32) {
        return _hashTypedDataV4(PaymentRequests.hash(_request));
    }

    /// @inheritdoc IPolicyEngine
    function remainingCap(uint256 _potId) external view returns (uint256) {
        uint256 cap = _pots[_potId].cap;
        uint256 used = spent[_potId][currentPeriod(_potId)];
        return used >= cap ? 0 : cap - used;
    }

    /// @inheritdoc IPolicyEngine
    function itemHash(string calldata _item, uint256 _quantity, uint256 _unitPrice, string calldata _vendor)
        external
        pure
        returns (bytes32)
    {
        return PaymentRequests.itemHash(_item, _quantity, _unitPrice, _vendor);
    }

    /// @inheritdoc IPolicyEngine
    function currentPeriod(uint256 _potId) public view returns (uint256) {
        Pot storage pot = _pots[_potId];
        if (pot.owner == address(0)) revert PotNotFound(_potId);
        return (block.timestamp - pot.createdAt) / PERIOD;
    }

    // --- Helper functions ---

    /// @dev The policy checks and the ledger effects shared by every payment.
    ///      R4 (flat fee from the same pot), R7/I3 (cap counts `_amount`
    ///      only), I5 (approved payee, never a requester). The caller must then
    ///      transfer `_amount` to `_payee`.
    function _checkAndDebit(uint256 _potId, address _payee, uint256 _amount) internal {
        if (!isPayee[_potId][_payee]) revert PayeeNotApproved(_potId, _payee);
        // Unreachable while add* keep the two sets disjoint; kept as a guard.
        if (isRequester[_potId][_payee]) {
            revert AddressIsRequester(_potId, _payee);
        }
        if (_amount == 0) revert ZeroAmount();

        Pot storage pot = _pots[_potId];
        uint256 period = currentPeriod(_potId);
        uint256 spentNow = spent[_potId][period];
        if (spentNow + _amount > pot.cap) {
            revert CapExceeded(_potId, spentNow, _amount, pot.cap);
        }
        uint256 required = _amount + fee;
        if (pot.balance < required) {
            revert InsufficientPotBalance(_potId, pot.balance, required);
        }

        spent[_potId][period] = spentNow + _amount;
        pot.balance -= required;
        totalPotBalance -= required;
        unclaimedFees += fee;
        // forge-lint: disable-next-line(reentrancy-events) only prior call is SignatureChecker's ERC-1271 staticcall.
        emit FeeCharged(_potId, relayerAddress, fee);
    }

    function _feeLiability() internal view override returns (uint256) {
        return unclaimedFees;
    }

    function _nextDue(Schedule storage _schedule) private view returns (uint256) {
        return uint256(_schedule.start) + uint256(_schedule.nextPeriod) * _schedule.interval;
    }
}
