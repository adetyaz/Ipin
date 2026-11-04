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

// --- Mezo borrow signature (R13) ---

/**
 * Mezo's `BorrowerOperationsSignatures` EIP-712 domain (mezo-org/musd).
 * The borrower signs WithdrawMUSD so anyone can submit the borrow; the MUSD
 * is minted to `recipient` (the Vault) and the debt lands on their trove.
 */
export const MEZO_BORROW_DOMAIN_NAME = "BorrowerOperationsSignatures"
export const MEZO_BORROW_DOMAIN_VERSION = "1"

/**
 * Mezo hashes `abi.encodePacked(TYPEHASH, abi.encode(amount, borrower,
 * recipient), nonce, deadline)`. Every field is one 32-byte word, so that is
 * exactly the standard EIP-712 struct hash of this type (eip712.test.ts
 * checks it byte for byte).
 */
export const withdrawMusdTypes = {
  WithdrawMUSD: [
    { name: "amount", type: "uint256" },
    { name: "borrower", type: "address" },
    { name: "recipient", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const

export interface WithdrawMusd {
  amount: bigint
  borrower: Address
  recipient: Address
  nonce: bigint
  deadline: bigint
}

export interface WithdrawMusdDomain {
  name: typeof MEZO_BORROW_DOMAIN_NAME
  version: typeof MEZO_BORROW_DOMAIN_VERSION
  chainId: number
  verifyingContract: Address
}

export function withdrawMusdDomain(
  chainId: number,
  borrowerOperationsSignatures: Address,
): WithdrawMusdDomain {
  return {
    name: MEZO_BORROW_DOMAIN_NAME,
    version: MEZO_BORROW_DOMAIN_VERSION,
    chainId,
    verifyingContract: borrowerOperationsSignatures,
  }
}

/** Arguments for viem `signTypedData` (the borrower signs the loan). */
export function withdrawMusdTypedData(
  domain: WithdrawMusdDomain,
  message: WithdrawMusd,
) {
  return {
    domain,
    types: withdrawMusdTypes,
    primaryType: "WithdrawMUSD",
    message,
  } as const
}

/** EOA signer of a WithdrawMUSD signature. */
export function recoverWithdrawMusdSigner(
  domain: WithdrawMusdDomain,
  message: WithdrawMusd,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    ...withdrawMusdTypedData(domain, message),
    signature,
  })
}
