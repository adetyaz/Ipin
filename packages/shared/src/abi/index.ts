// ABIs exported from contracts/abi (run `pnpm abi` at the root, then
// `pnpm --filter @ipin/shared gen:abi`). The Vault is both the pots ledger and
// the policy engine, so `vaultAbi` serves every Vault address.
export { erc20Abi, vaultAbi } from "./generated"
