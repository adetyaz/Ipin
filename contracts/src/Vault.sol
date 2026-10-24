// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PolicyEngine} from "./PolicyEngine.sol";
import {Pots} from "./Pots.sol";

/// @title Vault
/// @notice The one deployed Ìpín contract: pots, splits and deposits in MUSD
///         ({Pots}) plus the policy engine, the only way money leaves a pot
///         ({PolicyEngine}). Implements IPots and IPolicyEngine.
/// @dev Admin powers: none. No owner, no upgrade, no sweep (S13). The only
///      outflows are {execute}, {executeSchedule} (to approved payees) and
///      {claimFees} (fees already earned, to the immutable relayer).
contract Vault is PolicyEngine {
    /// @param _musd The MUSD token.
    /// @param _relayerAddress Receives withdrawn fees.
    /// @param _fee Flat fee per settled payment in MUSD base units
    ///        (0 < fee <= 1e18; ADR-002 default 0.25e18).
    constructor(IERC20 _musd, address _relayerAddress, uint256 _fee) PolicyEngine(_relayerAddress, _fee) Pots(_musd) {}
}
