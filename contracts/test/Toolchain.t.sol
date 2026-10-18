// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Toolchain smoke test: proves remappings resolve and the pinned compiler/EVM build.
/// @dev Not a money-rule test. Delete once real rule tests (test_R*/invariant_I*) exist.
contract ToolchainTest is Test {
    function test_toolchain_remappingsResolve() public pure {
        assertGt(bytes(type(ReentrancyGuard).name).length, 0);
        assertGt(bytes(type(SafeERC20).name).length, 0);
    }
}
