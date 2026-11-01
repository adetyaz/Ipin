// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script} from "forge-std/Script.sol";

import {Vault} from "../src/Vault.sol";
import {IBorrowerOperationsSignatures} from "../src/interfaces/IBorrowerOperationsSignatures.sol";
import {ICheckout} from "../src/interfaces/ICheckout.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";

/// @title BorrowToPay
/// @notice One real R13 checkout on Mezo testnet: a pot with no money pays a
///         merchant 1 MUSD with MUSD borrowed against the sender's BTC trove,
///         in one transaction (Mezo's withdrawMUSDWithSignature + execute).
/// @dev Needs an open trove for the DEPLOYER_KEY address (borrow once at
///      https://testnet.mezo.org). Env: DEPLOYER_KEY, DEPLOYMENTS_FILE,
///      MERCHANT_ADDRESS (default: a fixed demo address).
///      `forge script script/BorrowToPay.s.sol --rpc-url mezo_testnet --broadcast`
contract BorrowToPay is Script {
    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");
    uint256 internal constant _PRICE = 1e18;
    uint256 internal constant _CAP = 5e18;

    error BorrowToPayFailed(string what);

    /// @notice Run the checkout. Forge prints the returned values.
    /// @return potId The checkout pot.
    /// @return merchant Who was paid.
    /// @return merchantGot MUSD the merchant received (1 MUSD).
    /// @return borrowed MUSD borrowed (price + fee).
    function run() external returns (uint256 potId, address merchant, uint256 merchantGot, uint256 borrowed) {
        string memory json = vm.readFile(vm.envOr("DEPLOYMENTS_FILE", string("../deployments/mezo-testnet.json")));
        Vault vault = Vault(vm.parseJsonAddress(json, ".pots"));
        IERC20 musd = IERC20(vm.parseJsonAddress(json, ".musd"));
        uint256 key = vm.envUint("DEPLOYER_KEY");
        merchant = vm.envOr("MERCHANT_ADDRESS", vm.addr(uint256(keccak256("ipin-showcase-merchant"))));
        if (vault.borrowerOperations() == address(0)) revert BorrowToPayFailed("vault has no borrow-to-pay: redeploy");

        potId = vault.potCount() + 1;
        borrowed = _PRICE + vault.fee();
        uint256 before = musd.balanceOf(merchant);

        vm.startBroadcast(key);
        vault.createPot("Checkout", _CAP);
        vault.addPayee(potId, merchant);
        _checkout(vault, key, potId, merchant, borrowed);
        vm.stopBroadcast();

        merchantGot = musd.balanceOf(merchant) - before;
        if (merchantGot != _PRICE) revert BorrowToPayFailed("merchant");
        if (!vault.booksBalance()) revert BorrowToPayFailed("books");
    }

    /// @dev The approved payment and the borrow, submitted together.
    function _checkout(Vault _vault, uint256 _key, uint256 _potId, address _merchant, uint256 _borrowed) internal {
        PaymentRequest memory req = PaymentRequest({
            potId: _potId,
            payee: _merchant,
            amount: _PRICE,
            itemHash: _vault.itemHash("Groceries", 1, _PRICE, "Merchant"),
            nonce: uint256(keccak256(abi.encode("borrow-to-pay", _potId, vm.getBlockTimestamp()))),
            expiry: vm.getBlockTimestamp() + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, _vault.hashPaymentRequest(req));
        _vault.borrowAndPay(
            _loan(_key, _vault.borrowerOperations(), address(_vault), _borrowed), req, abi.encodePacked(r, s, v)
        );
    }

    /// @dev The borrower's signature, exactly as Mezo's `_verifySignature` checks it.
    function _loan(uint256 _key, address _bos, address _vault, uint256 _amount)
        internal
        view
        returns (ICheckout.Borrow memory loan)
    {
        address borrower = vm.addr(_key);
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes32 domain = keccak256(
            abi.encode(_DOMAIN_TYPEHASH, keccak256("BorrowerOperationsSignatures"), keccak256("1"), block.chainid, _bos)
        );
        bytes32 structHash = keccak256(
            abi.encodePacked(
                _WITHDRAW_MUSD_TYPEHASH,
                abi.encode(_amount, borrower, _vault),
                IBorrowerOperationsSignatures(_bos).getNonce(borrower),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        loan = ICheckout.Borrow({
            amount: _amount,
            upperHint: address(0),
            lowerHint: address(0),
            deadline: deadline,
            signature: abi.encodePacked(r, s, v)
        });
    }
}
