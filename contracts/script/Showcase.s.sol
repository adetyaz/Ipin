// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";

import {Vault} from "../src/Vault.sol";
import {IPolicyEngine} from "../src/interfaces/IPolicyEngine.sol";
import {IPots} from "../src/interfaces/IPots.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";

/// @title Showcase
/// @notice Runs the whole money path on the deployed Vault so every outflow
///         is visible on the explorer: one-transaction setup (multicall), a
///         signed request paid to a vendor (execute), a monthly allowance
///         (createSchedule + executeSchedule) and the relayer's fees
///         (claimFees). Small amounts; the sender pays its own gas.
/// @dev Env:
///      - DEPLOYER_KEY (required): the sender. Holds MUSD and test BTC.
///      - DEPLOYMENTS_FILE (default ../deployments/mezo-testnet.json),
///      - SHOWCASE_DEPOSIT (default 3 MUSD),
///      - VENDOR_ADDRESS / MAMA_ADDRESS (default: fixed demo addresses).
///      `forge script script/Showcase.s.sol --rpc-url mezo_testnet --broadcast`
///      Without `--broadcast` it only simulates.
contract Showcase is Script {
    struct Ctx {
        Vault vault;
        IERC20 musd;
        uint256 key;
        address sender;
        address vendor;
        address mama;
        uint256 amount;
    }

    uint256 internal constant _DEFAULT_DEPOSIT = 3e18;
    uint256 internal constant _HOUSE_CAP = 2e18;
    uint256 internal constant _UPKEEP_CAP = 1e18;
    uint256 internal constant _PAYMENT = 1e18;
    uint256 internal constant _ALLOWANCE = 5e17;
    uint64 internal constant _MONTH = 30 days;

    error ShowcaseFailed(string what);

    /// @notice Run the showcase. Forge prints the returned values.
    /// @return house The House pot id.
    /// @return upkeep The Upkeep pot id.
    /// @return houseLeft House balance after paying the vendor 1 MUSD + fee.
    /// @return upkeepLeft Upkeep balance after the 0.5 MUSD allowance + fee.
    /// @return vendor Who the request paid.
    /// @return mama Who the allowance paid.
    function run()
        external
        returns (uint256 house, uint256 upkeep, uint256 houseLeft, uint256 upkeepLeft, address vendor, address mama)
    {
        Ctx memory c = _context();
        house = c.vault.potCount() + 1;
        upkeep = house + 1;
        uint256 vendorBefore = c.musd.balanceOf(c.vendor);
        uint256 mamaBefore = c.musd.balanceOf(c.mama);

        vm.startBroadcast(c.key);
        c.musd.approve(address(c.vault), c.amount);
        c.vault.multicall(_setupCalls(house, upkeep, c.vault.splitCount() + 1, c.amount, c.vendor, c.mama));
        _payVendor(c, house);
        // A monthly allowance, due now, paid once.
        uint256 scheduleId = c.vault.createSchedule(upkeep, c.mama, _ALLOWANCE, uint64(vm.getBlockTimestamp()), _MONTH);
        c.vault.executeSchedule(scheduleId);
        // Fees already earned go to the relayer address.
        c.vault.claimFees();
        vm.stopBroadcast();

        if (c.musd.balanceOf(c.vendor) - vendorBefore != _PAYMENT) revert ShowcaseFailed("vendor");
        if (c.musd.balanceOf(c.mama) - mamaBefore != _ALLOWANCE) revert ShowcaseFailed("allowance");
        if (!c.vault.booksBalance()) revert ShowcaseFailed("books");
        (houseLeft, upkeepLeft) = (c.vault.potBalance(house), c.vault.potBalance(upkeep));
        (vendor, mama) = (c.vendor, c.mama);
    }

    /// @dev A request the sender approved (EIP-712), settled by the policy engine.
    function _payVendor(Ctx memory _c, uint256 _house) internal {
        PaymentRequest memory req = PaymentRequest({
            potId: _house,
            payee: _c.vendor,
            amount: _PAYMENT,
            itemHash: _c.vault.itemHash("Cement bag 50kg", 1, _PAYMENT, "Vendor Y"),
            nonce: uint256(keccak256(abi.encode(_c.sender, _house, vm.getBlockTimestamp()))),
            expiry: vm.getBlockTimestamp() + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_c.key, _c.vault.hashPaymentRequest(req));
        _c.vault.execute(req, abi.encodePacked(r, s, v));
    }

    function _context() internal view returns (Ctx memory c) {
        string memory json = vm.readFile(vm.envOr("DEPLOYMENTS_FILE", string("../deployments/mezo-testnet.json")));
        c.vault = Vault(vm.parseJsonAddress(json, ".pots"));
        c.musd = IERC20(vm.parseJsonAddress(json, ".musd"));
        c.key = vm.envUint("DEPLOYER_KEY");
        c.sender = vm.addr(c.key);
        c.vendor = vm.envOr("VENDOR_ADDRESS", vm.addr(uint256(keccak256("ipin-showcase-vendor"))));
        c.mama = vm.envOr("MAMA_ADDRESS", vm.addr(uint256(keccak256("ipin-showcase-mama"))));
        c.amount = vm.envOr("SHOWCASE_DEPOSIT", _DEFAULT_DEPOSIT);
        if (c.musd.balanceOf(c.sender) < c.amount) revert ShowcaseFailed("sender needs more MUSD");
    }

    function _setupCalls(
        uint256 _house,
        uint256 _upkeep,
        uint256 _splitId,
        uint256 _amount,
        address _vendor,
        address _mama
    ) internal pure returns (bytes[] memory calls) {
        uint256[] memory ids = new uint256[](2);
        (ids[0], ids[1]) = (_house, _upkeep);
        uint16[] memory bps = new uint16[](2);
        (bps[0], bps[1]) = (7000, 3000);
        calls = new bytes[](6);
        calls[0] = abi.encodeCall(IPots.createPot, ("Showcase House", _HOUSE_CAP));
        calls[1] = abi.encodeCall(IPots.createPot, ("Showcase Upkeep", _UPKEEP_CAP));
        calls[2] = abi.encodeCall(IPots.createSplit, (ids, bps, _house));
        calls[3] = abi.encodeCall(IPots.deposit, (_splitId, _amount));
        calls[4] = abi.encodeCall(IPolicyEngine.addPayee, (_house, _vendor));
        calls[5] = abi.encodeCall(IPolicyEngine.addPayee, (_upkeep, _mama));
    }
}
