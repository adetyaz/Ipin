// zod schemas for every relayer API body and response (docs/api.md section 3).
// Wire format: uint256 values are decimal strings (R1); potId and quantity are
// also accepted as JSON integers. Addresses are normalised to checksum case.
import { type Address, getAddress, type Hex, isAddress } from "viem"
import { z } from "zod"

import { uint256String } from "./amounts"
import type { PaymentRequest } from "./eip712"

export const addressSchema = z
  .string()
  .refine((s) => isAddress(s, { strict: false }), "expected an EVM address")
  .transform((s): Address => getAddress(s))

export const hexSchema = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2})*$/, "expected 0x-prefixed hex")
  .transform((s) => s as Hex)

export const signatureSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{130}$/, "expected a 65-byte signature")
  .transform((s) => s as Hex)

export const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected bytes32 hex")
  .transform((s) => s as Hex)

/** uint256 as a decimal string, or a safe JSON integer (ids and counts only). */
export const uintIdSchema = z.union([
  uint256String,
  z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .transform((n) => BigInt(n)),
])

const positive = (v: bigint) => v > 0n

export const requestStatusSchema = z.enum([
  "pending",
  "approved",
  "executed",
  "rejected",
  "failed",
])
export type RequestStatus = z.infer<typeof requestStatusSchema>

// --- Invites ---

export const createInviteBodySchema = z.strictObject({
  potId: uintIdSchema.refine(positive, "potId must be > 0"),
  label: z.string().min(1).max(64),
})
export type CreateInviteBody = z.output<typeof createInviteBodySchema>

export const createInviteResponseSchema = z.object({
  code: z.string(),
  url: z.string(),
})
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>

export const inviteResponseSchema = z.object({
  potId: uint256String,
  label: z.string(),
  claimedBy: addressSchema.optional(),
})
export type InviteJson = z.input<typeof inviteResponseSchema>

export const claimInviteBodySchema = z.strictObject({
  address: addressSchema,
  signature: signatureSchema,
})
export type ClaimInviteBody = z.output<typeof claimInviteBodySchema>

// --- Requests ---

const text = (max: number) => z.string().min(1).max(max)

/** POST /requests. The requester signs canonicalJson(body minus signature). */
export const createRequestBodySchema = z.strictObject({
  potId: uintIdSchema.refine(positive, "potId must be > 0"),
  payee: addressSchema,
  item: text(200),
  quantity: uintIdSchema.refine(positive, "quantity must be > 0"),
  unitPrice: uint256String.refine(positive, "unitPrice must be > 0"),
  vendor: text(200),
  note: z.string().max(500).optional(),
  requester: addressSchema,
  signature: signatureSchema,
})
export type CreateRequestBody = z.output<typeof createRequestBodySchema>
export type CreateRequestBodyJson = z.input<typeof createRequestBodySchema>

export const createRequestResponseSchema = z.object({ id: z.string() })

export const listRequestsQuerySchema = z.strictObject({
  potId: uint256String.optional(),
  status: requestStatusSchema.optional(),
})

/** A stored request with bigint amounts (amount = quantity * unitPrice). */
export interface Request {
  id: string
  potId: bigint
  payee: Address
  item: string
  quantity: bigint
  unitPrice: bigint
  amount: bigint
  vendor: string
  note?: string
  requester: Address
  itemHash: Hex
  status: RequestStatus
  /** ISO 8601 */
  createdAt: string
  txHash?: Hex
  error?: string
}

/** Wire form of {@link Request}; parse with this, serialise with toRequestJson. */
export const requestSchema = z.object({
  id: z.string(),
  potId: uint256String,
  payee: addressSchema,
  item: z.string(),
  quantity: uint256String,
  unitPrice: uint256String,
  amount: uint256String,
  vendor: z.string(),
  note: z.string().optional(),
  requester: addressSchema,
  itemHash: bytes32Schema,
  status: requestStatusSchema,
  createdAt: z.iso.datetime(),
  txHash: bytes32Schema.optional(),
  error: z.string().optional(),
})
export type RequestJson = z.input<typeof requestSchema>

export function toRequestJson(r: Request): RequestJson {
  return {
    id: r.id,
    potId: r.potId.toString(),
    payee: r.payee,
    item: r.item,
    quantity: r.quantity.toString(),
    unitPrice: r.unitPrice.toString(),
    amount: r.amount.toString(),
    vendor: r.vendor,
    ...(r.note === undefined ? {} : { note: r.note }),
    requester: r.requester,
    itemHash: r.itemHash,
    status: r.status,
    createdAt: r.createdAt,
    ...(r.txHash === undefined ? {} : { txHash: r.txHash }),
    ...(r.error === undefined ? {} : { error: r.error }),
  }
}

// --- Approve / reject ---

export const paymentRequestSchema = z.strictObject({
  potId: uint256String,
  payee: addressSchema,
  amount: uint256String,
  itemHash: bytes32Schema,
  nonce: uint256String,
  expiry: uint256String,
}) satisfies z.ZodType<PaymentRequest>

export type PaymentRequestJson = z.input<typeof paymentRequestSchema>

export function toPaymentRequestJson(p: PaymentRequest): PaymentRequestJson {
  return {
    potId: p.potId.toString(),
    payee: p.payee,
    amount: p.amount.toString(),
    itemHash: p.itemHash,
    nonce: p.nonce.toString(),
    expiry: p.expiry.toString(),
  }
}

export const approveBodySchema = z.strictObject({
  paymentRequest: paymentRequestSchema,
  senderSignature: hexSchema,
})
export type ApproveBody = z.output<typeof approveBodySchema>

export const approveResponseSchema = z.object({ txHash: bytes32Schema })

export const rejectBodySchema = z.strictObject({
  senderSignature: signatureSchema,
})

export const okResponseSchema = z.object({ ok: z.literal(true) })

// --- Health / config ---

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  chainId: z.number(),
  relayer: addressSchema,
  deployed: z.boolean(),
  funded: z.boolean().optional(),
  relayerBalance: uint256String.optional(),
  error: z.string().optional(),
})
export type HealthJson = z.input<typeof healthResponseSchema>

export const configResponseSchema = z.looseObject({
  chainId: z.number(),
  musd: addressSchema,
  pots: addressSchema,
  policyEngine: addressSchema,
  relayer: addressSchema,
  feeAmount: uint256String,
})

// --- Errors ---

export const errorCodes = [
  "BAD_REQUEST",
  "NOT_FOUND",
  "NOT_DEPLOYED",
  "BAD_SIGNATURE",
  "NOT_REQUESTER",
  "PAYEE_IS_REQUESTER",
  "PAYEE_NOT_APPROVED",
  "NOT_POT_OWNER",
  "ALREADY_CLAIMED",
  "INVALID_STATE",
  "MISMATCH",
  "BUSY",
  "SIMULATION_FAILED",
  "EXECUTION_FAILED",
  "CHAIN_ERROR",
  "INTERNAL",
] as const
export const errorCodeSchema = z.enum(errorCodes)
export type ErrorCode = z.infer<typeof errorCodeSchema>

export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})
export type ErrorResponse = z.infer<typeof errorResponseSchema>
