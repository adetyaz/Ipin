// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {Vault} from "../../src/Vault.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";
import {VaultHandler} from "./handlers/VaultHandler.sol";

/// @notice I1-I6 hold after every handler call (docs/money-rules.md).
contract VaultInvariantsTest is Test {
    MockMUSD internal _musd;
    Vault internal _vault;
    VaultHandler internal _handler;

    function setUp() public {
        address relayer = makeAddr("inv-relayer");
        _musd = new MockMUSD();
        _vault = new Vault(_musd, relayer, 25e16);
        _handler = new VaultHandler(_vault, _musd, relayer);
        targetContract(address(_handler));
    }

    function invariant_I1_booksBalance() public view {
        assertTrue(_vault.booksBalance());
        assertEq(_vault.surplus(), _handler.ghostDonations(), "surplus == direct transfers");
        assertEq(
            _musd.balanceOf(address(_vault)),
            _vault.totalPotBalance() + _vault.unclaimedFees() + _handler.ghostDonations(),
            "assets == liabilities + surplus"
        );
    }

    function invariant_I2_depositEqualsCredits() public view {
        assertEq(_handler.ghostDepositCreditMismatches(), 0);
    }

    function invariant_I3_spendWithinCap() public view {
        assertEq(_handler.ghostCapViolations(), 0);
        for (uint256 i = 0; i < 2; ++i) {
            uint256 potId = _handler.pots(i);
            assertLe(_vault.spent(potId, _vault.currentPeriod(potId)), _vault.getPot(potId).cap);
        }
    }

    function invariant_I4_nonceUsedOnce() public view {
        assertEq(_handler.ghostNonceReuses(), 0);
    }

    function invariant_I5_onlyApprovedPayees() public view {
        assertEq(_handler.ghostUnapprovedPayouts(), 0);
        assertEq(_musd.balanceOf(_handler.requester()), 0, "requester never paid");
        assertEq(_musd.balanceOf(_handler.attacker()), 1e24, "attacker never paid");
    }

    function invariant_I6_noUnapprovedRequestPayments() public view {
        assertEq(_handler.ghostUnsignedSettlements(), 0);
    }
}
