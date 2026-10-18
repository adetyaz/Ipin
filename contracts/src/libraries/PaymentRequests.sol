// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The one payment format (README Architecture). The pot's sender signs it under EIP-712;
///         the relayer submits it. All amounts are MUSD base units, 18 decimals (R1).
/// @param potId Pot the money leaves from.
/// @param payee Approved payee of that pot that receives `amount`.
/// @param amount MUSD base units paid to the payee (the flat fee is charged on top, R4).
/// @param nonce Unordered nonce in the sender's namespace; usable once (R3, I4).
/// @param expiry Last timestamp (inclusive) at which the request may settle (R3).
/// @param runningTotal Cumulative total for metered settlement. In Wave 1 it must equal `amount`
///        (docs/money-rules.md, R8 note).
struct PaymentRequest {
    uint256 potId;
    address payee;
    uint256 amount;
    uint256 nonce;
    uint256 expiry;
    uint256 runningTotal;
}

/// @title PaymentRequests
/// @notice EIP-712 struct hashing for {PaymentRequest}. The domain (name, version, chainId,
///         verifying contract) is applied by the vault via OpenZeppelin `EIP712` (S14).
library PaymentRequests {
    bytes32 internal constant TYPEHASH = keccak256(
        "PaymentRequest(uint256 potId,address payee,uint256 amount,uint256 nonce,uint256 expiry,uint256 runningTotal)"
    );

    /// @notice EIP-712 struct hash of `req`.
    /// @param req The payment request.
    /// @return The struct hash (to be wrapped by `_hashTypedDataV4`).
    function hash(PaymentRequest memory req) internal pure returns (bytes32) {
        return
            keccak256(abi.encode(TYPEHASH, req.potId, req.payee, req.amount, req.nonce, req.expiry, req.runningTotal));
    }
}
