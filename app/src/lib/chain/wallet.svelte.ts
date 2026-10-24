import { mezoTestnet } from "@ipin/shared"
import {
  type Address,
  createWalletClient,
  custom,
  getAddress,
  type WalletClient,
} from "viem"

import { chain } from "./client"

type WalletStatus = "unavailable" | "disconnected" | "connecting" | "connected"

const MEZO_HEX_CHAIN_ID = `0x${mezoTestnet.id.toString(16)}`

/** The sender's injected wallet (MetaMask) on Mezo testnet (ADR-012). */
class Wallet {
  status = $state<WalletStatus>("disconnected")
  account = $state<Address | null>(null)
  chainId = $state<number | null>(null)
  error = $state<string | null>(null)

  onMezo = $derived(this.chainId === mezoTestnet.id)
  ready = $derived(this.status === "connected" && this.onMezo)

  #listening = false

  /** Pick up an already-authorised wallet without a popup. */
  async init(): Promise<void> {
    const eth = window.ethereum
    if (!eth) {
      this.status = "unavailable"
      return
    }
    this.#listen()
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[]
    await this.#readChain()
    this.#setAccounts(accounts)
  }

  async connect(): Promise<void> {
    const eth = window.ethereum
    if (!eth) {
      this.status = "unavailable"
      return
    }
    this.#listen()
    this.status = "connecting"
    this.error = null
    try {
      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[]
      await this.#readChain()
      this.#setAccounts(accounts)
    } catch (err) {
      this.status = "disconnected"
      this.error = walletErrorMessage(err)
    }
  }

  /** Switch to Mezo testnet, adding it to the wallet first if needed. */
  async switchToMezo(): Promise<void> {
    const eth = window.ethereum
    if (!eth) return
    this.error = null
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MEZO_HEX_CHAIN_ID }],
      })
    } catch (err) {
      if (errorCode(err) !== 4902) {
        this.error = walletErrorMessage(err)
        return
      }
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: MEZO_HEX_CHAIN_ID,
              chainName: mezoTestnet.name,
              nativeCurrency: mezoTestnet.nativeCurrency,
              rpcUrls: [...mezoTestnet.rpcUrls.default.http],
              blockExplorerUrls: [mezoTestnet.blockExplorers.default.url],
            },
          ],
        })
      } catch (addErr) {
        this.error = walletErrorMessage(addErr)
        return
      }
    }
    await this.#readChain()
  }

  client(): WalletClient & { account: { address: Address } } {
    const eth = window.ethereum
    if (!eth || !this.account) throw new Error("Connect your wallet first.")
    if (!this.onMezo) throw new Error("Switch your wallet to Mezo testnet.")
    const client = createWalletClient({
      account: this.account,
      chain,
      transport: custom(eth),
    })
    return client as WalletClient & { account: { address: Address } }
  }

  #setAccounts(accounts: string[]) {
    const first = accounts[0]
    this.account = first ? getAddress(first) : null
    this.status = first ? "connected" : "disconnected"
  }

  async #readChain() {
    const eth = window.ethereum
    if (!eth) return
    const hex = (await eth.request({ method: "eth_chainId" })) as string
    this.chainId = parseInt(hex, 16)
  }

  #listen() {
    const eth = window.ethereum
    if (!eth || this.#listening) return
    this.#listening = true
    eth.on("accountsChanged", (accounts: string[]) =>
      this.#setAccounts(accounts),
    )
    eth.on("chainChanged", (hex: string) => {
      this.chainId = parseInt(hex, 16)
    })
  }
}

export const wallet = new Wallet()

function errorCode(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code
    if (typeof code === "number") return code
  }
  return undefined
}

/** Plain-English wallet errors for people who have never seen a stack trace. */
export function walletErrorMessage(err: unknown): string {
  const code = errorCode(err)
  if (code === 4001) return "You cancelled in your wallet. Nothing was sent."
  if (code === -32002) {
    return "Your wallet already has a request open. Open MetaMask to finish it."
  }
  if (err instanceof Error && /rejected|denied/i.test(err.message)) {
    return "You cancelled in your wallet. Nothing was sent."
  }
  return err instanceof Error
    ? (err.message.split("\n")[0] ?? "Something went wrong in your wallet.")
    : "Something went wrong in your wallet."
}
