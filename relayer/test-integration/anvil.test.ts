// End-to-end against real contracts on a local anvil (chain id 31611 so the
// EIP-712 domain matches Mezo testnet): requester signs a request, the sender
// approves, the relayer simulates and sends `execute`, the payee is paid.
// Also runs one scheduler tick. Run: pnpm --filter relayer test:anvil
// (needs Foundry: anvil + `forge build` artifacts in contracts/out).
import { type ChildProcess, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  type Hex,
  http,
  maxUint256,
  parseAbi,
  parseSignature,
  stringToHex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  erc20Abi,
  itemHash,
  mezoTestnet,
  paymentRequestDomain,
  paymentRequestTypedData,
  rejectMessage,
  requestSchema,
  requestSigningMessage,
  toPaymentRequestJson,
  vaultAbi,
} from "@ipin/shared"

import { createApp } from "../src/app"
import { createViemChain } from "../src/chain"
import { createLogger } from "../src/logger"
import { createRuntime } from "../src/runtime"
import { runSchedulerTick } from "../src/scheduler"
import { RelayerService } from "../src/service"
import { Store } from "../src/store"

const UNIT = 10n ** 18n
const FEE = 25n * 10n ** 16n
const port = 18545 + (process.pid % 1000)
const rpcUrl = `http://127.0.0.1:${port}`
const anvilChain = defineChain({
  ...mezoTestnet,
  rpcUrls: { default: { http: [rpcUrl] } },
})

// anvil's default accounts #0-#2: relayer, sender, requester.
const relayer = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
)
const sender = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
)
const requester = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
)
const payee: Address = "0x000000000000000000000000000000000000bEEF"

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const path = join(
    import.meta.dirname,
    `../../contracts/out/${name}.sol/${name}.json`,
  )
  const json = JSON.parse(readFileSync(path, "utf8")) as {
    abi: Abi
    bytecode: { object: Hex }
  }
  return { abi: json.abi, bytecode: json.bytecode.object }
}

const anvilBin =
  process.env.ANVIL_BIN ??
  join(
    homedir(),
    ".foundry",
    "bin",
    process.platform === "win32" ? "anvil.exe" : "anvil",
  )

let anvil: ChildProcess | undefined
const publicClient = createPublicClient({
  chain: anvilChain,
  transport: http(rpcUrl),
})
const senderWallet = createWalletClient({
  chain: anvilChain,
  transport: http(rpcUrl),
  account: sender,
})
let vault: Address
let musd: Address

async function waitForRpc(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      await publicClient.getChainId()
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error(`anvil did not start at ${rpcUrl}`)
}

async function send(hash: Promise<Hex>) {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: await hash,
  })
  expect(receipt.status).toBe("success")
  return receipt
}

beforeAll(async () => {
  anvil = spawn(
    anvilBin,
    ["--port", String(port), "--chain-id", String(mezoTestnet.id), "--silent"],
    { stdio: "ignore" },
  )
  await waitForRpc()

  const mock = artifact("MockMUSD")
  const musdReceipt = await send(
    senderWallet.deployContract({ abi: mock.abi, bytecode: mock.bytecode }),
  )
  musd = musdReceipt.contractAddress ?? "0x"
  const v = artifact("Vault")
  const vaultReceipt = await send(
    senderWallet.deployContract({
      abi: v.abi,
      bytecode: v.bytecode,
      args: [musd, relayer.address, FEE],
    }),
  )
  vault = vaultReceipt.contractAddress ?? "0x"

  await send(
    senderWallet.writeContract({
      address: musd,
      abi: mock.abi,
      functionName: "mint",
      args: [sender.address, 1000n * UNIT],
    }),
  )
  await send(
    senderWallet.writeContract({
      address: musd,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, maxUint256],
    }),
  )
  const w = { address: vault, abi: vaultAbi } as const
  await send(
    senderWallet.writeContract({
      ...w,
      functionName: "createPot",
      args: [stringToHex("House", { size: 32 }), 500n * UNIT],
    }),
  )
  await send(
    senderWallet.writeContract({
      ...w,
      functionName: "createSplit",
      args: [[1n], [10_000], 1n],
    }),
  )
  await send(
    senderWallet.writeContract({
      ...w,
      functionName: "deposit",
      args: [1n, 1000n * UNIT],
    }),
  )
  await send(
    senderWallet.writeContract({
      ...w,
      functionName: "addPayee",
      args: [1n, payee],
    }),
  )
  await send(
    senderWallet.writeContract({
      ...w,
      functionName: "addRequester",
      args: [1n, requester.address],
    }),
  )
}, 60_000)

