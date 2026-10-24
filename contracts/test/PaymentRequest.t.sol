// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {PaymentRequest, PaymentRequests} from "../src/libraries/PaymentRequests.sol";

/// @notice The EIP-712 PaymentRequest and the item hash are part of the public
///         contract with the relayer and app (docs/api.md), so pin them here.
contract PaymentRequestTest is Test {
    /// @dev Shared test vector with packages/shared (docs/api.md section 2).
    bytes32 private constant _ITEM_HASH_VECTOR = 0x0ed8f4ca6b571e726131a47e8f2ed5ef66614bd6ddde8109e3539970fd86bedc;

    function test_PaymentRequest_itemHashMatchesVector() public {
        bytes32 h = PaymentRequests.itemHash("Cement bag 50kg", 200, 9e18, "Vendor Y");
        emit log_named_bytes32("itemHash vector", h);
        assertEq(h, _ITEM_HASH_VECTOR);
    }

    function test_PaymentRequest_typehashMatchesSpec() public pure {
        assertEq(
            PaymentRequests.TYPEHASH,
            keccak256(
                "PaymentRequest(uint256 potId,address payee,uint256 amount,"
                "bytes32 itemHash,uint256 nonce,uint256 expiry)"
            )
        );
    }

    function test_PaymentRequest_structHashEncodesEveryField() public pure {
        PaymentRequest memory req = PaymentRequest({
            potId: 1, payee: address(0xBEEF), amount: 2e18, itemHash: keccak256("items"), nonce: 3, expiry: 4
        });
        bytes32 expected = keccak256(
            abi.encode(PaymentRequests.TYPEHASH, req.potId, req.payee, req.amount, req.itemHash, req.nonce, req.expiry)
        );
        assertEq(PaymentRequests.hash(req), expected);
    }
}
