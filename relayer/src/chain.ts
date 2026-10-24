// Every chain read and write the relayer makes, behind one interface so the
// service is testable without a network. The Vault stays the authority (T6):
// writes are simulated first so a failing call is never broadcast.
import {
  type Account,
  type Address,
  BaseError,
  type Chain as ViemChain,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type PublicClient,
  type Transport,
  type WalletClient,
  zeroAddress,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

import { type PaymentRequest, vaultAbi } from "@ipin/shared"

export interface Schedule {
  id: bigint
  potId: bigint
  payee: Address
  amount: bigint
  active: boolean
  nextDue: bigint
}

export type ReceiptStatus = "success" | "reverted"

export interface Chain {
  readonly chainId: number
  readonly vault: Address
  readonly relayerAddress: Address
  relayerBalance(): Promise<bigint>
  latestTimestamp(): Promise<bigint>
  /** Pot owner (the sender), or null if the pot does not exist. */
  potOwner(potId: bigint): Promise<Address | null>
  isRequester(potId: bigint, account: Address): Promise<boolean>
  isPayee(potId: bigint, account: Address): Promise<boolean>
  hasCode(account: Address): Promise<boolean>
  fee(): Promise<bigint>
  /** Simulate then broadcast `execute`; throws SimulationError if it would revert. */
  submitExecute(request: PaymentRequest, signature: Hex): Promise<Hex>
  /** Simulate then broadcast `executeSchedule`; throws SimulationError if it would revert. */
  submitExecuteSchedule(scheduleId: bigint): Promise<Hex>
  waitForReceipt(hash: Hex, timeoutMs?: number): Promise<ReceiptStatus>
  scheduleCount(): Promise<bigint>
  getSchedule(scheduleId: bigint): Promise<Schedule>
}

/** The call would revert; `reason` is the decoded custom error when known. */
export class SimulationError extends Error {
  override name = "SimulationError"
  constructor(readonly reason: string) {
    super(reason)
  }
}

/** Decoded revert (`CapExceeded(1, 0, 5, 3)`) or viem's short message. */
export function describeError(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name !== undefined) {
        const args = (reverted.data?.args ?? []).map((a) => String(a))
        return `${name}(${args.join(", ")})`
      }
      return reverted.reason ?? reverted.shortMessage
    }
    return err.shortMessage
  }
  return err instanceof Error ? err.message : String(err)
}

export interface ViemChainOptions {
  publicClient: PublicClient<Transport, ViemChain>
  walletClient: WalletClient<Transport, ViemChain, Account>
  vault: Address
}

export function createViemChain(opts: ViemChainOptions): Chain {
  const { publicClient, walletClient, vault } = opts
  const account = walletClient.account
  const read = { address: vault, abi: vaultAbi } as const

  return {
    chainId: publicClient.chain.id,
    vault,
    relayerAddress: account.address,

    relayerBalance: () => publicClient.getBalance({ address: account.address }),

    async latestTimestamp() {
      const block = await publicClient.getBlock({ blockTag: "latest" })
      return block.timestamp
    },

    async potOwner(potId) {
      const pot = await publicClient.readContract({
        ...read,
        functionName: "getPot",
        args: [potId],
      })
      return pot.owner === zeroAddress ? null : pot.owner
    },

    isRequester: (potId, a) =>
      publicClient.readContract({
        ...read,
        functionName: "isRequester",
        args: [potId, a],
      }),

    isPayee: (potId, a) =>
      publicClient.readContract({
        ...read,
        functionName: "isPayee",
        args: [potId, a],
      }),

    async hasCode(a) {
      const code = await publicClient.getCode({ address: a })
      return code !== undefined && code !== "0x"
    },

    fee: () => publicClient.readContract({ ...read, functionName: "fee" }),

    async submitExecute(request, signature) {
      let simulated
      try {
        simulated = await publicClient.simulateContract({
          ...read,
          functionName: "execute",
          args: [request, signature],
          account,
        })
      } catch (err) {
        throw new SimulationError(describeError(err))
      }
      return walletClient.writeContract(simulated.request)
    },

    async submitExecuteSchedule(scheduleId) {
      let simulated
      try {
        simulated = await publicClient.simulateContract({
          ...read,
          functionName: "executeSchedule",
          args: [scheduleId],
          account,
        })
      } catch (err) {
        throw new SimulationError(describeError(err))
      }
      return walletClient.writeContract(simulated.request)
    },

    async waitForReceipt(hash, timeoutMs = 60_000) {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: timeoutMs,
      })
      return receipt.status
    },

    scheduleCount: () =>
      publicClient.readContract({ ...read, functionName: "scheduleCount" }),

    async getSchedule(scheduleId) {
      const [s, nextDue] = await Promise.all([
        publicClient.readContract({
          ...read,
          functionName: "getSchedule",
          args: [scheduleId],
        }),
        publicClient.readContract({
          ...read,
          functionName: "nextDue",
          args: [scheduleId],
        }),
      ])
      return {
        id: scheduleId,
        potId: s.potId,
        payee: s.payee,
        amount: s.amount,
        active: s.active,
        nextDue,
      }
    },
  }
}

/** Real clients over HTTP for the configured RPC. */
export function createHttpChain(opts: {
  rpcUrl: string
  privateKey: Hex
  chain: ViemChain
  vault: Address
}): Chain {
  const transport = http(opts.rpcUrl, { retryCount: 2, timeout: 20_000 })
  const publicClient = createPublicClient({ chain: opts.chain, transport })
  const walletClient = createWalletClient({
    chain: opts.chain,
    transport,
    account: privateKeyToAccount(opts.privateKey),
  })
  return createViemChain({ publicClient, walletClient, vault: opts.vault })
}
