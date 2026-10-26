import { erc20Abi, vaultAbi } from "@ipin/shared"
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  encodeFunctionData,
  type Hex,
  hexToString,
  parseAbi,
  parseSignature,
  stringToHex,
} from "viem"

import { chain, publicClient } from "./client"
import { requireDeployments } from "./deployment"
import { wallet, walletErrorMessage } from "./wallet.svelte"

// ---------- Types ----------

export interface PotView {
  id: bigint
  name: string
  owner: Address
  createdAt: bigint
  balance: bigint
  cap: bigint
  spent: bigint
  remaining: bigint
}

export interface Books {
  balanced: boolean
  assets: bigint
  liabilities: bigint
  surplus: bigint
}

export interface ScheduleView {
  id: bigint
  potId: bigint
  payee: Address
  amount: bigint
  interval: bigint
  nextDue: bigint
  active: boolean
}

export type StatementEntry =
  | { kind: "credit"; amount: bigint; block: bigint; tx: Hex; time?: bigint }
  | {
      kind: "payment"
      amount: bigint
      payee: Address
      itemHash: Hex
      block: bigint
      tx: Hex
      time?: bigint
    }
  | {
      kind: "allowance"
      amount: bigint
      payee: Address
      block: bigint
      tx: Hex
      time?: bigint
    }
  | { kind: "fee"; amount: bigint; block: bigint; tx: Hex; time?: bigint }

// ---------- Names ----------

/** Pot names are bytes32 labels on-chain (UTF-8, zero padded). */
export function encodePotName(name: string): Hex {
  return stringToHex(name.trim(), { size: 32 })
}

export function decodePotName(name: Hex): string {
  try {
    return hexToString(name, { size: 32 }).replace(/\0+$/, "")
  } catch {
    return "Pot"
  }
}

export function potNameError(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed === "") return "Give the pot a name."
  if (new TextEncoder().encode(trimmed).length > 32) {
    return "Keep the name under 32 characters."
  }
  return null
}

// ---------- Reads ----------

const vault = () => requireDeployments().vault

export async function readPot(id: bigint): Promise<PotView | null> {
  const address = vault()
  const pot = await publicClient.readContract({
    address,
    abi: vaultAbi,
    functionName: "getPot",
    args: [id],
  })
  if (pot.owner === "0x0000000000000000000000000000000000000000") return null
  const [period, remaining] = await Promise.all([
    publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "currentPeriod",
      args: [id],
    }),
    publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "remainingCap",
      args: [id],
    }),
  ])
  const spent = await publicClient.readContract({
    address,
    abi: vaultAbi,
    functionName: "spent",
    args: [id, period],
  })
  return {
    id,
    name: decodePotName(pot.name),
    owner: pot.owner,
    createdAt: BigInt(pot.createdAt),
    balance: pot.balance,
    cap: pot.cap,
    spent,
    remaining,
  }
}

/** Every pot owned by `owner`. Pot ids run 1..potCount. */
export async function readPotsOf(owner: Address): Promise<PotView[]> {
  const count = await publicClient.readContract({
    address: vault(),
    abi: vaultAbi,
    functionName: "potCount",
  })
  const ids: bigint[] = []
  for (let i = 1n; i <= count; i++) ids.push(i)
  const pots = await Promise.all(ids.map((id) => readPot(id)))
  return pots.filter(
    (p): p is PotView =>
      p !== null && p.owner.toLowerCase() === owner.toLowerCase(),
  )
}

export async function readBooks(): Promise<Books> {
  const address = vault()
  const [balanced, assets, liabilities, surplus] = await Promise.all([
    publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "booksBalance",
    }),
    publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "totalAssets",
    }),
    publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "totalLiabilities",
    }),
    publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "surplus",
    }),
  ])
  return { balanced, assets, liabilities, surplus }
}

