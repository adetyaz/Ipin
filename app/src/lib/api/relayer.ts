import {
  approveResponseSchema,
  createInviteResponseSchema,
  createRequestResponseSchema,
  errorResponseSchema,
  healthResponseSchema,
  inviteResponseSchema,
  okResponseSchema,
  type PaymentRequest,
  type Request,
  requestSchema,
  type RequestStatus,
  toPaymentRequestJson,
} from "@ipin/shared"
import type { Address, Hex } from "viem"
import { z } from "zod"

import { env } from "$env/dynamic/public"

/** Relayer base URL (docs/api.md section 3), from PUBLIC_RELAYER_URL. */
export const relayerUrl: string | null =
  env.PUBLIC_RELAYER_URL && env.PUBLIC_RELAYER_URL.trim() !== ""
    ? env.PUBLIC_RELAYER_URL.replace(/\/+$/, "")
    : null

export class RelayerError extends Error {
  override name = "RelayerError"
  constructor(
    readonly code: string,
    message: string,
    /** The relayer's own message (e.g. a revert reason), kept for matching. */
    readonly detail: string = message,
  ) {
    super(message)
  }

  /** The contract said this approval's nonce is spent: settled or cancelled. */
  get nonceUsed(): boolean {
    return /NonceAlreadyUsed/.test(this.detail)
  }
}

/** What each relayer error code means to the person holding the phone. */
const FRIENDLY: Record<string, string> = {
  NOT_DEPLOYED: "Ìpín isn't deployed on Mezo testnet yet.",
  BAD_SIGNATURE: "The signature didn't check out. Try again.",
  NOT_REQUESTER:
    "You're not registered on this pot yet. Ask the sender to finish adding you.",
  PAYEE_IS_REQUESTER: "You can't send a pot's money to yourself.",
  PAYEE_NOT_APPROVED: "That vendor isn't approved for this pot.",
  NOT_POT_OWNER: "Only the pot's owner can do that.",
  ALREADY_CLAIMED: "This invite was already accepted on another phone.",
  INVALID_STATE: "This request has already been handled.",
  MISMATCH: "The details don't match the request. Refresh and try again.",
  BUSY: "The relayer is busy. Try again in a moment.",
  SIMULATION_FAILED: "The payment would fail on-chain, so it wasn't sent.",
  EXECUTION_FAILED: "The payment failed on-chain. Nothing left the pot.",
  CHAIN_ERROR: "Mezo testnet didn't respond. Try again in a moment.",
  NOT_FOUND: "We couldn't find that.",
}

async function call<T>(
  path: string,
  schema: z.ZodType<T, unknown>,
  init?: { method: "POST"; body: unknown },
): Promise<T> {
  if (!relayerUrl) {
    throw new RelayerError(
      "NO_RELAYER",
      "The relayer isn't set up for this app yet.",
    )
  }
  let res: Response
  try {
    res = await fetch(`${relayerUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: init ? { "content-type": "application/json" } : {},
      ...(init ? { body: JSON.stringify(init.body) } : {}),
    })
  } catch {
    throw new RelayerError(
      "OFFLINE",
      "Couldn't reach the Ìpín relayer. Check your connection and try again.",
    )
  }
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(json)
    const code = parsed.success ? parsed.data.error.code : `HTTP_${res.status}`
    const detail = parsed.success ? parsed.data.error.message : ""
    const message = FRIENDLY[code] ?? (detail || "Something went wrong.")
    throw new RelayerError(code, message, detail)
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new RelayerError(
      "BAD_RESPONSE",
      "The relayer sent an unexpected reply.",
    )
  }
  return parsed.data
}

export const relayer = {
  health: () => call("/health", healthResponseSchema),

  createInvite: (potId: bigint, label: string) =>
    call("/invites", createInviteResponseSchema, {
      method: "POST",
      body: { potId: potId.toString(), label },
    }),

  getInvite: (code: string) =>
    call(`/invites/${encodeURIComponent(code)}`, inviteResponseSchema),

  claimInvite: (code: string, address: Address, signature: Hex) =>
    call(`/invites/${encodeURIComponent(code)}/claim`, okResponseSchema, {
      method: "POST",
      body: { address, signature },
    }),

  /** `body` must be exactly what the requester signed, plus the signature. */
  createRequest: (body: Record<string, unknown>) =>
    call("/requests", createRequestResponseSchema, { method: "POST", body }),

  listRequests: (q: { potId?: bigint; status?: RequestStatus } = {}) => {
    const params = new URLSearchParams()
    if (q.potId !== undefined) params.set("potId", q.potId.toString())
    if (q.status) params.set("status", q.status)
    const qs = params.toString()
    return call(
      `/requests${qs ? `?${qs}` : ""}`,
      z.array(requestSchema),
    ) as Promise<Request[]>
  },

  getRequest: (id: string) =>
    call(
      `/requests/${encodeURIComponent(id)}`,
      requestSchema,
    ) as Promise<Request>,

  approve: (id: string, paymentRequest: PaymentRequest, senderSignature: Hex) =>
    call(`/requests/${encodeURIComponent(id)}/approve`, approveResponseSchema, {
      method: "POST",
      body: {
        paymentRequest: toPaymentRequestJson(paymentRequest),
        senderSignature,
      },
    }),

  reject: (id: string, senderSignature: Hex) =>
    call(`/requests/${encodeURIComponent(id)}/reject`, okResponseSchema, {
      method: "POST",
      body: { senderSignature },
    }),
}

/** Request statuses in the words a family member would use. */
export const STATUS_WORDS: Record<RequestStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved, paying now",
  executed: "Paid",
  rejected: "Declined",
  failed: "Payment failed",
}
