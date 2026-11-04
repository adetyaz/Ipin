import {
  mezoBorrowerOperationsAbi,
  mezoBorrowerOperationsSignaturesAbi,
  mezoPriceFeedAbi,
  mezoTroveManagerAbi,
  TROVE_ACTIVE,
  vaultAbi,
} from "@ipin/shared"
import { type Address, zeroAddress } from "viem"

import type { CreditLine } from "#/sender/credit"

import { publicClient } from "./client"
import { requireDeployments } from "./deployment"

/** The sender's Mezo trove, as far as borrow-to-pay (R13) needs it. */
export type Credit =
  | { status: "disabled" } // this Vault was deployed without borrow-to-pay
  | { status: "no-trove"; bos: Address }
  | { status: "active"; bos: Address; line: CreditLine; nonce: bigint }

/**
 * Read the owner's trove through the same Mezo contracts the Vault calls:
 * Vault.borrowerOperations (BorrowerOperationsSignatures) → BorrowerOperations
 * → TroveManager → PriceFeed. Read-only; nothing is signed here.
 */
export async function readCredit(owner: Address): Promise<Credit> {
  const { vault } = requireDeployments()
  const bos = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "borrowerOperations",
  })
  if (bos === zeroAddress) return { status: "disabled" }
  const bo = await publicClient.readContract({
    address: bos,
    abi: mezoBorrowerOperationsSignaturesAbi,
    functionName: "borrowerOperations",
  })
  const [troveManager, borrowingRate, nonce] = await Promise.all([
    publicClient.readContract({
      address: bo,
      abi: mezoBorrowerOperationsAbi,
      functionName: "troveManager",
    }),
    publicClient.readContract({
      address: bo,
      abi: mezoBorrowerOperationsAbi,
      functionName: "borrowingRate",
    }),
    publicClient.readContract({
      address: bos,
      abi: mezoBorrowerOperationsSignaturesAbi,
      functionName: "getNonce",
      args: [owner],
    }),
  ])
  const tm = { address: troveManager, abi: mezoTroveManagerAbi } as const
  const status = await publicClient.readContract({
    ...tm,
    functionName: "getTroveStatus",
    args: [owner],
  })
  if (status !== TROVE_ACTIVE) return { status: "no-trove", bos }
  const [coll, debt, maxBorrowingCapacity, priceFeed] = await Promise.all([
    publicClient.readContract({
      ...tm,
      functionName: "getTroveColl",
      args: [owner],
    }),
    publicClient.readContract({
      ...tm,
      functionName: "getTroveDebt",
      args: [owner],
    }),
    publicClient.readContract({
      ...tm,
      functionName: "getTroveMaxBorrowingCapacity",
      args: [owner],
    }),
    publicClient.readContract({ ...tm, functionName: "priceFeed" }),
  ])
  const price = await publicClient.readContract({
    address: priceFeed,
    abi: mezoPriceFeedAbi,
    functionName: "fetchPrice",
  })
  return {
    status: "active",
    bos,
    nonce,
    line: { coll, debt, price, maxBorrowingCapacity, borrowingRate },
  }
}
