import { defineChain } from "viem"

export const MEZO_TESTNET_RPC_URL = "https://rpc.test.mezo.org"

/** Mezo testnet (README "Mezo reference"). Gas is paid in BTC (18 decimals). */
export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [MEZO_TESTNET_RPC_URL] } },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
  testnet: true,
})
