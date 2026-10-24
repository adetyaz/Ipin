// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockMUSD} from "./mocks/MockMUSD.sol";
import {Test} from "forge-std/Test.sol";

/// @notice The mock must behave like real MUSD where the vault depends on it: 18 decimals and an
///         EIP-2612 permit under the domain name "Mezo USD", version "1" (README Mezo reference).
contract MockMUSDTest is Test {
    bytes32 private constant _PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    MockMUSD private _musd;

    function setUp() public {
        _musd = new MockMUSD();
    }

    function test_MockMUSD_permitSetsAllowance() public {
        (address owner, uint256 key) = makeAddrAndKey("owner");
        address spender = makeAddr("spender");
        uint256 value = 5e18;
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, owner, spender, value, 0, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _musd.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);

        _musd.permit(owner, spender, value, deadline, v, r, s);

        assertEq(_musd.allowance(owner, spender), value);
        assertEq(_musd.nonces(owner), 1);
    }

    function test_MockMUSD_hasEighteenDecimals() public view {
        assertEq(_musd.decimals(), 18);
        assertEq(_musd.symbol(), "MUSD");
    }

    function test_MockMUSD_domainMatchesRealMUSD() public view {
        bytes32 expected = keccak256(
            abi.encode(_DOMAIN_TYPEHASH, keccak256("Mezo USD"), keccak256("1"), block.chainid, address(_musd))
        );
        assertEq(_musd.DOMAIN_SEPARATOR(), expected);
    }
}