export async function readIsRequester(
  potId: bigint,
  who: Address,
): Promise<boolean> {
  return publicClient.readContract({
    address: vault(),
    abi: vaultAbi,
    functionName: "isRequester",
    args: [potId, who],
  })
}

export async function readFee(): Promise<bigint> {
  return publicClient.readContract({
    address: vault(),
    abi: vaultAbi,
    functionName: "fee",
  })
}

export async function readMusdBalance(owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: requireDeployments().musd,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  })
}

/** Many RPCs cap eth_getLogs ranges, so walk from the deploy block in chunks. */
const LOG_CHUNK = 10_000n

async function logRanges(): Promise<Array<[bigint, bigint]>> {
  const from = requireDeployments().deployBlock
  // Uncached: viem reuses the block number for ~4 s by default, so a refresh
  // right after a write would stop before the block holding its event.
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 })
  const ranges: Array<[bigint, bigint]> = []
  for (let start = from; start <= latest; start += LOG_CHUNK) {
    const end = start + LOG_CHUNK - 1n
    ranges.push([start, end > latest ? latest : end])
  }
  return ranges
}

/** Approved payees of a pot, from PayeeAdded / PayeeRemoved events, in order. */
export async function readPayees(potId: bigint): Promise<Address[]> {
  return readMembers(potId, "PayeeAdded", "PayeeRemoved", "payee")
}

/** Registered requesters of a pot. */
export async function readRequesters(potId: bigint): Promise<Address[]> {
  return readMembers(potId, "RequesterAdded", "RequesterRemoved", "requester")
}

async function readMembers(
  potId: bigint,
  added: "PayeeAdded" | "RequesterAdded",
  removed: "PayeeRemoved" | "RequesterRemoved",
  field: "payee" | "requester",
): Promise<Address[]> {
  const address = vault()
  const ranges = await logRanges()
  const events: Array<{
    add: boolean
    who: Address
    block: bigint
    index: number
  }> = []
  for (const [fromBlock, toBlock] of ranges) {
    for (const eventName of [added, removed] as const) {
      const logs = await publicClient.getContractEvents({
        address,
        abi: vaultAbi,
        eventName,
        args: { potId },
        fromBlock,
        toBlock,
      })
      for (const log of logs) {
        const args = log.args as Record<string, unknown>
        const who = args[field]
        if (typeof who !== "string") continue
        events.push({
          add: eventName === added,
          who: who as Address,
          block: log.blockNumber,
          index: log.logIndex,
        })
      }
    }
  }
  events.sort((a, b) =>
    a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1,
  )
  const set = new Map<string, Address>()
  for (const e of events) {
    if (e.add) set.set(e.who.toLowerCase(), e.who)
    else set.delete(e.who.toLowerCase())
  }
  return [...set.values()]
}

export async function readSchedules(potId: bigint): Promise<ScheduleView[]> {
  const address = vault()
  const count = await publicClient.readContract({
    address,
    abi: vaultAbi,
    functionName: "scheduleCount",
  })
  const out: ScheduleView[] = []
  for (let id = 1n; id <= count; id++) {
    const s = await publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "getSchedule",
      args: [id],
    })
    if (s.potId !== potId) continue
    const nextDue = await publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "nextDue",
      args: [id],
    })
    out.push({
      id,
      potId: s.potId,
      payee: s.payee,
      amount: s.amount,
      interval: BigInt(s.interval),
      nextDue,
      active: s.active,
    })
  }
  return out
}

