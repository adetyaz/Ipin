// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IMUSDSavingsRate} from "../../src/interfaces/IMUSDSavingsRate.sol";
import {MockMUSD} from "./MockMUSD.sol";

/// @notice Test double of Mezo's `MUSDSavingsRate` with the same observable
///         behaviour: 1:1 shares, yield paid in MUSD by `claimYield()` and
///         automatically inside `withdraw()`.
contract MockSavingsRate is IMUSDSavingsRate {
    MockMUSD public immutable musd;

    mapping(address account => uint256 shares) public balanceOf;
    mapping(address account => uint256 amount) public claimable;

    error InsufficientShares(uint256 have, uint256 want);
    error TransferFailed();

    constructor(MockMUSD _musd) {
        musd = _musd;
    }

    function deposit(uint256 _amount) external {
        balanceOf[msg.sender] += _amount;
        if (!musd.transferFrom(msg.sender, address(this), _amount)) revert TransferFailed();
    }

    function withdraw(uint256 _amount) external {
        uint256 have = balanceOf[msg.sender];
        if (have < _amount) revert InsufficientShares(have, _amount);
        balanceOf[msg.sender] = have - _amount;
        uint256 yield = claimable[msg.sender];
        claimable[msg.sender] = 0;
        if (!musd.transfer(msg.sender, _amount + yield)) revert TransferFailed();
    }

    function claimYield() external returns (uint256 yield) {
        yield = claimable[msg.sender];
        claimable[msg.sender] = 0;
        if (!musd.transfer(msg.sender, yield)) revert TransferFailed();
    }

    /// @notice Test helper: protocol yield accrues to `_holder`.
    function addYield(address _holder, uint256 _amount) external {
        musd.mint(address(this), _amount);
        claimable[_holder] += _amount;
    }
}
