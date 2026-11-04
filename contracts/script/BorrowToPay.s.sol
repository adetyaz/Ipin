// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";

import {Vault} from "../src/Vault.sol";
import {IBorrowerOperationsSignatures} from "../src/interfaces/IBorrowerOperationsSignatures.sol";
import {ICheckout} from "../src/interfaces/ICheckout.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";

/// @dev Mezo's TroveManager: 1 = active trove.
interface ITroveManagerStatus {
    function getTroveStatus(address _borrower) external view returns (uint256);
}

/// @title BorrowToPay
/// @notice One real R13 checkout on Mezo testnet: a pot with no money pays a
///         merchant 1 MUSD with MUSD borrowed against the sender's BTC trove,
///         in one transaction (Mezo's withdrawMUSDWithSignature + execute).
/// @dev Needs an open trove for the DEPLOYER_KEY address (borrow once at
///      https://testnet.mezo.org). Env: DEPLOYER_KEY, DEPLOYMENTS_FILE,
///      MERCHANT_ADDRESS (default: a fixed demo address), TROVE_MANAGER_ADDRESS
///      (default: Mezo testnet TroveManager), CALLDATA_FILE.
///      1. `forge script script/BorrowToPay.s.sol --rpc-url mezo_testnet --broadcast`
///      2. `cast send <vault> $(cat ../deployments/borrow-to-pay.calldata)
///         --private-key $DEPLOYER_KEY --rpc-url https://rpc.test.mezo.org`
contract BorrowToPay is Script {
    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");
    uint256 internal constant _PRICE = 1e18;
    uint256 internal constant _CAP = 5e18;
    address internal constant _TESTNET_TROVE_MANAGER = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;

    error BorrowToPayFailed(string what);

    /// @notice Create the checkout pot, then write the signed `borrowAndPay`
    ///         call to CALLDATA_FILE for `cast send`. Forge cannot simulate
    ///         the borrow itself: Mezo's price feed reads a chain precompile
    ///         (0x7b7c...0015) that only a real Mezo node runs.
    /// @return potId The checkout pot.
    /// @return merchant Who will be paid.
    /// @return borrowed MUSD to borrow (price + fee).
    /// @return data The `borrowAndPay` calldata, also written to CALLDATA_FILE.
    function run() external returns (uint256 potId, address merchant, uint256 borrowed, bytes memory data) {
        string memory json = vm.readFile(vm.envOr("DEPLOYMENTS_FILE", string("../deployments/mezo-testnet.json")));
        Vault vault = Vault(payable(vm.parseJsonAddress(json, ".pots")));
        uint256 key = vm.envUint("DEPLOYER_KEY");
        merchant = vm.envOr("MERCHANT_ADDRESS", vm.addr(uint256(keccak256("ipin-showcase-merchant"))));
        if (vault.borrowerOperations() == address(0)) revert BorrowToPayFailed("vault has no borrow-to-pay: redeploy");
        address troveManager = vm.envOr("TROVE_MANAGER_ADDRESS", _TESTNET_TROVE_MANAGER);
        if (ITroveManagerStatus(troveManager).getTroveStatus(vm.addr(key)) != 1) {
            revert BorrowToPayFailed("no open trove for DEPLOYER_KEY: borrow once at testnet.mezo.org first");
        }

        potId = vault.potCount() + 1;
        borrowed = _PRICE + vault.fee();

        vm.startBroadcast(key);
        vault.createPot("Checkout", _CAP);
        vault.addPayee(potId, merchant);
        vm.stopBroadcast();

        data = _checkoutCall(vault, key, potId, merchant, borrowed);
        vm.writeFile(vm.envOr("CALLDATA_FILE", string("../deployments/borrow-to-pay.calldata")), vm.toString(data));
    }

    /// @dev The approved payment and the borrow, encoded as one call.
    function _checkoutCall(Vault _vault, uint256 _key, uint256 _potId, address _merchant, uint256 _borrowed)
        internal
        view
        returns (bytes memory)
    {
        (ICheckout.Borrow memory loan, PaymentRequest memory req, bytes memory sig) =
            _checkoutArgs(_vault, _key, _potId, _merchant, _borrowed);
        return abi.encodeCall(ICheckout.borrowAndPay, (loan, req, sig));
    }

    /// @dev The signed borrow, the payment request and the sender's signature.
    function _checkoutArgs(Vault _vault, uint256 _key, uint256 _potId, address _merchant, uint256 _borrowed)
        internal
        view
        returns (ICheckout.Borrow memory loan, PaymentRequest memory req, bytes memory sig)
    {
        req = PaymentRequest({
            potId: _potId,
            payee: _merchant,
            amount: _PRICE,
            itemHash: _vault.itemHash("Groceries", 1, _PRICE, "Merchant"),
            nonce: uint256(keccak256(abi.encode("borrow-to-pay", _potId, vm.getBlockTimestamp()))),
            expiry: vm.getBlockTimestamp() + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, _vault.hashPaymentRequest(req));
        sig = abi.encodePacked(r, s, v);
        loan = _loan(_key, _vault.borrowerOperations(), address(_vault), _borrowed);
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
