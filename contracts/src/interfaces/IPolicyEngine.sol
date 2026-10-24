// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PaymentRequest} from "../libraries/PaymentRequests.sol";

/// @title IPolicyEngine
/// @notice The only door out of a pot (S17). Holds each pot's policy (approved
///         payees, registered requesters, cap per period) and settles payments
///         that pass it: a sender-signed {PaymentRequest} via {execute}, or a
///         sender-created schedule via {executeSchedule}. Every settled payment
///         pays MUSD straight from the vault to the payee and charges one flat
///         fee from the same pot, claimable by the relayer (R4).
/// @dev ADR-013: one engine with built-in checks. All amounts are MUSD base
///      units (R1). Cap periods are fixed 30-day epochs from pot creation
///      (R7, ADR-003); the cap counts `amount` only, never the fee.
interface IPolicyEngine {
    /// @notice A recurring allowance created by the pot's sender (R9).
    /// @param potId Pot it pays from.
    /// @param payee Approved payee it pays to.
    /// @param amount MUSD base units per period.
    /// @param start Timestamp of period 0; nothing is payable before it.
    /// @param interval Schedule period length in seconds (> 0).
    /// @param nextPeriod First schedule period index not yet paid or skipped.
    /// @param active False once cancelled.
    struct Schedule {
        uint256 potId;
        address payee;
        uint256 amount;
        uint64 start;
        uint64 interval;
        uint64 nextPeriod;
        bool active;
    }

    // --- Events ---

    event CapSet(uint256 indexed potId, uint256 cap);
    event PayeeAdded(uint256 indexed potId, address indexed payee);
    event PayeeRemoved(uint256 indexed potId, address indexed payee);
    event RequesterAdded(uint256 indexed potId, address indexed requester);
    event RequesterRemoved(uint256 indexed potId, address indexed requester);
    /// @notice A signed request settled: `amount` left the pot to `payee`.
    event PaymentSettled(
        uint256 indexed potId, address indexed payee, uint256 indexed nonce, uint256 amount, bytes32 itemHash
    );
    event ScheduleCreated(
        uint256 indexed scheduleId,
        uint256 indexed potId,
        address indexed payee,
        uint256 amount,
        uint256 start,
        uint256 interval
    );
    event ScheduleCancelled(uint256 indexed scheduleId, uint256 indexed potId);
    /// @notice A schedule paid `amount` for schedule period `period`.
    event ScheduledPaymentSettled(
        uint256 indexed scheduleId, uint256 indexed potId, address indexed payee, uint256 period, uint256 amount
    );
    /// @notice The flat fee of one settled payment, debited from `potId` and
    ///         added to `unclaimedFees` (R4).
    event FeeCharged(uint256 indexed potId, address indexed relayer, uint256 fee);
    event FeesWithdrawn(address indexed relayer, uint256 amount);

    // --- Errors ---

    error ZeroAddress();
    error PayeeAlreadyApproved(uint256 potId, address payee);
    error PayeeNotApproved(uint256 potId, address payee);
    error RequesterAlreadyRegistered(uint256 potId, address requester);
    error RequesterNotRegistered(uint256 potId, address requester);
    /// @notice `account` is a registered requester of the pot, so it cannot be
    ///         a payee.
    error AddressIsRequester(uint256 potId, address account);
    /// @notice `account` is an approved payee of the pot, so it cannot be a
    ///         requester.
    error AddressIsPayee(uint256 potId, address account);
    error RequestExpired(uint256 expiry, uint256 timestamp);
    error NonceAlreadyUsed(address signer, uint256 nonce);
    error InvalidSignature(uint256 potId, address signer);
    error CapExceeded(uint256 potId, uint256 spent, uint256 amount, uint256 cap);
    error InsufficientPotBalance(uint256 potId, uint256 balance, uint256 required);
    error ScheduleNotFound(uint256 scheduleId);
    error ScheduleNotActive(uint256 scheduleId);
    error ScheduleNotDue(uint256 scheduleId, uint256 nextDue, uint256 timestamp);
    error IntervalZero();
    error NoFeesToWithdraw();

    // --- Functions ---

    /// @notice Set the pot's spending cap per period.
    /// @dev R7. Pot owner only. Takes effect for the current period too.
    /// @param _potId Pot id.
    /// @param _cap MUSD base units per period; 0 blocks all spending.
    function setCap(uint256 _potId, uint256 _cap) external;

    /// @notice Approve `_payee` to receive money from the pot.
    /// @dev I5. Pot owner only. Reverts if already approved, zero, the vault
    ///      itself, or a registered requester of the pot.
    /// @param _potId Pot id.
    /// @param _payee Payee address.
    function addPayee(uint256 _potId, address _payee) external;

    /// @notice Remove an approved payee. Signed requests and schedules to it
    ///         stop settling immediately.
    /// @dev I5. Pot owner only. Reverts if not approved.
    /// @param _potId Pot id.
    /// @param _payee Payee address.
    function removePayee(uint256 _potId, address _payee) external;

    /// @notice Register `_requester` (the app-generated requester key,
    ///         ADR-012) on the pot so the contract can refuse to pay it.
    /// @dev Pot owner only. Reverts if already registered, zero, or an approved
    ///      payee of the pot. A requester never authorizes payments on-chain.
    /// @param _potId Pot id.
    /// @param _requester Requester address.
    function addRequester(uint256 _potId, address _requester) external;

    /// @notice Unregister a requester.
    /// @dev Pot owner only. Reverts if not registered.
    /// @param _potId Pot id.
    /// @param _requester Requester address.
    function removeRequester(uint256 _potId, address _requester) external;

