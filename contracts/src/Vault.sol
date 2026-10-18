// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Pots} from "./Pots.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Vault
/// @notice Ìpín vault: pots and split rules in MUSD.
/// @dev Admin powers: none. No function lets anyone but the policy path move pot money.
contract Vault is Pots {
    /// @param musd_ The MUSD token.
    constructor(IERC20 musd_) Pots(musd_) {}
}