afterAll(() => {
  anvil?.kill()
})

function makeRelayer() {
  const logger = createLogger({ level: "silent" })
  const chain = createViemChain({
    publicClient,
    walletClient: createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: relayer,
    }),
    vault,
  })
  const runtime = createRuntime({
    relayerAddress: relayer.address,
    chainId: mezoTestnet.id,
    load: () => ({
      chainId: mezoTestnet.id,
      musd,
      pots: vault,
      policyEngine: vault,
      relayer: relayer.address,
      deployBlock: 0n,
      vault,
    }),
    makeChain: () => chain,
    logger,
  })
  const service = new RelayerService({
    store: new Store(null),
    runtime,
    appUrl: "http://localhost:5173",
    logger,
  })
  const app = createApp({ service, logger, corsOrigin: "*" })
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: res.status, json: await res.json() }
  }
  return { call, runtime }
}

async function postRequest(
  call: ReturnType<typeof makeRelayer>["call"],
  note: string,
): Promise<string> {
  const body = {
    potId: "1",
    payee,
    item: "Cement bag 50kg",
    quantity: "2",
    unitPrice: (9n * UNIT).toString(),
    vendor: "Vendor Y",
    note,
    requester: requester.address,
  }
  const signature = await requester.signMessage({
    message: requestSigningMessage(body),
  })
  const res = await call("POST", "/requests", { ...body, signature })
  expect(res.status).toBe(201)
  return (res.json as { id: string }).id
}

const balanceOf = (a: Address) =>
  publicClient.readContract({
    address: musd,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [a],
  })

describe("anvil: approve -> execute", () => {
  it("pays the payee, charges the fee, and refuses a replayed nonce", async () => {
    const { call } = makeRelayer()
    const health = await call("GET", "/health")
    expect(health.json).toMatchObject({ ok: true, deployed: true })

    const id = await postRequest(call, "first")
    const amount = 18n * UNIT
    const pr = {
      potId: 1n,
      payee,
      amount,
      itemHash: itemHash("Cement bag 50kg", 2n, 9n * UNIT, "Vendor Y"),
      nonce: 777n,
      expiry: BigInt(Date.now()) / 1000n + 3600n,
    }
    const senderSignature = await sender.signTypedData(
      paymentRequestTypedData(paymentRequestDomain(mezoTestnet.id, vault), pr),
    )
    const before = await balanceOf(payee)
    const potBefore = await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "potBalance",
      args: [1n],
    })

    const res = await call("POST", `/requests/${id}/approve`, {
      paymentRequest: toPaymentRequestJson(pr),
      senderSignature,
    })
    expect(res.status).toBe(200)
    const r = requestSchema.parse((await call("GET", `/requests/${id}`)).json)
    expect(r.status).toBe("executed")
    expect(await balanceOf(payee)).toBe(before + amount)
    expect(
      await publicClient.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "potBalance",
        args: [1n],
      }),
    ).toBe(potBefore - amount - FEE)
    expect(
      await publicClient.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "booksBalance",
      }),
    ).toBe(true)

    // R3: the same signed approval on another request never broadcasts.
    const id2 = await postRequest(call, "second")
    const replay = await call("POST", `/requests/${id2}/approve`, {
      paymentRequest: toPaymentRequestJson(pr),
      senderSignature,
    })
    expect(replay.status).toBe(422)
    expect(
      (replay.json as { error: { message: string } }).error.message,
    ).toMatch(/^NonceAlreadyUsed\(/)
    const r2 = requestSchema.parse((await call("GET", `/requests/${id2}`)).json)
    expect(r2.status).toBe("pending")

    // The sender rejects it instead.
    const rejected = await call("POST", `/requests/${id2}/reject`, {
      senderSignature: await sender.signMessage({
        message: rejectMessage(id2),
      }),
    })
    expect(rejected.json).toEqual({ ok: true })
  }, 60_000)
})

