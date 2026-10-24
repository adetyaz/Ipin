// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Minimal smart-account sender (ERC-1271): a signature is valid if
///         its `signer` EOA signed the hash. Stands in for a Mezo Passport
///         smart account (R8).
contract MockERC1271Wallet is IERC1271 {
    address public immutable signer;

    constructor(address _signer) {
        signer = _signer;
    }

    /// @inheritdoc IERC1271
    function isValidSignature(bytes32 _hash, bytes calldata _signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hash, _signature);
        if (err == ECDSA.RecoverError.NoError && recovered == signer) {
            return IERC1271.isValidSignature.selector;
        }
        return 0xffffffff;
    }
}
