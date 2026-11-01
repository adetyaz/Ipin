// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Pots} from "./Pots.sol";
import {IMUSDSavingsRate} from "./interfaces/IMUSDSavingsRate.sol";
import {ISavings} from "./interfaces/ISavings.sol";

/// @title Savings
/// @notice R10: idle pot money earns in Mezo's MUSD savings vault (sMUSD).
///         The Vault is the single sMUSD holder; each pot's share is kept
///         here. Money never leaves the pot's credit: it moves between the
///         pot's spendable balance and its savings, and back.
/// @dev ADR-019. Yield uses an index, like sMUSD itself: harvested MUSD raises
///      `_yieldIndex` by amount / totalSaved, and each pot is credited
///      saved × (index − its snapshot) when it is touched. Every division rounds
///      down, so the sum credited never exceeds what was harvested (I1).
///      Moving money harvests first, so a new saver never takes yield earned
///      before it joined. Admin powers: none; the savings vault is immutable.
abstract contract Savings is ISavings, Pots {
    using SafeERC20 for IERC20;

    uint256 private constant _INDEX_SCALE = 1e18;

    /// @inheritdoc ISavings
    address public immutable savingsRate;
    /// @inheritdoc ISavings
    uint256 public totalSaved;
    /// @inheritdoc ISavings
    uint256 public totalYieldHarvested;
    /// @inheritdoc ISavings
    uint256 public totalYieldCredited;

    mapping(uint256 potId => uint256 amount) private _saved;
    mapping(uint256 potId => uint256 index) private _indexOf;
    uint256 private _yieldIndex;

    /// @param _savingsRate Mezo's MUSDSavingsRate, or address(0) to disable.
    // forge-lint: disable-next-line(missing-zero-check) address(0) disables savings.
    constructor(address _savingsRate) {
        savingsRate = _savingsRate;
    }

    // --- Sender actions ---

    /// @inheritdoc ISavings
    function moveToSavings(uint256 _potId, uint256 _amount) external nonReentrant onlyPotOwner(_potId) {
        IMUSDSavingsRate vault = _requireSavings();
        if (_amount == 0) revert ZeroAmount();
        uint256 balance = _pots[_potId].balance;
        if (_amount > balance) revert InsufficientBalance(_potId, balance, _amount);
        _harvest(vault);
        _accrue(_potId);

        _pots[_potId].balance = balance - _amount;
        totalPotBalance -= _amount;
        _saved[_potId] += _amount;
        totalSaved += _amount;
        // forge-lint: disable-next-line(reentrancy-events) harvest-first order, ADR-019; nonReentrant.
        emit SavingsDeposited(_potId, _amount);

        musd.forceApprove(address(vault), _amount);
        vault.deposit(_amount);
    }

    /// @inheritdoc ISavings
    function withdrawFromSavings(uint256 _potId, uint256 _amount) external nonReentrant onlyPotOwner(_potId) {
        IMUSDSavingsRate vault = _requireSavings();
        if (_amount == 0) revert ZeroAmount();
        uint256 saved = _saved[_potId];
        if (_amount > saved) revert InsufficientSaved(_potId, saved, _amount);
        _harvest(vault);
        _accrue(_potId);

        _saved[_potId] = saved - _amount;
        totalSaved -= _amount;
        _pots[_potId].balance += _amount;
        totalPotBalance += _amount;
        // forge-lint: disable-next-line(reentrancy-events) harvest-first order, ADR-019; nonReentrant.
        emit SavingsWithdrawn(_potId, _amount);

        uint256 before = musd.balanceOf(address(this));
        // forge-lint: disable-next-line(reentrancy-no-eth) yield known only after it; nonReentrant.
        vault.withdraw(_amount);
        uint256 received = musd.balanceOf(address(this)) - before;
        if (received < _amount) revert SavingsShortfall(_amount, received);
        // withdraw() also pays any yield accrued since the harvest above.
        _distribute(received - _amount);
    }

    /// @inheritdoc ISavings
    function harvestYield() external nonReentrant {
        _harvest(_requireSavings());
    }

    // --- Views ---

    /// @inheritdoc ISavings
    function savedOf(uint256 _potId) external view returns (uint256) {
        return _saved[_potId];
    }

    /// @inheritdoc ISavings
    function pendingYield(uint256 _potId) public view returns (uint256) {
        return _saved[_potId] * (_yieldIndex - _indexOf[_potId]) / _INDEX_SCALE;
    }

    // --- Helper functions ---

    /// @dev Claim yield from the savings vault and owe it to saving pots. The
    ///      external call comes first because what to distribute is only known
    ///      after it; every caller is `nonReentrant`.
    function _harvest(IMUSDSavingsRate _vault) internal {
        if (totalSaved == 0) return;
        uint256 before = musd.balanceOf(address(this));
        // forge-lint: disable-next-line(reentrancy-no-eth, unused-return) balance delta; nonReentrant.
        _vault.claimYield();
        _distribute(musd.balanceOf(address(this)) - before);
    }

    /// @dev Raise the index by `_amount` / totalSaved. With nothing saved, the
    ///      MUSD stays in the vault as surplus (I1), owed to no pot.
    function _distribute(uint256 _amount) internal {
        if (_amount == 0 || totalSaved == 0) return;
        totalYieldHarvested += _amount;
        _yieldIndex += _amount * _INDEX_SCALE / totalSaved;
        // forge-lint: disable-next-line(reentrancy-events) amount known only now; nonReentrant.
        emit YieldHarvested(_amount);
    }

    /// @dev Add a pot's share of harvested yield to its balance.
    function _accrue(uint256 _potId) internal {
        uint256 owed = pendingYield(_potId);
        _indexOf[_potId] = _yieldIndex;
        if (owed == 0) return;
        _pots[_potId].balance += owed;
        totalPotBalance += owed;
        totalYieldCredited += owed;
        // forge-lint: disable-next-line(reentrancy-events) harvest-first order, ADR-019; nonReentrant.
        emit YieldCredited(_potId, owed);
    }

    function _requireSavings() internal view returns (IMUSDSavingsRate) {
        if (savingsRate == address(0)) revert SavingsDisabled();
        return IMUSDSavingsRate(savingsRate);
    }

    /// @dev sMUSD shares are 1:1 with MUSD principal (I1 assets).
    function _savingsPrincipal() internal view virtual override returns (uint256) {
        return savingsRate == address(0) ? 0 : IMUSDSavingsRate(savingsRate).balanceOf(address(this));
    }

    /// @dev Savings stay owed to their pots (I1 liabilities).
    function _totalSaved() internal view virtual override returns (uint256) {
        return totalSaved;
    }
}
