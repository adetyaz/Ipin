// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";

import {Vault} from "../src/Vault.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";

/// @title ForkSmoke
/// @notice Simulation only (never broadcast): against a Mezo testnet fork,
///         deploy a Vault and run deposit -> approve payee -> signed execute ->
///         claimFees with the real MUSD and small demo amounts.
/// @dev `forge script script/ForkSmoke.s.sol --fork-url mezo_testnet`.
///      MUSD_HOLDER (default: the demo sender wallet) is impersonated to fund
///      a throwaway sender key.
contract ForkSmoke is Script {
    address internal constant _MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant _DEMO_HOLDER = 0x99BD4BDD7A9c22E2a35F09A6Bd17f038D5E5eB87;
    address internal constant _RELAYER = 0x657f1cabE177f15A275A2Fd99972B690f80e8573;
    uint256 internal constant _FEE = 5e16; // 0.05 MUSD demo fee

    error SmokeFailed(string what);

    /// @notice Run the smoke flow.
    /// @return potLeft Pot balance after paying 5 MUSD plus the fee.
    function run() external returns (uint256 potLeft) {
        IERC20 musd = IERC20(_MUSD);
        Vault vault = new Vault(musd, _RELAYER, _FEE);
        (address sender, uint256 senderKey) = makeAddrAndKey("smoke-sender");
        address payee = makeAddr("smoke-vendor");

        vm.prank(vm.envOr("MUSD_HOLDER", _DEMO_HOLDER));
        if (!musd.transfer(sender, 10e18)) revert SmokeFailed("fund");

        vm.startPrank(sender);
        musd.approve(address(vault), 10e18);
        uint256 potId = vault.createPot("House", 8e18);
        uint256[] memory pots = new uint256[](1);
        pots[0] = potId;
        uint16[] memory bps = new uint16[](1);
        bps[0] = 10_000;
        vault.deposit(vault.createSplit(pots, bps, potId), 10e18);
        vault.addPayee(potId, payee);
        vm.stopPrank();

        PaymentRequest memory req = PaymentRequest({
            potId: potId,
            payee: payee,
            amount: 5e18,
            itemHash: vault.itemHash("Cement bag 50kg", 1, 5e18, "Vendor Y"),
            nonce: 1,
            expiry: vm.getBlockTimestamp() + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(senderKey, vault.hashPaymentRequest(req));
        vm.prank(_RELAYER);
        vault.execute(req, abi.encodePacked(r, s, v));
        vault.claimFees();

        if (musd.balanceOf(payee) != 5e18) revert SmokeFailed("payee");
        if (vault.potBalance(potId) != 10e18 - 5e18 - _FEE) {
            revert SmokeFailed("pot");
        }
        if (musd.balanceOf(_RELAYER) < _FEE) revert SmokeFailed("fee");
        if (!vault.booksBalance()) revert SmokeFailed("books");
        potLeft = vault.potBalance(potId);
    }
}
