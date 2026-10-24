// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Test stand-in for MUSD: 18 decimals, EIP-2612 permit, EIP-712 domain
///         name "Mezo USD" and version "1" like the real token. Anyone may mint (test only).
contract MockMUSD is ERC20, ERC20Permit {
    constructor() ERC20("Mezo USD", "MUSD") ERC20Permit("Mezo USD") {}

    /// @notice Mint test MUSD.
    /// @param _to Recipient.
    /// @param _amount Base units.
    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}
