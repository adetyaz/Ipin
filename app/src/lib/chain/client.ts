import { mezoTestnet } from "@ipin/shared"
import { type Chain, createPublicClient, type Hex, http } from "viem"

/**
 * viem's chain types don't satisfy `exactOptionalPropertyTypes` (T1) when a
 * chain from defineChain is passed back in, so widen it once here.
 */
export const chain = mezoTestnet as unknown as Chain

/** Read-only client. Requesters and visitors read the chain without a wallet. */
export const publicClient = createPublicClient({
  chain,
  transport: http(),
})

const EXPLORER = mezoTestnet.blockExplorers.default.url

export const explorer = {
  tx: (hash: Hex) => `${EXPLORER}/tx/${hash}`,
  address: (addr: string) => `${EXPLORER}/address/${addr}`,
}

export const MEZO_FAUCET = "https://faucet.test.mezo.org"
export const MEZO_TESTNET_APP = "https://testnet.mezo.org"
