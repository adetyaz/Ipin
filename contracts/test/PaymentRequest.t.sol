// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PaymentRequest, PaymentRequests} from "../src/libraries/PaymentRequests.sol";
import {Test} from "forge-std/Test.sol";

/// @notice The EIP-712 PaymentRequest is the one payment format (README Architecture). Its typehash
///         is part of the public contract with the relayer and app, so pin it here.
contract PaymentRequestTest is Test {
    function test_PaymentRequest_typehashMatchesSpec() public pure {
        assertEq(
            PaymentRequests.TYPEHASH,
            keccak256(
                "PaymentRequest(uint256 potId,address payee,uint256 amount,"
                "uint256 nonce,uint256 expiry,uint256 runningTotal)"
            )
        );
    }

    function test_PaymentRequest_structHashEncodesEveryField() public pure {
        PaymentRequest memory req =
            PaymentRequest({potId: 1, payee: address(0xBEEF), amount: 2e18, nonce: 3, expiry: 4, runningTotal: 2e18});
        bytes32 expected = keccak256(
            abi.encode(
                PaymentRequests.TYPEHASH, req.potId, req.payee, req.amount, req.nonce, req.expiry, req.runningTotal
            )
        );
        assertEq(PaymentRequests.hash(req), expected);
    }
}
