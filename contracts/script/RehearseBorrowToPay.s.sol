// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {Vault} from "../src/Vault.sol";
import {IBorrowerOperationsSignatures} from "../src/interfaces/IBorrowerOperationsSignatures.sol";
import {ICheckout} from "../src/interfaces/ICheckout.sol";
import {PaymentRequest} from "../src/libraries/PaymentRequests.sol";
import {BorrowToPay} from "./BorrowToPay.s.sol";
import {StubBtcOracle} from "./stubs/StubBtcOracle.sol";

/// @title RehearseBorrowToPay
/// @notice A dry run of one R13 checkout against Mezo testnet's real
///         BorrowerOperations, TroveManager and MUSD, on a local fork. Nothing
///         is broadcast. Only the BTC price precompile is replaced (Forge
///         cannot execute it); everything else is Mezo's deployed code.
/// @dev Env: DEPLOYER_KEY (must own an active trove), BTC_PRICE (18 dp; pass
///      the live value from the real node), RELAYER_ADDRESS (optional).
///      `forge script script/RehearseBorrowToPay.s.sol --rpc-url mezo_testnet`
///      (no `--broadcast`).
contract RehearseBorrowToPay is BorrowToPay {
    address internal constant _PRICE_PRECOMPILE = 0x7b7c000000000000000000000000000000000015;
    address internal constant _TESTNET_MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant _TESTNET_SAVINGS = 0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16;
    address internal constant _TESTNET_BORROWER_OPS = 0xD757e3646AF370b15f32EB557F0F8380Df7D639e;

    /// @notice Run the rehearsal.
    /// @return deployedVaultResult Why the currently deployed Vault fails
    ///         (empty if it succeeds).
    /// @return directSubmission What happens when the borrow signature is sent
    ///         to Mezo directly, bypassing the Vault (must fail, M-02).
    /// @return merchantGot MUSD the merchant received through a fresh Vault
    ///         built from this checkout (must be 1 MUSD).
    function rehearse()
        external
        returns (string memory deployedVaultResult, string memory directSubmission, uint256 merchantGot)
    {
        uint256 key = vm.envUint("DEPLOYER_KEY");
        address owner = vm.addr(key);
        address merchant = vm.addr(uint256(keccak256("ipin-rehearsal-merchant")));
        _stubOracle(vm.envUint("BTC_PRICE"));

        string memory json = vm.readFile(vm.envOr("DEPLOYMENTS_FILE", string("../deployments/mezo-testnet.json")));
        deployedVaultResult = _tryCheckout(Vault(payable(vm.parseJsonAddress(json, ".pots"))), key, owner, merchant);

        Vault fresh = new Vault(
            IERC20Metadata(_TESTNET_MUSD),
            vm.envOr("RELAYER_ADDRESS", owner),
            250_000_000_000_000_000,
            _TESTNET_SAVINGS,
            _TESTNET_BORROWER_OPS
        );
        directSubmission = _tryDirect(fresh, key, owner);
        uint256 before = IERC20(_TESTNET_MUSD).balanceOf(merchant);
        string memory freshResult = _tryCheckout(fresh, key, owner, merchant);
        if (bytes(freshResult).length != 0) revert BorrowToPayFailed(freshResult);
        if (keccak256(bytes(directSubmission)) != keccak256("Sending BTC failed")) {
            revert BorrowToPayFailed(directSubmission);
        }
        merchantGot = IERC20(_TESTNET_MUSD).balanceOf(merchant) - before;
        if (merchantGot != _PRICE) revert BorrowToPayFailed("merchant");
        if (!fresh.booksBalance()) revert BorrowToPayFailed("books");
    }

    /// @dev Submit a borrow signature for `_vault` straight to Mezo.
    function _tryDirect(Vault _vault, uint256 _key, address _owner) internal returns (string memory) {
        ICheckout.Borrow memory loan = _loan(_key, _TESTNET_BORROWER_OPS, address(_vault), _PRICE + _vault.fee());
        try IBorrowerOperationsSignatures(_TESTNET_BORROWER_OPS)
            .withdrawMUSDWithSignature(
                loan.amount, address(0), address(0), _owner, address(_vault), loan.signature, loan.deadline
            ) {
            return "accepted: MUSD stranded in the vault";
        } catch Error(string memory reason) {
            return reason;
        } catch (bytes memory raw) {
            return raw.length == 0 ? "revert (no data)" : vm.toString(raw);
        }
    }

    /// @dev Replace the price precompile with a stub answering `_price`.
    function _stubOracle(uint256 _price) internal {
        vm.etch(_PRICE_PRECOMPILE, address(new StubBtcOracle()).code);
        // forge-lint: disable-next-line(unsafe-typecast) a BTC price fits in int256.
        StubBtcOracle(_PRICE_PRECOMPILE).setPrice(int256(_price));
    }

    /// @dev Create a pot owned by `_owner`, approve the merchant and run
    ///      borrowAndPay; return the revert reason, or "" on success.
    function _tryCheckout(Vault _vault, uint256 _key, address _owner, address _merchant)
        internal
        returns (string memory)
    {
        uint256 potId = _vault.potCount() + 1;
        vm.startPrank(_owner);
        _vault.createPot("Rehearsal", _CAP);
        _vault.addPayee(potId, _merchant);
        vm.stopPrank();
        (ICheckout.Borrow memory loan, PaymentRequest memory req, bytes memory sig) =
            _checkoutArgs(_vault, _key, potId, _merchant, _PRICE + _vault.fee());
        try _vault.borrowAndPay(loan, req, sig) {
            return "";
        } catch Error(string memory reason) {
            return reason;
        } catch (bytes memory raw) {
            return raw.length == 0 ? "revert (no data)" : vm.toString(raw);
        }
    }
}
