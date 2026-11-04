// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {IBorrowerOperationsSignatures} from "../../src/interfaces/IBorrowerOperationsSignatures.sol";
import {MockMUSD} from "./MockMUSD.sol";

/// @notice Test double of Mezo's `BorrowerOperationsSignatures`: the same
///         EIP-712 domain, typehash, digest layout and sequential nonce as the
///         real `_verifySignature`, then MUSD minted to the recipient and the
///         amount plus a 0.1% fee added to the borrower's debt.
contract MockBorrowerOperationsSignatures is IBorrowerOperationsSignatures, EIP712 {
    bytes32 public constant WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");

    MockMUSD public immutable musd;
    mapping(address user => uint256 nonce) private _nonces;
    mapping(address borrower => uint256 amount) public debt;

    error SignatureExpired();
    error InvalidSignature();

    constructor(MockMUSD _musd) EIP712("BorrowerOperationsSignatures", "1") {
        musd = _musd;
    }

    function withdrawMUSDWithSignature(
        uint256 _amount,
        address,
        address,
        address _borrower,
        address _recipient,
        bytes calldata _signature,
        uint256 _deadline
    ) external {
        // forge-lint: disable-next-line(block-timestamp) mirrors Mezo's deadline check.
        if (block.timestamp > _deadline) revert SignatureExpired();
        bytes32 digest = withdrawDigest(_amount, _borrower, _recipient, _nonces[_borrower], _deadline);
        if (ECDSA.recover(digest, _signature) != _borrower) revert InvalidSignature();
        ++_nonces[_borrower];
        debt[_borrower] += _amount + _amount / 1000;
        musd.mint(_recipient, _amount);
    }

    function getNonce(address _user) external view returns (uint256) {
        return _nonces[_user];
    }

    /// @notice The digest a borrower signs (as in Mezo's `_verifySignature`).
    function withdrawDigest(uint256 _amount, address _borrower, address _recipient, uint256 _nonce, uint256 _deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encodePacked(WITHDRAW_MUSD_TYPEHASH, abi.encode(_amount, _borrower, _recipient), _nonce, _deadline)
            )
        );
    }
}
