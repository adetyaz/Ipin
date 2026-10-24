// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {Vault} from "../src/Vault.sol";

/// @title Deploy
/// @notice Deploys the Ìpín Vault and writes deployments/mezo-testnet.json
///         (docs/api.md section 1).
/// @dev Env:
///      - MUSD_ADDRESS (default: Mezo testnet MUSD from the README),
///      - RELAYER_ADDRESS (required): receives fees,
///      - FEE_AMOUNT (default 0.25e18, ADR-002; 0 < fee <= 1e18),
///      - DEPLOYMENTS_FILE (default ../deployments/mezo-testnet.json).
///      The deployer key comes from the CLI (`--private-key`, `--account`).
///      Without `--broadcast` the file is written as `*.dry-run.json`.
contract Deploy is Script {
    address internal constant _TESTNET_MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    uint256 internal constant _DEFAULT_FEE = 25e16;

    error MusdHasNoCode(address musd);
    error MusdDecimalsNot18(uint8 decimals);

    /// @notice Deploy the vault and write the deployment file.
    /// @return vault The deployed vault.
    function run() external returns (Vault vault) {
        address musd = vm.envOr("MUSD_ADDRESS", _TESTNET_MUSD);
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        uint256 fee = vm.envOr("FEE_AMOUNT", _DEFAULT_FEE);
        if (musd.code.length == 0) revert MusdHasNoCode(musd);
        uint8 decimals = IERC20Metadata(musd).decimals();
        if (decimals != 18) revert MusdDecimalsNot18(decimals);

        vm.startBroadcast();
        vault = new Vault(IERC20Metadata(musd), relayer, fee);
        vm.stopBroadcast();

        _writeDeployment(musd, address(vault), relayer);
    }

    function _writeDeployment(address _musd, address _vault, address _relayer) internal {
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "musd", _musd);
        // One contract is both the pots ledger and the policy engine (ADR-016).
        vm.serializeAddress(obj, "pots", _vault);
        vm.serializeAddress(obj, "policyEngine", _vault);
        vm.serializeAddress(obj, "relayer", _relayer);
        string memory json = vm.serializeUint(obj, "deployBlock", block.number);

        string memory path = vm.envOr("DEPLOYMENTS_FILE", string("../deployments/mezo-testnet.json"));
        bool broadcasting =
            vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (!broadcasting) path = string.concat(path, ".dry-run.json");
        vm.writeJson(json, path);
    }
}
