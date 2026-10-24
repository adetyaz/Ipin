import {
  encodeAbiParameters,
  type Hex,
  keccak256,
  parseAbiParameters,
} from "viem"

const ITEM_PARAMS = parseAbiParameters("string, uint256, uint256, string")

/**
 * keccak256(abi.encode(string item, uint256 quantity, uint256 unitPrice,
 * string vendor)), matching `PaymentRequests.itemHash` on-chain
 * (docs/api.md section 2). `unitPrice` is MUSD base units.
 */
export function itemHash(
  item: string,
  quantity: bigint,
  unitPrice: bigint,
  vendor: string,
): Hex {
  return keccak256(
    encodeAbiParameters(ITEM_PARAMS, [item, quantity, unitPrice, vendor]),
  )
}
