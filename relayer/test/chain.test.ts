// createViemChain against a mocked JSON-RPC transport: real viem clients,
// real ABI encoding and signing, no network.
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  type Hex,
  keccak256,
  numberToHex,
  zeroAddress,
} from "viem"
import { describe, expect, it } from "vitest"

import { mezoTestnet, type PaymentRequest, vaultAbi } from "@ipin/shared"

import { createViemChain, SimulationError } from "../src/chain"

import { payee, relayerAccount, sender, signApproval, vault } from "./helpers"

interface MockOptions {
  revertExecute?: boolean
  receiptStatus?: "0x1" | "0x0"
}

function mockRpc(opts: MockOptions = {}) {
  const calls: string[] = []
  const sent: Hex[] = []
  const block = {
    number: "0x10",
    hash: `0x${"aa".repeat(32)}`,
    parentHash: `0x${"bb".repeat(32)}`,
    timestamp: numberToHex(1_700_000_000),
    baseFeePerGas: "0x1",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    transactions: [],
  }

  const ethCall = (data: Hex): Hex => {
    const { functionName, args } = decodeFunctionData({ abi: vaultAbi, data })
    calls.push(functionName)
    switch (functionName) {
      case "getPot":
        return encodeFunctionResult({
          abi: vaultAbi,
          functionName,
          result: {
            owner: args[0] === 1n ? sender.address : zeroAddress,
            createdAt: 1n,
            name: `0x${"00".repeat(32)}`,
            balance: 10n ** 21n,
            cap: 10n ** 21n,
          },
        })
      case "isRequester":
      case "isPayee":
        return encodeFunctionResult({
          abi: vaultAbi,
          functionName,
          result: functionName === "isPayee",
        })
      case "fee":
        return encodeFunctionResult({
          abi: vaultAbi,
          functionName,
          result: 25n * 10n ** 16n,
        })
      case "execute":
        if (opts.revertExecute === true) {
          throw Object.assign(new Error("execution reverted"), {
            code: 3,
            data: encodeErrorResult({
              abi: vaultAbi,
              errorName: "CapExceeded",
              args: [1n, 0n, 5n, 3n],
            }),
          })
        }
        return "0x"
      case "scheduleCount":
        return encodeFunctionResult({ abi: vaultAbi, functionName, result: 1n })
      case "getSchedule":
        return encodeFunctionResult({
          abi: vaultAbi,
          functionName,
          result: {
            potId: 1n,
            payee,
            amount: 5n,
            start: 0n,
            interval: 60n,
            nextPeriod: 0n,
            active: true,
          },
        })
      case "nextDue":
        return encodeFunctionResult({
          abi: vaultAbi,
          functionName,
          result: 123n,
        })
      default:
        throw new Error(`unmocked ${functionName}`)
    }
  }

  const transport = custom({
    request: ({ method, params }: { method: string; params?: unknown }) => {
      const p = (params ?? []) as unknown[]
      switch (method) {
        case "eth_chainId":
          return Promise.resolve(numberToHex(mezoTestnet.id))
        case "eth_call":
          return Promise.resolve(ethCall((p[0] as { data: Hex }).data))
        case "eth_getBalance":
          return Promise.resolve("0x2386f26fc10000")
        case "eth_getCode":
          return Promise.resolve(
            String(p[0]).toLowerCase() === vault.toLowerCase() ? "0x60" : "0x",
          )
        case "eth_getBlockByNumber":
          return Promise.resolve(block)
        case "eth_blockNumber":
          return Promise.resolve("0x11")
        case "eth_getTransactionCount":
          return Promise.resolve("0x0")
        case "eth_estimateGas":
          return Promise.resolve("0x30000")
        case "eth_maxPriorityFeePerGas":
        case "eth_gasPrice":
          return Promise.resolve("0x1")
        case "eth_sendRawTransaction": {
          const raw = p[0] as Hex
          sent.push(raw)
          return Promise.resolve(keccak256(raw))
        }
        case "eth_getTransactionReceipt":
          return Promise.resolve({
            transactionHash: p[0],
            blockHash: block.hash,
            blockNumber: "0x10",
            transactionIndex: "0x0",
            from: relayerAccount.address,
            to: vault,
            status: opts.receiptStatus ?? "0x1",
            cumulativeGasUsed: "0x1",
            gasUsed: "0x1",
            effectiveGasPrice: "0x1",
            logs: [],
            logsBloom: `0x${"00".repeat(256)}`,
            type: "0x2",
            contractAddress: null,
          })
        default:
          return Promise.reject(new Error(`unmocked RPC ${method}`))
      }
    },
  })

  const chain = createViemChain({
    publicClient: createPublicClient({ chain: mezoTestnet, transport }),
    walletClient: createWalletClient({
      chain: mezoTestnet,
      transport,
      account: relayerAccount,
    }),
    vault,
  })
  return { chain, calls, sent }
}

const pr: PaymentRequest = {
  potId: 1n,
  payee,
  amount: 5n,
  itemHash: `0x${"11".repeat(32)}`,
  nonce: 7n,
  expiry: 2_000_000_000n,
}

describe("createViemChain (mocked RPC)", () => {
  it("reads pots, roles, fee, balance and code", async () => {
    const { chain } = mockRpc()
    expect(chain.chainId).toBe(31611)
    expect(chain.relayerAddress).toBe(relayerAccount.address)
    expect(await chain.potOwner(1n)).toBe(sender.address)
    expect(await chain.potOwner(2n)).toBeNull()
    expect(await chain.isRequester(1n, payee)).toBe(false)
    expect(await chain.isPayee(1n, payee)).toBe(true)
    expect(await chain.fee()).toBe(25n * 10n ** 16n)
    expect(await chain.relayerBalance()).toBe(10n ** 16n)
    expect(await chain.hasCode(vault)).toBe(true)
    expect(await chain.hasCode(payee)).toBe(false)
    expect(await chain.latestTimestamp()).toBe(1_700_000_000n)
  })

  it("simulates, signs and broadcasts execute, then reads the receipt", async () => {
    const { chain, calls, sent } = mockRpc()
    const hash = await chain.submitExecute(pr, await signApproval(pr))
    expect(calls).toContain("execute")
    expect(sent).toHaveLength(1)
    expect(hash).toBe(keccak256(sent[0] ?? "0x"))
    expect(await chain.waitForReceipt(hash, 5_000)).toBe("success")
  })

  it("reports a reverted receipt", async () => {
    const { chain } = mockRpc({ receiptStatus: "0x0" })
    const hash = await chain.submitExecute(pr, await signApproval(pr))
    expect(await chain.waitForReceipt(hash, 5_000)).toBe("reverted")
  })

  it("never broadcasts a reverting execute; decodes the custom error", async () => {
    const { chain, sent } = mockRpc({ revertExecute: true })
    const err: unknown = await chain
      .submitExecute(pr, await signApproval(pr))
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SimulationError)
    expect((err as SimulationError).reason).toBe("CapExceeded(1, 0, 5, 3)")
    expect(sent).toHaveLength(0)
  })

  it("reads schedules with their next due time", async () => {
    const { chain } = mockRpc()
    expect(await chain.scheduleCount()).toBe(1n)
    expect(await chain.getSchedule(1n)).toEqual({
      id: 1n,
      potId: 1n,
      payee,
      amount: 5n,
      active: true,
      nextDue: 123n,
    })
  })
})