describe("anvil: scheduler", () => {
  it("executes a due schedule once", async () => {
    const { runtime } = makeRelayer()
    const block = await publicClient.getBlock()
    await send(
      senderWallet.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "createSchedule",
        args: [1n, payee, UNIT, block.timestamp - 1n, 3600n],
      }),
    )
    const before = await balanceOf(payee)
    const logger = createLogger({ level: "silent" })
    const first = await runSchedulerTick(runtime, logger)
    expect(first?.executed).toEqual(["1"])
    expect(await balanceOf(payee)).toBe(before + UNIT)
    const second = await runSchedulerTick(runtime, logger)
    expect(second?.executed).toEqual([])
  }, 60_000)
})

describe("anvil: one-transaction setup", () => {
  it("creates pots, saves the split and deposits with a permit in one multicall", async () => {
    // anvil's account #3: a new sender with MUSD and no allowance, as in the app.
    const fresh = privateKeyToAccount(
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    )
    const freshWallet = createWalletClient({
      chain: anvilChain,
      transport: http(rpcUrl),
      account: fresh,
    })
    await send(senderWallet.sendTransaction({ to: fresh.address, value: UNIT }))
    const mock = artifact("MockMUSD")
    await send(
      senderWallet.writeContract({
        address: musd,
        abi: mock.abi,
        functionName: "mint",
        args: [fresh.address, 10n * UNIT],
      }),
    )
    const w = { address: vault, abi: vaultAbi } as const
    const potCount = await publicClient.readContract({
      ...w,
      functionName: "potCount",
    })
    const splitCount = await publicClient.readContract({
      ...w,
      functionName: "splitCount",
    })
    const [house, upkeep] = [potCount + 1n, potCount + 2n]
    const amount = 10n * UNIT
    const nonce = await publicClient.readContract({
      address: musd,
      abi: parseAbi(["function nonces(address) view returns (uint256)"]),
      functionName: "nonces",
      args: [fresh.address],
    })
    const deadline = BigInt(Date.now()) / 1000n + 1800n
    // Same permit and batch as app/src/lib/chain/vault.ts setupInOneTransaction.
    const { r, s, yParity } = parseSignature(
      await freshWallet.signTypedData({
        domain: {
          name: "Mezo USD",
          version: "1",
          chainId: mezoTestnet.id,
          verifyingContract: musd,
        },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: {
          owner: fresh.address,
          spender: vault,
          value: amount,
          nonce,
          deadline,
        },
      }),
    )
    const calls = [
      encodeFunctionData({
        ...w,
        functionName: "createPot",
        args: [stringToHex("House", { size: 32 }), 8n * UNIT],
      }),
      encodeFunctionData({
        ...w,
        functionName: "createPot",
        args: [stringToHex("Upkeep", { size: 32 }), 3n * UNIT],
      }),
      encodeFunctionData({
        ...w,
        functionName: "createSplit",
        args: [[house, upkeep], [7500, 2500], house],
      }),
      encodeFunctionData({
        ...w,
        functionName: "depositWithPermit",
        args: [splitCount + 1n, amount, deadline, yParity + 27, r, s],
      }),
    ]

    await send(
      freshWallet.writeContract({
        ...w,
        functionName: "multicall",
        args: [calls],
      }),
    )

    const balance = (id: bigint) =>
      publicClient.readContract({
        ...w,
        functionName: "potBalance",
        args: [id],
      })
    expect(await balance(house)).toBe(75n * 10n ** 17n)
    expect(await balance(upkeep)).toBe(25n * 10n ** 17n)
    expect(
      await publicClient.readContract({ ...w, functionName: "booksBalance" }),
    ).toBe(true)
  })
})