    /// @notice Settle a sender-signed payment request. Callable by anyone
    ///         (normally the relayer).
    /// @dev R3, R4, R7, R8, I3, I4, I5, I6. Checks, in order: pot exists,
    ///      `block.timestamp <= expiry`, nonce unused for the pot owner, the
    ///      pot owner's EIP-712 signature over this exact request (EOA or
    ///      ERC-1271), payee approved and not a requester, amount > 0, spent
    ///      this period + amount <= cap, balance >= amount + fee. Then consumes
    ///      the nonce, debits amount + fee, records the fee for the relayer and
    ///      transfers `amount` MUSD to the payee. Any failure reverts the whole
    ///      call: no state changes and the nonce stays unused.
    /// @param _request The request the sender signed.
    /// @param _signature The sender's signature over {hashPaymentRequest}.
    function execute(PaymentRequest calldata _request, bytes calldata _signature) external;

    /// @notice Create a recurring allowance from the pot to an approved payee.
    /// @dev R9. Pot owner only. Creating it is the sender's approval for every
    ///      period's payment, so {executeSchedule} needs no signature.
    /// @param _potId Pot id.
    /// @param _payee Approved payee of the pot.
    /// @param _amount MUSD base units per period (> 0).
    /// @param _start Timestamp of the first due date (may be in the past).
    /// @param _interval Period length in seconds (> 0), e.g. 30 days.
    /// @return scheduleId The new schedule id (starts at 1).
    function createSchedule(uint256 _potId, address _payee, uint256 _amount, uint64 _start, uint64 _interval)
        external
        returns (uint256 scheduleId);

    /// @notice Cancel a schedule. Pot owner only.
    /// @param _scheduleId Schedule id.
    function cancelSchedule(uint256 _scheduleId) external;

    /// @notice Pay the current period of a schedule. Callable by anyone
    ///         (normally the relayer).
    /// @dev R4, R7, R9, I3, I5. Pays at most once per schedule period, only
    ///      when `block.timestamp >= nextDue`, only to the schedule's payee
    ///      (still approved, not a requester), within the pot cap, plus the
    ///      flat fee. Missed periods are skipped, never paid as a lump: a late
    ///      call pays the current period once.
    /// @param _scheduleId Schedule id.
    function executeSchedule(uint256 _scheduleId) external;

    /// @notice Send all unclaimed fees to the relayer. Callable by anyone.
    /// @dev R4. Reverts if there is nothing to withdraw.
    function claimFees() external;

    /// @notice EIP-712 digest the sender signs for `_request` (domain name
    ///         "Ipin", version "1", this chain, this contract).
    /// @param _request The payment request.
    /// @return The digest.
    function hashPaymentRequest(PaymentRequest calldata _request) external view returns (bytes32);

    /// @notice Whether `_payee` is approved for the pot.
    /// @param _potId Pot id.
    /// @param _payee Address.
    /// @return True if approved.
    function isPayee(uint256 _potId, address _payee) external view returns (bool);

    /// @notice Whether `_requester` is registered on the pot.
    /// @param _potId Pot id.
    /// @param _requester Address.
    /// @return True if registered.
    function isRequester(uint256 _potId, address _requester) external view returns (bool);

    /// @notice Whether `_signer` has used `_nonce` (R3, I4).
    /// @param _signer Pot owner whose namespace the nonce is in.
    /// @param _nonce Nonce.
    /// @return True if used.
    function nonceUsed(address _signer, uint256 _nonce) external view returns (bool);

    /// @notice MUSD paid from the pot in cap period `_period` (fees excluded).
    /// @param _potId Pot id.
    /// @param _period Cap period index.
    /// @return MUSD base units.
    function spent(uint256 _potId, uint256 _period) external view returns (uint256);

    /// @notice Current cap period index of the pot:
    ///         `(block.timestamp - createdAt) / PERIOD`.
    /// @param _potId Pot id.
    /// @return The period index.
    function currentPeriod(uint256 _potId) external view returns (uint256);

    /// @notice Cap headroom left in the current period.
    /// @param _potId Pot id.
    /// @return MUSD base units (0 if spent >= cap).
    function remainingCap(uint256 _potId) external view returns (uint256);

    /// @notice Full schedule record.
    /// @param _scheduleId Schedule id.
    /// @return The schedule (potId 0 if it does not exist).
    function getSchedule(uint256 _scheduleId) external view returns (Schedule memory);

    /// @notice Timestamp from which the schedule's next unpaid period is due.
    /// @param _scheduleId Schedule id.
    /// @return `start + nextPeriod * interval`.
    function nextDue(uint256 _scheduleId) external view returns (uint256);

    /// @notice Number of schedules created; ids run 1..scheduleCount.
    /// @return The schedule count.
    function scheduleCount() external view returns (uint256);

    /// @notice Fees charged but not yet withdrawn by the relayer (I1 line).
    /// @return MUSD base units.
    function unclaimedFees() external view returns (uint256);

    /// @notice Flat fee per settled payment (ADR-002).
    /// @return MUSD base units.
    function fee() external view returns (uint256);

    /// @notice Address that receives withdrawn fees (the relayer).
    /// @return The relayer address.
    function relayerAddress() external view returns (address);

    /// @notice Cap period length: 30 days (ADR-003).
    /// @return Seconds.
    function PERIOD() external view returns (uint256);

    /// @notice Item hash of an itemized request (docs/api.md section 2).
    /// @param _item Item description.
    /// @param _quantity Number of units.
    /// @param _unitPrice MUSD base units per unit.
    /// @param _vendor Vendor name.
    /// @return keccak256(abi.encode(_item, _quantity, _unitPrice, _vendor)).
    function itemHash(string calldata _item, uint256 _quantity, uint256 _unitPrice, string calldata _vendor)
        external
        pure
        returns (bytes32);
}
