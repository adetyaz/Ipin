// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title Pots
/// @notice Pots, split rules, deposits and the books (I1). Holds all pot MUSD. Money only enters
///         here; it leaves only through the PolicyEngine (CLAUDE.md non-negotiable 2, S17).
/// @dev No admin. A pot's owner (its sender) is the only one who configures it.
abstract contract Pots is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @param owner The pot's sender: the only address that configures it or signs its requests.
    /// @param createdAt Start of period 0 (R7, ADR-003).
    /// @param balance Spendable MUSD base units.
    /// @param cap Spending cap per period, MUSD base units (R7).
    struct Pot {
        address owner;
        uint64 createdAt;
        uint256 balance;
        uint256 cap;
    }

    /// @param owner Only the owner may deposit through this split.
    /// @param remainderPotId Pot that receives the split remainder (R2); one of `potIds`.
    /// @param potIds Pots credited, all owned by `owner`.
    /// @param bps Weight per pot in basis points; each > 0, sum == 10_000.
    struct Split {
        address owner;
        uint256 remainderPotId;
        uint256[] potIds;
        uint16[] bps;
    }

    uint256 public constant BPS_TOTAL = 10_000;
    uint256 public constant MAX_SPLIT_POTS = 10;

    /// @notice The MUSD token (18 decimals).
    IERC20 public immutable musd;

    /// @dev Ledger line of I1. Every change to a pot balance goes through it. Pending (R5) and
    ///      unclaimed fees (R4) become ledger lines when settlement lands.
    uint256 internal _totalPotBalance;

    uint256 private _potCount;
    uint256 private _splitCount;
    uint256 private _depositCount;
    mapping(uint256 potId => Pot pot) internal _pots;
    mapping(uint256 splitId => Split split) private _splits;

    event PotCreated(uint256 indexed potId, address indexed owner, uint256 cap);
    event SplitCreated(
        uint256 indexed splitId, address indexed owner, uint256[] potIds, uint16[] bps, uint256 remainderPotId
    );
    event Deposited(uint256 indexed depositId, uint256 indexed splitId, address indexed from, uint256 amount);
    /// @dev One per pot per deposit; the remainder is included in the remainder pot's credit, so
    ///      for each deposit Σ PotCredited.amount == Deposited.amount (I2).
    event PotCredited(uint256 indexed potId, uint256 indexed depositId, uint256 amount);
    /// @dev Informational: the part of the remainder pot's credit that is split remainder (R2).
    event RemainderCredited(uint256 indexed potId, uint256 indexed depositId, uint256 amount);

    error PotNotFound(uint256 potId);
    error NotPotOwner(uint256 potId, address caller);
    error SplitNotFound(uint256 splitId);
    error NotSplitOwner(uint256 splitId, address caller);
    error SplitLengthInvalid(uint256 length, uint256 max);
    error SplitArrayMismatch(uint256 potCount, uint256 weightCount);
    error SplitWeightsInvalid(uint256 sum);
    error ZeroWeight(uint256 index);
    error DuplicatePot(uint256 potId);
    error RemainderPotNotInSplit(uint256 potId);
    error ZeroAmount();

    modifier onlyPotOwner(uint256 potId) {
        _requirePotOwner(potId);
        _;
    }

    constructor(IERC20 musd_) {
        musd = musd_;
    }

    /// @notice Create a pot owned by the caller (the sender).
    /// @dev R7: `cap` limits spending per period; 0 means nothing can leave until it is raised.
    /// @param cap Spending cap per period, MUSD base units.
    /// @return potId The new pot id (starts at 1).
    function createPot(uint256 cap) external returns (uint256 potId) {
        potId = ++_potCount;
        _pots[potId] = Pot({owner: msg.sender, createdAt: SafeCast.toUint64(block.timestamp), balance: 0, cap: cap});
        emit PotCreated(potId, msg.sender, cap);
    }

    /// @notice Create a split rule over the caller's pots.
    /// @dev R2: weights are basis points, each > 0, summing to exactly 10_000; pots distinct and
    ///      owned by the caller; the remainder pot is one of them.
    /// @param potIds Pots to credit (1..MAX_SPLIT_POTS).
    /// @param bps Weight per pot, basis points.
    /// @param remainderPotId Pot that receives the rounding remainder of each deposit.
    /// @return splitId The new split id (starts at 1).
    function createSplit(uint256[] calldata potIds, uint16[] calldata bps, uint256 remainderPotId)
        external
        returns (uint256 splitId)
    {
        uint256 n = potIds.length;
        if (n == 0 || n > MAX_SPLIT_POTS) revert SplitLengthInvalid(n, MAX_SPLIT_POTS);
        if (bps.length != n) revert SplitArrayMismatch(n, bps.length);
        uint256 sum = 0;
        bool remainderListed = false;
        for (uint256 i = 0; i < n; ++i) {
            uint256 potId = potIds[i];
            _requirePotOwner(potId);
            if (bps[i] == 0) revert ZeroWeight(i);
            for (uint256 j = 0; j < i; ++j) {
                if (potIds[j] == potId) revert DuplicatePot(potId);
            }
            if (potId == remainderPotId) remainderListed = true;
            sum += bps[i];
        }
        if (sum != BPS_TOTAL) revert SplitWeightsInvalid(sum);
        if (!remainderListed) revert RemainderPotNotInSplit(remainderPotId);

        splitId = ++_splitCount;
        _splits[splitId] = Split({owner: msg.sender, remainderPotId: remainderPotId, potIds: potIds, bps: bps});
        emit SplitCreated(splitId, msg.sender, potIds, bps, remainderPotId);
    }

    /// @notice Deposit MUSD (pre-approved) and split it across the split's pots.
    /// @dev R1, R2, I2. Only the split's owner may deposit (one sender per pot in Wave 1).
    /// @param splitId Split rule to apply.
    /// @param amount MUSD base units.
    function deposit(uint256 splitId, uint256 amount) external nonReentrant {
        _creditDeposit(splitId, amount);
        musd.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Deposit MUSD using an EIP-2612 permit instead of a prior approval.
    /// @dev R1, R2, I2. The permit is only submitted if the allowance does not already cover
    ///      `amount`, so a front-run permit cannot block the deposit.
    /// @param splitId Split rule to apply.
    /// @param amount MUSD base units (also the permit value).
    /// @param deadline Permit deadline.
    /// @param v Permit signature v.
    /// @param r Permit signature r.
    /// @param s Permit signature s.
    function depositWithPermit(uint256 splitId, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        _creditDeposit(splitId, amount);
        // Interactions last (CEI). Skip the permit if the allowance already covers the deposit
        // (e.g. the permit was front-run and already used); otherwise a bad permit reverts the
        // whole deposit, credits included.
        if (musd.allowance(msg.sender, address(this)) < amount) {
            IERC20Permit(address(musd)).permit(msg.sender, address(this), amount, deadline, v, r, s);
        }
        musd.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Spendable balance of a pot.
    /// @param potId Pot id.
    /// @return MUSD base units.
    function potBalance(uint256 potId) external view returns (uint256) {
        return _pots[potId].balance;
    }

    /// @notice Full pot record.
    /// @param potId Pot id.
    /// @return The pot (owner is zero if it does not exist).
    function getPot(uint256 potId) external view returns (Pot memory) {
        return _pots[potId];
    }

    /// @notice Full split record.
    /// @param splitId Split id.
    /// @return The split (owner is zero if it does not exist).
    function getSplit(uint256 splitId) external view returns (Split memory) {
        return _splits[splitId];
    }

    /// @notice I1: every liability is backed by an asset the vault holds.
    /// @dev Assets = MUSD held + savings principal (sMUSD is 1:1 with principal). Liabilities =
    ///      Σ pot balances + Σ pot savings (+ Σ pending + unclaimed fees once R4/R5 land). Assets
    ///      above liabilities are an explicit surplus line ({surplus}), owed to no pot: MUSD sent to
    ///      the vault without `deposit`, and later realized savings yield. See docs/money-rules.md I1.
    /// @return True iff assets >= liabilities.
    function booksBalance() public view returns (bool) {
        return totalAssets() >= totalLiabilities();
    }

    /// @notice MUSD the vault holds plus its savings principal.
    /// @return MUSD base units.
    function totalAssets() public view returns (uint256) {
        return musd.balanceOf(address(this)) + _savingsPrincipal();
    }

    /// @notice Everything the vault owes: pots and pot savings. Pending payouts (R5) and unclaimed
    ///      fees (R4) are added here when settlement lands.
    /// @return MUSD base units.
    function totalLiabilities() public view returns (uint256) {
        return _totalPotBalance + _totalSaved();
    }

    /// @notice Unallocated surplus: assets the vault holds that no ledger line owes (I1).
    /// @return MUSD base units (0 if the books are short, which `booksBalance` reports).
    function surplus() public view returns (uint256) {
        uint256 assets = totalAssets();
        uint256 liabilities = totalLiabilities();
        return assets > liabilities ? assets - liabilities : 0;
    }

    /// @dev Checks and effects of a deposit (R1, R2, I2). The caller must then pull `amount` MUSD
    ///      from `msg.sender`; the transfer reverting undoes the credits.
    function _creditDeposit(uint256 splitId, uint256 amount) internal {
        Split storage split = _splits[splitId];
        if (split.owner == address(0)) revert SplitNotFound(splitId);
        if (split.owner != msg.sender) revert NotSplitOwner(splitId, msg.sender);
        if (amount == 0) revert ZeroAmount();

        uint256 depositId = ++_depositCount;
        uint256 n = split.potIds.length;
        uint256[] memory pieces = new uint256[](n);
        uint256 credited = 0;
        for (uint256 i = 0; i < n; ++i) {
            pieces[i] = amount * split.bps[i] / BPS_TOTAL; // rounds down; remainder handled below
            credited += pieces[i];
        }
        uint256 remainder = amount - credited; // R2: 0 <= remainder < n
        uint256 remainderPotId = split.remainderPotId;

        emit Deposited(depositId, splitId, msg.sender, amount);
        for (uint256 i = 0; i < n; ++i) {
            uint256 potId = split.potIds[i];
            uint256 credit = pieces[i];
            if (potId == remainderPotId) {
                credit += remainder;
                if (remainder > 0) emit RemainderCredited(potId, depositId, remainder);
            }
            _pots[potId].balance += credit;
            emit PotCredited(potId, depositId, credit);
        }
        _totalPotBalance += amount;
    }

    function _requirePotOwner(uint256 potId) internal view {
        address owner = _pots[potId].owner;
        if (owner == address(0)) revert PotNotFound(potId);
        if (owner != msg.sender) revert NotPotOwner(potId, msg.sender);
    }

    /// @dev R10 seam (not implemented in this wave): the vault's sMUSD balance, which is 1:1 with
    ///      MUSD principal. Savings yield is paid in MUSD and lands in the MUSD balance, so it
    ///      shows up as surplus until an allocation rule assigns it.
    function _savingsPrincipal() internal view virtual returns (uint256) {
        return 0;
    }

    /// @dev R10 seam: Σ pot.saved, the savings principal still credited to pots.
    function _totalSaved() internal view virtual returns (uint256) {
        return 0;
    }
}
