// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {Vault} from "../../src/Vault.sol";
import {PaymentRequest} from "../../src/libraries/PaymentRequests.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";

/// @notice Shared fixture: MockMUSD, one Vault, a funded _sender, a relayer,
///         a payee and a requester.
abstract contract IpinTest is Test {
    uint16 internal constant _BPS = 10_000;
    uint256 internal constant _FEE = 25e16; // ADR-002
    uint256 internal constant _CAP = 1000e18;

    MockMUSD internal _musd;
    Vault internal _vault;

    address internal _sender;
    uint256 internal _senderKey;
    address internal _relayer;
    address internal _payee;
    address internal _requester;
    uint256 internal _requesterKey;

    uint256 private _nextNonce;

    function setUp() public virtual {
        _musd = new MockMUSD();
        _relayer = makeAddr("relayer");
        _vault = new Vault(_musd, _relayer, _FEE);
        (_sender, _senderKey) = makeAddrAndKey("sender");
        (_requester, _requesterKey) = makeAddrAndKey("requester");
        _payee = makeAddr("payee");
        _musd.mint(_sender, 1e30);
        vm.prank(_sender);
        _musd.approve(address(_vault), type(uint256).max);
    }

    function _createPot(address _owner, uint256 _cap) internal returns (uint256 potId) {
        vm.prank(_owner);
        potId = _vault.createPot("House", _cap);
    }

    function _singleSplit(address _owner, uint256 _potId) internal returns (uint256 splitId) {
        uint256[] memory pots = new uint256[](1);
        pots[0] = _potId;
        uint16[] memory bps = new uint16[](1);
        bps[0] = _BPS;
        vm.prank(_owner);
        splitId = _vault.createSplit(pots, bps, _potId);
    }

    /// @dev New pot owned by `_sender`, with a single-pot split, funded with
    ///      `_amount`.
    function _fundedPot(uint256 _cap, uint256 _amount) internal returns (uint256 potId) {
        potId = _createPot(_sender, _cap);
        uint256 splitId = _singleSplit(_sender, potId);
        vm.prank(_sender);
        _vault.deposit(splitId, _amount);
    }

    /// @dev Funded pot (cap _CAP, 500 MUSD) with `_payee` approved and
    ///      `_requester` registered.
    function _readyPot() internal returns (uint256 potId) {
        potId = _fundedPot(_CAP, 500e18);
        vm.startPrank(_sender);
        _vault.addPayee(potId, _payee);
        _vault.addRequester(potId, _requester);
        vm.stopPrank();
    }

    /// @dev A request for `_amount` to `_payee`, fresh nonce, 1 hour expiry.
    function _request(uint256 _potId, uint256 _amount) internal returns (PaymentRequest memory) {
        return PaymentRequest({
            potId: _potId,
            payee: _payee,
            amount: _amount,
            itemHash: keccak256("Cement bag 50kg x200"),
            nonce: ++_nextNonce,
            expiry: vm.getBlockTimestamp() + 1 hours
        });
    }

    /// @dev Sign with `_senderKey` and execute as the relayer.
    function _execute(PaymentRequest memory _req) internal {
        bytes memory sig = _sign(_req, _senderKey);
        vm.prank(_relayer);
        _vault.execute(_req, sig);
    }

    function _sign(PaymentRequest memory _req, uint256 _key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, _vault.hashPaymentRequest(_req));
        return abi.encodePacked(r, s, v);
    }
}
