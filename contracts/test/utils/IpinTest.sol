// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vault} from "../../src/Vault.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Shared fixture: MockMUSD, one Vault, a funded _sender.
abstract contract IpinTest is Test {
    uint16 internal constant _BPS = 10_000;

    MockMUSD internal _musd;
    Vault internal _vault;

    address internal _sender;
    uint256 internal _senderKey;

    function setUp() public virtual {
        _musd = new MockMUSD();
        _vault = new Vault(_musd);
        (_sender, _senderKey) = makeAddrAndKey("sender");
        _musd.mint(_sender, 1e30);
        vm.prank(_sender);
        _musd.approve(address(_vault), type(uint256).max);
    }

    function _createPot(address owner, uint256 cap) internal returns (uint256 potId) {
        vm.prank(owner);
        potId = _vault.createPot("House", cap);
    }

    function _singleSplit(address owner, uint256 potId) internal returns (uint256 splitId) {
        uint256[] memory pots = new uint256[](1);
        pots[0] = potId;
        uint16[] memory bps = new uint16[](1);
        bps[0] = _BPS;
        vm.prank(owner);
        splitId = _vault.createSplit(pots, bps, potId);
    }

    /// @dev New pot owned by `sender`, with a single-pot split, funded with `amount`.
    function _fundedPot(uint256 cap, uint256 amount) internal returns (uint256 potId) {
        potId = _createPot(_sender, cap);
        uint256 splitId = _singleSplit(_sender, potId);
        vm.prank(_sender);
        _vault.deposit(splitId, amount);
    }
}
