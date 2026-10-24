import {
  type Address,
  hashTypedData,
  type Hex,
  recoverTypedDataAddress,
} from "viem"

/** EIP-712 domain of the Vault (docs/api.md section 2a). */
export const EIP712_DOMAIN_NAME = "Ipin"
export const EIP712_DOMAIN_VERSION = "1"

/**
 * PaymentRequest type. Mirrors `struct PaymentRequest` in
 * contracts/src/libraries/PaymentRequests.sol; test/eip712.test.ts checks it
 * against the `execute` ABI and the on-chain typehash string.
 */
export const paymentRequestTypes = {
  PaymentRequest: [
    { name: "potId", type: "uint256" },
    { name: "payee", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "itemHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const

export interface PaymentRequest {
  potId: bigint
  payee: Address
  amount: bigint
  itemHash: Hex
  nonce: bigint
  expiry: bigint
}

export interface PaymentRequestDomain {
  name: typeof EIP712_DOMAIN_NAME
  version: typeof EIP712_DOMAIN_VERSION
  chainId: number
  verifyingContract: Address
}

export function paymentRequestDomain(
  chainId: number,
  verifyingContract: Address,
): PaymentRequestDomain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  }
}

/** Arguments for viem `signTypedData` (the sender signs these in the wallet). */
export function paymentRequestTypedData(
  domain: PaymentRequestDomain,
  message: PaymentRequest,
) {
  return {
    domain,
    types: paymentRequestTypes,
    primaryType: "PaymentRequest",
    message,
  } as const
}

/** Digest the sender signs; equals the Vault's `hashPaymentRequest`. */
export function hashPaymentRequest(
  domain: PaymentRequestDomain,
  message: PaymentRequest,
): Hex {
  return hashTypedData(paymentRequestTypedData(domain, message))
}

/** EOA signer of a PaymentRequest signature (ERC-1271 senders are checked on-chain). */
export function recoverPaymentRequestSigner(
  domain: PaymentRequestDomain,
  message: PaymentRequest,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    ...paymentRequestTypedData(domain, message),
    signature,
  })
}

/** Random 256-bit nonce (docs/api.md 2a). Works in Node 22 and browsers. */
export function randomNonce(): bigint {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}