/** Every money movement for a pot, newest first, read from chain events. */
export async function readStatement(potId: bigint): Promise<StatementEntry[]> {
  const address = vault()
  const ranges = await logRanges()
  const entries: Array<StatementEntry & { index: number }> = []
  for (const [fromBlock, toBlock] of ranges) {
    const common = { address, abi: vaultAbi, fromBlock, toBlock } as const
    const [credits, payments, allowances, fees] = await Promise.all([
      publicClient.getContractEvents({
        ...common,
        eventName: "PotCredited",
        args: { potId },
      }),
      publicClient.getContractEvents({
        ...common,
        eventName: "PaymentSettled",
        args: { potId },
      }),
      publicClient.getContractEvents({
        ...common,
        eventName: "ScheduledPaymentSettled",
        args: { potId },
      }),
      publicClient.getContractEvents({
        ...common,
        eventName: "FeeCharged",
        args: { potId },
      }),
    ])
    for (const l of credits) {
      entries.push({
        kind: "credit",
        amount: l.args.amount ?? 0n,
        block: l.blockNumber,
        tx: l.transactionHash,
        index: l.logIndex,
      })
    }
    for (const l of payments) {
      entries.push({
        kind: "payment",
        amount: l.args.amount ?? 0n,
        payee: l.args.payee ?? "0x0000000000000000000000000000000000000000",
        itemHash: l.args.itemHash ?? "0x",
        block: l.blockNumber,
        tx: l.transactionHash,
        index: l.logIndex,
      })
    }
    for (const l of allowances) {
      entries.push({
        kind: "allowance",
        amount: l.args.amount ?? 0n,
        payee: l.args.payee ?? "0x0000000000000000000000000000000000000000",
        block: l.blockNumber,
        tx: l.transactionHash,
        index: l.logIndex,
      })
    }
    for (const l of fees) {
      entries.push({
        kind: "fee",
        amount: l.args.fee ?? 0n,
        block: l.blockNumber,
        tx: l.transactionHash,
        index: l.logIndex,
      })
    }
  }
  entries.sort((a, b) =>
    a.block === b.block ? b.index - a.index : a.block > b.block ? -1 : 1,
  )
  const blocks = [...new Set(entries.map((e) => e.block))].slice(0, 50)
  const times = new Map<bigint, bigint>()
  await Promise.all(
    blocks.map(async (n) => {
      const b = await publicClient.getBlock({ blockNumber: n })
      times.set(n, b.timestamp)
    }),
  )
  return entries.map((entry): StatementEntry => {
    const { index, ...e } = entry
    void index
    const time = times.get(e.block)
    return time === undefined ? e : { ...e, time }
  })
}

// ---------- Writes (sender, from MetaMask) ----------

/** Send a Vault call and wait for it to be mined. Returns the tx hash. */
async function send(
  functionName: string,
  args: readonly unknown[],
): Promise<Hex> {
  const client = wallet.client()
  const address = vault()
  // Simulate first so a revert shows a plain reason before the wallet opens.
  const { request } = await publicClient.simulateContract({
    address,
    abi: vaultAbi,
    // The union of Vault write functions; each caller passes matching args.
    functionName: functionName as "createPot",
    args: args as never,
    account: client.account.address,
  })
  const hash = await client.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success")
    throw new Error("The transaction failed on-chain.")
  return hash
}

export const vaultWrites = {
  createPot: (name: string, cap: bigint) =>
    send("createPot", [encodePotName(name), cap]),
  createSplit: (potIds: bigint[], bps: bigint[], remainderPotId: bigint) =>
    // uint16 weights (<= 10_000, not amounts): viem takes them as numbers.
    send("createSplit", [
      potIds,
      bps.map((b) => parseInt(b.toString(), 10)),
      remainderPotId,
    ]),
  deposit: (splitId: bigint, amount: bigint) =>
    send("deposit", [splitId, amount]),
  setCap: (potId: bigint, cap: bigint) => send("setCap", [potId, cap]),
  addPayee: (potId: bigint, payee: Address) => send("addPayee", [potId, payee]),
  removePayee: (potId: bigint, payee: Address) =>
    send("removePayee", [potId, payee]),
  addRequester: (potId: bigint, who: Address) =>
    send("addRequester", [potId, who]),
  createSchedule: (
    potId: bigint,
    payee: Address,
    amount: bigint,
    start: bigint,
    interval: bigint,
  ) => send("createSchedule", [potId, payee, amount, start, interval]),
  cancelSchedule: (id: bigint) => send("cancelSchedule", [id]),
  /** Cancel a signed approval that was never submitted (M-01). */
  invalidateNonce: (nonce: bigint) => send("invalidateNonce", [nonce]),
}

