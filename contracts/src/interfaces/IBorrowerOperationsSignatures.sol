// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IBorrowerOperationsSignatures
/// @notice The part of Mezo's `BorrowerOperationsSignatures` (mezo-org/musd) the
///         Vault uses: borrow MUSD against the borrower's BTC trove with the
///         borrower's EIP-712 signature, minted to `_recipient`. Domain
///         "BorrowerOperationsSignatures" v1; typehash
///         `WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)`;
///         one sequential nonce per borrower. The borrowing fee is added to the
///         trove's debt, so `_recipient` receives exactly `_amount`.
///         Testnet 0xD757e3646AF370b15f32EB557F0F8380Df7D639e,
///         mainnet 0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a.
interface IBorrowerOperationsSignatures {
    /// @notice Mint `_amount` MUSD to `_recipient` as new debt on `_borrower`'s trove.
    /// @param _amount MUSD base units.
    /// @param _upperHint Sorted-troves hint (address(0) is valid, just costs gas).
    /// @param _lowerHint Sorted-troves hint.
    /// @param _borrower The trove owner who signed.
    /// @param _recipient Who receives the MUSD.
    /// @param _signature The borrower's EIP-712 signature.
    /// @param _deadline Signature expiry (unix seconds).
    function withdrawMUSDWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes calldata _signature,
        uint256 _deadline
    ) external;

    /// @notice The borrower's next signature nonce.
    /// @param _user Borrower.
    /// @return The nonce.
    function getNonce(address _user) external view returns (uint256);
}
