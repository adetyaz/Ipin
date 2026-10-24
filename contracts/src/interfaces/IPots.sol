// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IPots
/// @notice Pots, split rules, deposits and the books (I1). All amounts are MUSD
///         base units, 18 decimals (R1).
interface IPots {
    /// @param owner The pot's sender: the only address that configures it or
    ///        signs its requests.
    /// @param createdAt Start of period 0 (R7, ADR-003).
    /// @param name Display label chosen by the sender, e.g. "House" or
    ///        "Upkeep" (UTF-8, right-padded with zeros to 32 bytes).
    /// @param balance Spendable MUSD base units.
    /// @param cap Spending cap per period, MUSD base units (R7).
    struct Pot {
        address owner;
        uint64 createdAt;
        bytes32 name;
        uint256 balance;
        uint256 cap;
    }

    /// @param owner Only the owner may deposit through this split.
    /// @param remainderPotId Pot that receives the split remainder (R2); one of
    ///        `potIds`.
    /// @param potIds Pots credited, all owned by `owner`.
    /// @param bps Weight per pot in basis points; each > 0, sum == 10_000.
    struct Split {
        address owner;
        uint256 remainderPotId;
        uint256[] potIds;
        uint16[] bps;
    }

    // --- Events ---

    event PotCreated(uint256 indexed potId, address indexed owner, bytes32 name, uint256 cap);
    event SplitCreated(
        uint256 indexed splitId, address indexed owner, uint256[] potIds, uint16[] bps, uint256 remainderPotId
    );
    event Deposited(uint256 indexed depositId, uint256 indexed splitId, address indexed from, uint256 amount);
    /// @dev One per pot per deposit; the remainder is included in the remainder
    ///      pot's credit, so for each deposit Σ PotCredited.amount ==
    ///      Deposited.amount (I2).
    event PotCredited(uint256 indexed potId, uint256 indexed depositId, uint256 amount);
    /// @dev Informational: the part of the remainder pot's credit that is split
    ///      remainder (R2).
    event RemainderCredited(uint256 indexed potId, uint256 indexed depositId, uint256 amount);

    // --- Errors ---

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

    // --- Functions ---

    /// @notice Create a pot owned by the caller (the sender).
    /// @dev R7: `_cap` limits spending per period; 0 means nothing can leave
    ///      until it is raised.
    /// @param _name Display label, e.g. "House" (UTF-8, zero-padded bytes32).
    /// @param _cap Spending cap per period, MUSD base units.
    /// @return potId The new pot id (starts at 1).
    function createPot(bytes32 _name, uint256 _cap) external returns (uint256 potId);

    /// @notice Create a split rule over the caller's pots.
    /// @dev R2: weights are basis points, each > 0, summing to exactly 10_000;
    ///      pots distinct and owned by the caller; the remainder pot is one of
    ///      them.
    /// @param _potIds Pots to credit (1..MAX_SPLIT_POTS).
    /// @param _bps Weight per pot, basis points.
    /// @param _remainderPotId Pot that receives the rounding remainder of each
    ///        deposit.
    /// @return splitId The new split id (starts at 1).
    function createSplit(uint256[] calldata _potIds, uint16[] calldata _bps, uint256 _remainderPotId)
        external
        returns (uint256 splitId);

    /// @notice Deposit MUSD (pre-approved) and split it across the split's pots.
    /// @dev R1, R2, I2. Only the split's owner may deposit (one sender per pot in
    ///      Wave 1).
    /// @param _splitId Split rule to apply.
    /// @param _amount MUSD base units.
    function deposit(uint256 _splitId, uint256 _amount) external;

    /// @notice Deposit MUSD using an EIP-2612 permit instead of a prior approval.
    /// @dev R1, R2, I2. The permit is only submitted if the allowance does not
    ///      already cover `_amount`, so a front-run permit cannot block the
    ///      deposit.
    /// @param _splitId Split rule to apply.
    /// @param _amount MUSD base units (also the permit value).
    /// @param _deadline Permit deadline.
    /// @param _v Permit signature v.
    /// @param _r Permit signature r.
    /// @param _s Permit signature s.
    function depositWithPermit(uint256 _splitId, uint256 _amount, uint256 _deadline, uint8 _v, bytes32 _r, bytes32 _s)
        external;

    /// @notice Spendable balance of a pot.
    /// @param _potId Pot id.
    /// @return MUSD base units.
    function potBalance(uint256 _potId) external view returns (uint256);

    /// @notice Number of pots created; pot ids run 1..potCount.
    /// @return The pot count.
    function potCount() external view returns (uint256);

    /// @notice Number of splits created; split ids run 1..splitCount.
    /// @return The split count.
    function splitCount() external view returns (uint256);

    /// @notice Full pot record.
    /// @param _potId Pot id.
    /// @return The pot (owner is zero if it does not exist).
    function getPot(uint256 _potId) external view returns (Pot memory);

    /// @notice Full split record.
    /// @param _splitId Split id.
    /// @return The split (owner is zero if it does not exist).
    function getSplit(uint256 _splitId) external view returns (Split memory);

    /// @notice I1: every liability is backed by an asset the vault holds.
    /// @dev Assets above liabilities are an explicit surplus line, owed to no
    ///      pot. See docs/money-rules.md I1.
    /// @return True iff assets >= liabilities.
    function booksBalance() external view returns (bool);

    /// @notice MUSD the vault holds plus its savings principal.
    /// @return MUSD base units.
    function totalAssets() external view returns (uint256);

    /// @notice Everything the vault owes.
    /// @return MUSD base units.
    function totalLiabilities() external view returns (uint256);

    /// @notice Unallocated surplus: assets no ledger line owes (I1).
    /// @return MUSD base units (0 if the books are short).
    function surplus() external view returns (uint256);
}