const musdPermitAbi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
])

/**
 * Sign an EIP-2612 permit letting the Vault pull `amount` MUSD. A signature,
 * not a transaction: no gas, and it rides inside the setup multicall.
 */
async function signMusdPermit(
  amount: bigint,
): Promise<{ deadline: bigint; v: number; r: Hex; s: Hex }> {
  const client = wallet.client()
  const owner = client.account.address
  const { musd, vault: spender } = requireDeployments()
  const nonce = await publicClient.readContract({
    address: musd,
    abi: musdPermitAbi,
    functionName: "nonces",
    args: [owner],
  })
  const deadline = BigInt(Date.now()) / 1000n + 30n * 60n
  const signature = await client.signTypedData({
    account: owner,
    // MUSD's domain (docs/research/mezo.md section 3).
    domain: {
      name: "Mezo USD",
      version: "1",
      chainId: chain.id,
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
    message: { owner, spender, value: amount, nonce, deadline },
  })
  // uint8 v from the recovery bit (27 or 28), as permit() expects.
  const { r, s, yParity } = parseSignature(signature)
  return { deadline, v: yParity + 27, r, s }
}

export interface SetupPlan {
  pots: { name: string; cap: bigint }[]
  /** Present when money is added now: bps per pot, the rest pot's index, total. */
  deposit?: { bps: bigint[]; restIndex: number; amount: bigint }
}

/**
 * The sender's whole setup in ONE transaction (Vault.multicall): create the
 * pots, save the split and deposit with a permit. Pot and split ids are
 * predicted from the counters; if someone else creates one first, the batch
 * reverts as a whole (test_R2_multicallRevertsWhenPredictedPotIdTaken) and
 * nothing happened, so pressing the button again is safe.
 */
export async function setupInOneTransaction(plan: SetupPlan): Promise<Hex> {
  const address = vault()
  const [potCount, splitCount] = await Promise.all([
    publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "potCount",
    }),
    publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "splitCount",
    }),
  ])
  const potIds = plan.pots.map((_, i) => potCount + BigInt(i) + 1n)
  const calls: Hex[] = plan.pots.map((p) =>
    encodeFunctionData({
      abi: vaultAbi,
      functionName: "createPot",
      args: [encodePotName(p.name), p.cap],
    }),
  )
  if (plan.deposit) {
    const { bps, restIndex, amount } = plan.deposit
    const rest = potIds[restIndex]
    if (rest === undefined) throw new Error("A pot is missing. Try again.")
    const permit = await signMusdPermit(amount)
    calls.push(
      encodeFunctionData({
        abi: vaultAbi,
        functionName: "createSplit",
        // uint16 weights (<= 10_000, not amounts): viem takes them as numbers.
        args: [potIds, bps.map((b) => parseInt(b.toString(), 10)), rest],
      }),
      encodeFunctionData({
        abi: vaultAbi,
        functionName: "depositWithPermit",
        args: [
          splitCount + 1n,
          amount,
          permit.deadline,
          permit.v,
          permit.r,
          permit.s,
        ],
      }),
    )
  }
  return send("multicall", [calls])
}

