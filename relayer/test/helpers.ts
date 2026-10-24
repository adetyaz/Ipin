import { type Address, getAddress, type Hex, keccak256, toHex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

import {
  type CreateRequestBodyJson,
  type Deployments,
  mezoTestnet,
  type PaymentRequest,
  paymentRequestDomain,
  paymentRequestTypedData,
  requestSigningMessage,
} from "@ipin/shared"

import { createApp } from "../src/app"
import { type Chain, type Schedule, SimulationError } from "../src/chain"
import { createLogger } from "../src/logger"
import { createRuntime, type Runtime } from "../src/runtime"
import { RelayerService } from "../src/service"
import { Store } from "../src/store"

// Well-known anvil test keys: no value on any real network.
export const sender = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
)
export const requester = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
)
export const stranger = privateKeyToAccount(
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
)
export const relayerKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const
export const relayerAccount = privateKeyToAccount(relayerKey)
export const payee = getAddress("0x000000000000000000000000000000000000bEEF")
export const vault = getAddress("0x5FbDB2315678afecb367f032d93F642f64180aa3")

export const silentLogger = createLogger({ level: "silent" })

export const deployments: Deployments = {
  chainId: mezoTestnet.id,
  musd: getAddress("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"),
  pots: vault,
  policyEngine: vault,
  relayer: relayerAccount.address,
  deployBlock: 1n,
  vault,
}

/** In-memory Chain with the Vault's view semantics; writes are scripted. */
export class FakeChain implements Chain {
  readonly chainId = mezoTestnet.id
  readonly vault = vault
  readonly relayerAddress = relayerAccount.address
  owners = new Map<bigint, Address>([[1n, sender.address]])
  requesters = new Set<string>([`1:${requester.address}`])
  payees = new Set<string>([`1:${payee}`])
  contracts = new Set<string>([vault])
  balance = 10n ** 16n
  feeAmount = 25n * 10n ** 16n
  now = 1_000n
  schedules: Schedule[] = []
  executeCalls: { request: PaymentRequest; signature: Hex }[] = []
  scheduleCalls: bigint[] = []
  simulateError: string | undefined
  receipt: "success" | "reverted" | "hang" = "success"

  relayerBalance = () => Promise.resolve(this.balance)
  latestTimestamp = () => Promise.resolve(this.now)
  potOwner = (potId: bigint) => Promise.resolve(this.owners.get(potId) ?? null)
  isRequester = (potId: bigint, a: Address) =>
    Promise.resolve(this.requesters.has(`${potId}:${a}`))
  isPayee = (potId: bigint, a: Address) =>
    Promise.resolve(this.payees.has(`${potId}:${a}`))
  hasCode = (a: Address) => Promise.resolve(this.contracts.has(a))
  fee = () => Promise.resolve(this.feeAmount)

  submitExecute = (request: PaymentRequest, signature: Hex) => {
    if (this.simulateError !== undefined) {
      return Promise.reject(new SimulationError(this.simulateError))
    }
    this.executeCalls.push({ request, signature })
    return Promise.resolve(keccak256(toHex(`tx${this.executeCalls.length}`)))
  }

  submitExecuteSchedule = (id: bigint) => {
    if (this.simulateError !== undefined) {
      return Promise.reject(new SimulationError(this.simulateError))
    }
    this.scheduleCalls.push(id)
    return Promise.resolve(keccak256(toHex(`schedule${id}`)))
  }

  waitForReceipt = () =>
    this.receipt === "hang"
      ? new Promise<"success">(() => undefined)
      : Promise.resolve(this.receipt)

  scheduleCount = () => Promise.resolve(BigInt(this.schedules.length))
  getSchedule = (id: bigint) => {
    const s = this.schedules.find((x) => x.id === id)
    if (!s) throw new Error(`schedule ${id}`)
    return Promise.resolve(s)
  }
}

export function makeRuntime(chain: Chain | null): Runtime {
  return createRuntime({
    relayerAddress: relayerAccount.address,
    chainId: mezoTestnet.id,
    load: () => {
      if (chain === null) throw new Error("not deployed")
      return deployments
    },
    makeChain: () => {
      if (chain === null) throw new Error("unreachable")
      return chain
    },
    logger: silentLogger,
  })
}

export function makeApp(
  chain: Chain | null,
  opts: { now?: Date; receiptTimeoutMs?: number } = {},
) {
  const store = new Store(null)
  const service = new RelayerService({
    store,
    runtime: makeRuntime(chain),
    appUrl: "https://app.example",
    logger: silentLogger,
    now: () => opts.now ?? new Date(1_000_000),
    ...(opts.receiptTimeoutMs === undefined
      ? {}
      : { receiptTimeoutMs: opts.receiptTimeoutMs }),
  })
  const app = createApp({
    service,
    logger: silentLogger,
    corsOrigin: ["https://app.example"],
  })
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: res.status, json: await res.json() }
  }
  return { app, store, service, call }
}

export async function signedRequestBody(
  overrides: Partial<CreateRequestBodyJson> = {},
  signer = requester,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    potId: "1",
    payee,
    item: "Cement bag 50kg",
    quantity: "200",
    unitPrice: "9000000000000000000",
    vendor: "Vendor Y",
    requester: requester.address,
    ...overrides,
  }
  const signature = await signer.signMessage({
    message: requestSigningMessage(body),
  })
  return { ...body, signature }
}

export async function signApproval(
  pr: PaymentRequest,
  signer = sender,
): Promise<Hex> {
  return signer.signTypedData(
    paymentRequestTypedData(paymentRequestDomain(mezoTestnet.id, vault), pr),
  )
}
