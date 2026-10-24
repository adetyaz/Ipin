// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The one payment format (README Architecture). The pot's sender signs
///         it under EIP-712; anyone (the relayer) submits it to
///         `IPolicyEngine.execute`. Amounts are MUSD base units, 18 dp (R1).
/// @param potId Pot the money leaves from.
/// @param payee Approved payee of that pot that receives `amount`; never a
///        registered requester of the pot.
/// @param amount MUSD base units paid to the payee. The flat fee is charged on
///        top, from the same pot, and does not count toward the cap (R4, R7).
/// @param itemHash Links the payment to the itemized request:
///        `keccak256(abi.encode(string item, uint256 quantity,
///        uint256 unitPrice, string vendor))`, `unitPrice` in MUSD base units
///        (docs/api.md section 2). The contract does not interpret it.
/// @param nonce Unordered nonce in the sender's namespace; usable once (R3, I4).
/// @param expiry Last timestamp (inclusive) at which the request may settle (R3).
struct PaymentRequest {
    uint256 potId;
    address payee;
    uint256 amount;
    bytes32 itemHash;
    uint256 nonce;
    uint256 expiry;
}

/// @title PaymentRequests
/// @notice EIP-712 struct hashing for {PaymentRequest} and the item hash. The
///         domain (name "Ipin", version "1", chainId, verifying contract) is
///         applied by the vault via OpenZeppelin `EIP712` (S14).
library PaymentRequests {
    bytes32 internal constant TYPEHASH = keccak256(
        "PaymentRequest(uint256 potId,address payee,uint256 amount,bytes32 itemHash,uint256 nonce,uint256 expiry)"
    );

    /// @notice EIP-712 struct hash of `_request`.
    /// @param _request The payment request.
    /// @return The struct hash (to be wrapped by `_hashTypedDataV4`).
    function hash(PaymentRequest memory _request) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPEHASH,
                _request.potId,
                _request.payee,
                _request.amount,
                _request.itemHash,
                _request.nonce,
                _request.expiry
            )
        );
    }

    /// @notice Item hash of an itemized request (docs/api.md section 2).
    /// @param _item Item description, e.g. "Cement bag 50kg".
    /// @param _quantity Number of units.
    /// @param _unitPrice MUSD base units per unit.
    /// @param _vendor Vendor name.
    /// @return The item hash carried in {PaymentRequest.itemHash}.
    function itemHash(string memory _item, uint256 _quantity, uint256 _unitPrice, string memory _vendor)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(_item, _quantity, _unitPrice, _vendor));
    }
}