/** Approve the Vault to pull `amount` MUSD for a deposit, if needed. */
export async function approveMusd(amount: bigint): Promise<Hex | null> {
  const client = wallet.client()
  const { musd, vault: spender } = requireDeployments()
  const allowance = await publicClient.readContract({
    address: musd,
    abi: erc20Abi,
    functionName: "allowance",
    args: [client.account.address, spender],
  })
  if (allowance >= amount) return null
  const hash = await client.writeContract({
    address: musd,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
    account: client.account.address,
    chain: client.chain,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

/** Read the id a create* call returned, from its event in the receipt. */
export async function newIdFrom(
  hash: Hex,
  eventName: "PotCreated" | "SplitCreated" | "ScheduleCreated",
): Promise<bigint> {
  const receipt = await publicClient.getTransactionReceipt({ hash })
  const logs = await publicClient.getContractEvents({
    address: vault(),
    abi: vaultAbi,
    eventName,
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  })
  const log = logs.find((l) => l.transactionHash === hash)
  const args = (log?.args ?? {}) as Record<string, unknown>
  const id = args.potId ?? args.splitId ?? args.scheduleId
  if (eventName === "PotCreated" && typeof args.potId === "bigint")
    return args.potId
  if (eventName === "SplitCreated" && typeof args.splitId === "bigint")
    return args.splitId
  if (eventName === "ScheduleCreated" && typeof args.scheduleId === "bigint")
    return args.scheduleId
  if (typeof id === "bigint") return id
  throw new Error("Could not read the new id from the transaction.")
}

// ---------- Errors in plain English ----------

const REVERT_MESSAGES: Record<string, string> = {
  PotNotFound: "That pot doesn't exist.",
  NotPotOwner: "Only the person who created this pot can change it.",
  NotSplitOwner: "Only the person who created this split can deposit with it.",
  SplitWeightsInvalid: "The split doesn't add up to 100%.",
  ZeroWeight: "Every pot in the split needs a share above zero.",
  DuplicatePot: "A pot appears twice in the split.",
  RemainderPotNotInSplit: "The pot that takes the rest must be in the split.",
  ZeroAmount: "Enter an amount above $0.00.",
  ZeroAddress: "That address is empty.",
  InvalidPayee: "That address can't receive money from a pot.",
  PayeeAlreadyApproved: "That payee is already approved.",
  PayeeNotApproved: "That payee isn't approved for this pot.",
  RequesterAlreadyRegistered: "That person is already registered on this pot.",
  RequesterNotRegistered: "That person isn't registered on this pot.",
  AddressIsRequester:
    "That address asks for money on this pot, so it can't be paid from it.",
  AddressIsPayee:
    "That address is a payee of this pot, so it can't ask for money from it.",
  RequestExpired: "This approval expired. Approve it again.",
  NonceAlreadyUsed: "This approval was already paid or cancelled.",
  InvalidSignature: "The approval signature didn't match the pot owner.",
  CapExceeded: "This would go over the pot's monthly limit.",
  InsufficientPotBalance:
    "The pot doesn't have enough money for this plus the fee.",
  ScheduleNotFound: "That allowance doesn't exist.",
  ScheduleNotActive: "That allowance was cancelled.",
  ScheduleNotDue: "That allowance isn't due yet.",
  IntervalZero: "Choose how often the allowance pays.",
  ERC20InsufficientBalance: "Your wallet doesn't have enough MUSD.",
  ERC20InsufficientAllowance:
    "The vault isn't allowed to take that much MUSD yet.",
}

/** True when a failure means the approval's nonce is spent: settled or cancelled. */
export function isNonceUsed(err: unknown): boolean {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (
      revert instanceof ContractFunctionRevertedError &&
      revert.data?.errorName === "NonceAlreadyUsed"
    ) {
      return true
    }
  }
  return err instanceof Error && /NonceAlreadyUsed/.test(err.message)
}

export function txErrorMessage(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name]
      if (name) return `The contract refused this (${name}).`
    }
    if (/insufficient funds/i.test(err.message)) {
      return "Your wallet needs a little testnet BTC for gas. Get some from the Mezo faucet."
    }
    return walletErrorMessage(
      err.shortMessage ? new Error(err.shortMessage) : err,
    )
  }
  return walletErrorMessage(err)
}
