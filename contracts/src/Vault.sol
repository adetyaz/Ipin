// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";

import {PolicyEngine} from "./PolicyEngine.sol";
import {Pots} from "./Pots.sol";
import {Savings} from "./Savings.sol";

/// @title Vault
/// @notice The one deployed Ìpín contract: pots, splits and deposits in MUSD
///         ({Pots}) plus the policy engine, the only way money leaves a pot
///         ({PolicyEngine}). Implements IPots and IPolicyEngine.
/// @dev Admin powers: none. No owner, no upgrade, no sweep (S13). The only
///      outflows are {execute}, {executeSchedule} (to approved payees) and
///      {claimFees} (fees already earned, to the immutable relayer).
///      Savings (R10) moves MUSD between the Vault and Mezo's sMUSD vault,
///      always credited to the same pot; it is not an outflow from a pot.
///      {multicall} (OZ) batches the sender's setup into one transaction. Each
///      inner call is a self-delegatecall with the caller's msg.sender, so it
///      passes exactly the checks it would pass alone; it adds no outflow.
contract Vault is PolicyEngine, Savings, Multicall {
    /// @param _musd The MUSD token.
    /// @param _relayerAddress Receives withdrawn fees.
    /// @param _fee Flat fee per settled payment in MUSD base units
    ///        (0 < fee <= 1e18; ADR-002 default 0.25e18).
    /// @param _savingsRate Mezo's MUSDSavingsRate (sMUSD) for idle pots (R10),
    ///        or address(0) to disable savings.
    constructor(IERC20 _musd, address _relayerAddress, uint256 _fee, address _savingsRate)
        PolicyEngine(_relayerAddress, _fee)
        Savings(_savingsRate)
        Pots(_musd)
    {}

    /// @dev Savings counts the sMUSD position (I1 assets).
    function _savingsPrincipal() internal view override(Pots, Savings) returns (uint256) {
        return Savings._savingsPrincipal();
    }

    /// @dev Savings counts what pots have saved (I1 liabilities).
    function _totalSaved() internal view override(Pots, Savings) returns (uint256) {
        return Savings._totalSaved();
    }
}
