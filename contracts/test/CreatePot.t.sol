// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPots} from "../src/interfaces/IPots.sol";
import {IpinTest} from "./utils/IpinTest.sol";

/// @notice createPot: named pots ("House", "Upkeep").
contract VaultCreatePotTest is IpinTest {
    // --- Emitted Events ---

    function test_Pot_emitsPotCreatedWithName() public {
        vm.expectEmit(true, true, true, true, address(_vault));
        emit IPots.PotCreated(1, _sender, "Upkeep", 250e18);
        vm.prank(_sender);
        _vault.createPot("Upkeep", 250e18);
    }

    // --- System State Changes ---

    function test_Pot_storesNameAndCap() public {
        vm.prank(_sender);
        uint256 potId = _vault.createPot("House", 750e18);
        IPots.Pot memory pot = _vault.getPot(potId);
        assertEq(pot.name, bytes32("House"));
        assertEq(pot.cap, 750e18);
        assertEq(pot.owner, _sender);
    }
}
