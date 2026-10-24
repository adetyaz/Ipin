// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IPots} from "./interfaces/IPots.sol";

/// @title Pots
/// @notice Pots, split rules, deposits and the books (I1). Holds all pot MUSD.
///         Money only enters here; it leaves only through the PolicyEngine
///         (CLAUDE.md non-negotiable 2, S17).
/// @dev No admin. A pot's owner (its sender) is the only one who configures it.
abstract contract Pots is IPots, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_TOTAL = 10_000;
    uint256 public constant MAX_SPLIT_POTS = 10;

    /// @notice The MUSD token (18 decimals).
    IERC20 public immutable musd;

    /// @notice Number of pots created; pot ids run 1..potCount.
    uint256 public potCount;
    /// @notice Number of splits created; split ids run 1..splitCount.
    uint256 public splitCount;
    /// @notice Number of deposits made; deposit ids run 1..depositCount.
    uint256 public depositCount;
    /// @notice Ledger line of I1: Σ pot balances. Every change to a pot balance
    ///         goes through it.
    uint256 public totalPotBalance;

    mapping(uint256 potId => Pot pot) internal _pots;
    mapping(uint256 splitId => Split split) private _splits;

    modifier onlyPotOwner(uint256 _potId) {
        _requirePotOwner(_potId);
        _;
    }

    /// @param _musd The MUSD token.
    constructor(IERC20 _musd) {
        musd = _musd;
    }

    // --- Pots and splits ---

    /// @inheritdoc IPots
    function createPot(bytes32 _name, uint256 _cap) external returns (uint256 potId) {
        potId = ++potCount;
        _pots[potId] =
            Pot({owner: msg.sender, createdAt: SafeCast.toUint64(block.timestamp), name: _name, balance: 0, cap: _cap});
        emit PotCreated(potId, msg.sender, _name, _cap);
    }

    /// @inheritdoc IPots
    function createSplit(uint256[] calldata _potIds, uint16[] calldata _bps, uint256 _remainderPotId)
        external
        returns (uint256 splitId)
    {
        uint256 n = _potIds.length;
        if (n == 0 || n > MAX_SPLIT_POTS) {
            revert SplitLengthInvalid(n, MAX_SPLIT_POTS);
        }
        if (_bps.length != n) revert SplitArrayMismatch(n, _bps.length);
        uint256 sum = 0;
        bool remainderListed = false;
        for (uint256 i = 0; i < n; ++i) {
            uint256 potId = _potIds[i];
            _requirePotOwner(potId);
            if (_bps[i] == 0) revert ZeroWeight(i);
            for (uint256 j = 0; j < i; ++j) {
                if (_potIds[j] == potId) revert DuplicatePot(potId);
            }
            if (potId == _remainderPotId) remainderListed = true;
            sum += _bps[i];
        }
        if (sum != BPS_TOTAL) revert SplitWeightsInvalid(sum);
        if (!remainderListed) revert RemainderPotNotInSplit(_remainderPotId);

        splitId = ++splitCount;
        _splits[splitId] = Split({owner: msg.sender, remainderPotId: _remainderPotId, potIds: _potIds, bps: _bps});
        emit SplitCreated(splitId, msg.sender, _potIds, _bps, _remainderPotId);
    }

    // --- Deposits ---

    /// @inheritdoc IPots
    function deposit(uint256 _splitId, uint256 _amount) external nonReentrant {
        _creditDeposit(_splitId, _amount);
        musd.safeTransferFrom(msg.sender, address(this), _amount);
    }

    /// @inheritdoc IPots
    function depositWithPermit(uint256 _splitId, uint256 _amount, uint256 _deadline, uint8 _v, bytes32 _r, bytes32 _s)
        external
        nonReentrant
    {
        _creditDeposit(_splitId, _amount);
        // Interactions last (CEI). Skip the permit if the allowance already
        // covers the deposit (e.g. the permit was front-run and already used);
        // otherwise a bad permit reverts the whole deposit, credits included.
        if (musd.allowance(msg.sender, address(this)) < _amount) {
            IERC20Permit(address(musd)).permit(msg.sender, address(this), _amount, _deadline, _v, _r, _s);
        }
        musd.safeTransferFrom(msg.sender, address(this), _amount);
    }

    // --- Views ---

    /// @inheritdoc IPots
    function potBalance(uint256 _potId) external view returns (uint256) {
        return _pots[_potId].balance;
    }

    /// @inheritdoc IPots
    function getPot(uint256 _potId) external view returns (Pot memory) {
        return _pots[_potId];
    }

    /// @inheritdoc IPots
    function getSplit(uint256 _splitId) external view returns (Split memory) {
        return _splits[_splitId];
    }

    /// @inheritdoc IPots
    function booksBalance() public view returns (bool) {
        return totalAssets() >= totalLiabilities();
    }

    /// @inheritdoc IPots
    function totalAssets() public view returns (uint256) {
        return musd.balanceOf(address(this)) + _savingsPrincipal();
    }

    /// @inheritdoc IPots
    /// @dev Σ pot balances + Σ pot savings.
    function totalLiabilities() public view returns (uint256) {
        return totalPotBalance + _totalSaved();
    }

    /// @inheritdoc IPots
    function surplus() public view returns (uint256) {
        uint256 assets = totalAssets();
        uint256 liabilities = totalLiabilities();
        return assets > liabilities ? assets - liabilities : 0;
    }

    // --- Helper functions ---

    /// @dev Checks and effects of a deposit (R1, R2, I2). The caller must then
    ///      pull `_amount` MUSD from `msg.sender`; the transfer reverting undoes
    ///      the credits.
    function _creditDeposit(uint256 _splitId, uint256 _amount) internal {
        Split storage split = _splits[_splitId];
        if (split.owner == address(0)) revert SplitNotFound(_splitId);
        if (split.owner != msg.sender) {
            revert NotSplitOwner(_splitId, msg.sender);
        }
        if (_amount == 0) revert ZeroAmount();

        uint256 depositId = ++depositCount;
        uint256 n = split.potIds.length;
        uint256[] memory pieces = new uint256[](n);
        uint256 credited = 0;
        for (uint256 i = 0; i < n; ++i) {
            // Rounds down; the remainder is handled below (R2).
            pieces[i] = _amount * split.bps[i] / BPS_TOTAL;
            credited += pieces[i];
        }
        uint256 remainder = _amount - credited; // R2: 0 <= remainder < n
        uint256 remainderPotId = split.remainderPotId;

        emit Deposited(depositId, _splitId, msg.sender, _amount);
        for (uint256 i = 0; i < n; ++i) {
            uint256 potId = split.potIds[i];
            uint256 credit = pieces[i];
            if (potId == remainderPotId) {
                credit += remainder;
                if (remainder > 0) {
                    emit RemainderCredited(potId, depositId, remainder);
                }
            }
            _pots[potId].balance += credit;
            emit PotCredited(potId, depositId, credit);
        }
        totalPotBalance += _amount;
    }

    function _requirePotOwner(uint256 _potId) internal view {
        address owner = _pots[_potId].owner;
        if (owner == address(0)) revert PotNotFound(_potId);
        if (owner != msg.sender) revert NotPotOwner(_potId, msg.sender);
    }

    /// @dev R10 seam (not implemented in this wave): the vault's sMUSD balance,
    ///      which is 1:1 with MUSD principal.
    function _savingsPrincipal() internal view virtual returns (uint256) {
        return 0;
    }

    /// @dev R10 seam: Σ pot.saved, the savings principal still credited to pots.
    function _totalSaved() internal view virtual returns (uint256) {
        return 0;
    }
}
