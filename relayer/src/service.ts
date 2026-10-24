// Relayer behaviour behind docs/api.md section 3, independent of HTTP.
// Off-chain checks fail fast (T6); the Vault re-checks everything on-chain and
// only the sender's EIP-712 approval settles (R8).
import { randomBytes, randomUUID } from "node:crypto"
import {
  type Address,
  formatEther,
  type Hex,
  isAddressEqual,
  recoverMessageAddress,
} from "viem"

import {
  type ApproveBody,
  type CreateInviteBody,
  type CreateRequestBody,
  type HealthJson,
  inviteClaimMessage,
  itemHash,
  MAX_UINT256,
  paymentRequestDomain,
  recoverPaymentRequestSigner,
  rejectMessage,
  type Request,
  requestSigningMessage,
  type RequestStatus,
} from "@ipin/shared"

import { type Chain, describeError, SimulationError } from "./chain"
import { ApiError, notDeployed } from "./errors"
import { type Logger, shortHex } from "./logger"
import type { Runtime } from "./runtime"
import type { Invite, Store } from "./store"

export interface ServiceOptions {
  store: Store
  runtime: Runtime
  appUrl: string
  logger: Logger
  now?: () => Date
  /** How long approve waits for the receipt before replying with the hash. */
  receiptTimeoutMs?: number
}

async function recoverOrNull(
  message: string,
  signature: Hex,
): Promise<Address | null> {
  try {
    return await recoverMessageAddress({ message, signature })
  } catch {
    // Malformed signature bytes (bad v / s): treated as "no valid signer".
    return null
  }
}

export class RelayerService {
  private readonly inFlight = new Set<string>()
  private readonly now: () => Date
  private readonly receiptTimeoutMs: number

  constructor(private readonly opts: ServiceOptions) {
    this.now = opts.now ?? (() => new Date())
    this.receiptTimeoutMs = opts.receiptTimeoutMs ?? 60_000
  }

  private chain(): { chain: Chain; config: Record<string, unknown> } {
    const current = this.opts.runtime.current()
    if (current === null) throw notDeployed()
    const d = current.deployments
    return {
      chain: current.chain,
      config: { ...d, deployBlock: d.deployBlock.toString() },
    }
  }

  private async requirePot(chain: Chain, potId: bigint): Promise<Address> {
    const owner = await chain.potOwner(potId)
    if (owner === null) {
      throw new ApiError(404, "NOT_FOUND", `pot ${potId} does not exist`)
    }
    return owner
  }

  // --- Health / config ---

  async health(): Promise<HealthJson> {
    const { runtime } = this.opts
    const current = runtime.current()
    const base = {
      ok: true,
      chainId: runtime.chainId,
      relayer: runtime.relayerAddress,
      deployed: current !== null,
    }
    if (current === null) {
      const reason = runtime.reason()
      return reason === undefined ? base : { ...base, error: reason }
    }
    try {
      const [balance, vaultHasCode] = await Promise.all([
        current.chain.relayerBalance(),
        current.chain.hasCode(current.chain.vault),
      ])
      const status = {
        ...base,
        funded: balance > 0n,
        relayerBalance: balance.toString(),
      }
      return vaultHasCode
        ? status
        : {
            ...status,
            ok: false,
            error: `no contract at vault ${current.chain.vault} (wrong network or dry-run file?)`,
          }
    } catch (err) {
      return { ...base, ok: false, error: `RPC: ${describeError(err)}` }
    }
  }

  async config(): Promise<Record<string, unknown>> {
    const { chain, config } = this.chain()
    const fee = await chain.fee()
    return { ...config, feeAmount: fee.toString() }
  }

  // --- Invites ---

  async createInvite(
    body: CreateInviteBody,
  ): Promise<{ code: string; url: string }> {
    const { chain } = this.chain()
    await this.requirePot(chain, body.potId)
    const code = randomBytes(12).toString("base64url")
    this.opts.store.addInvite({
      code,
      potId: body.potId,
      label: body.label,
      createdAt: this.now().toISOString(),
    })
    this.opts.logger.info(
      { potId: body.potId.toString(), code },
      "invite created",
    )
    return { code, url: `${this.opts.appUrl}/i/${code}` }
  }

  getInvite(code: string): Invite {
    const invite = this.opts.store.getInvite(code)
    if (!invite) throw new ApiError(404, "NOT_FOUND", "invite not found")
    return invite
  }

  async claimInvite(
    code: string,
    body: { address: Address; signature: Hex },
  ): Promise<{ ok: true }> {
    const invite = this.getInvite(code)
    const signer = await recoverOrNull(inviteClaimMessage(code), body.signature)
    if (signer === null || !isAddressEqual(signer, body.address)) {
      throw new ApiError(401, "BAD_SIGNATURE", "signature is not from address")
    }
    if (invite.claimedBy !== undefined) {
      if (isAddressEqual(invite.claimedBy, body.address)) return { ok: true }
      throw new ApiError(409, "ALREADY_CLAIMED", "invite already claimed")
    }
    this.opts.store.claimInvite(code, body.address)
    this.opts.logger.info({ code, requester: body.address }, "invite claimed")
    return { ok: true }
  }

  // --- Requests ---

  /**
   * Store a requester's signed request. `raw` is the JSON body as received:
   * the signature covers its canonical JSON minus `signature`.
   */
  async createRequest(
    body: CreateRequestBody,
    raw: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const signer = await recoverOrNull(
      requestSigningMessage(raw),
      body.signature,
    )
    if (signer === null || !isAddressEqual(signer, body.requester)) {
      throw new ApiError(
        401,
        "BAD_SIGNATURE",
        "signature is not from requester",
      )
    }
    const existing = this.opts.store.findBySignature(body.signature)
    if (existing) return { id: existing.id }

    const { chain } = this.chain()
    await this.requirePot(chain, body.potId)
    const [requesterOk, payeeIsRequester, payeeOk] = await Promise.all([
      chain.isRequester(body.potId, body.requester),
      chain.isRequester(body.potId, body.payee),
      chain.isPayee(body.potId, body.payee),
    ])
    if (!requesterOk) {
      throw new ApiError(
        403,
        "NOT_REQUESTER",
        `${body.requester} is not a registered requester of pot ${body.potId}`,
      )
    }
    if (isAddressEqual(body.payee, body.requester) || payeeIsRequester) {
      throw new ApiError(
        422,
        "PAYEE_IS_REQUESTER",
        "a requester cannot be the payee",
      )
    }
    if (!payeeOk) {
      throw new ApiError(
        422,
        "PAYEE_NOT_APPROVED",
        `${body.payee} is not an approved payee of pot ${body.potId}`,
      )
    }
    const amount = body.quantity * body.unitPrice
    if (amount > MAX_UINT256) {
      throw new ApiError(400, "BAD_REQUEST", "amount exceeds uint256")
    }

    const request: Request = {
      id: randomUUID(),
      potId: body.potId,
      payee: body.payee,
      item: body.item,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      amount,
      vendor: body.vendor,
      ...(body.note === undefined ? {} : { note: body.note }),
      requester: body.requester,
      itemHash: itemHash(body.item, body.quantity, body.unitPrice, body.vendor),
      status: "pending",
      createdAt: this.now().toISOString(),
    }
    this.opts.store.addRequest(request, body.signature)
    this.opts.logger.info(
      {
        id: request.id,
        potId: request.potId.toString(),
        amount: amount.toString(),
        requester: request.requester,
      },
      "request stored",
    )
    return { id: request.id }
  }

  listRequests(filter: { potId?: bigint; status?: RequestStatus }): Request[] {
    return this.opts.store.listRequests(filter)
  }

  getRequest(id: string): Request {
    const r = this.opts.store.getRequest(id)
    if (!r) throw new ApiError(404, "NOT_FOUND", "request not found")
    return r
  }

  /**
   * Sender approved: check the signed PaymentRequest matches the stored
   * request, simulate `execute`, broadcast it with the relayer key and wait for
   * the receipt. pending -> approved (tx sent) -> executed | failed.
   */
  async approve(id: string, body: ApproveBody): Promise<{ txHash: Hex }> {
    const request = this.getRequest(id)
    if (request.status !== "pending") {
      throw new ApiError(409, "INVALID_STATE", `request is ${request.status}`)
    }
    if (this.inFlight.has(id)) {
      throw new ApiError(409, "BUSY", "approval already in progress")
    }
    const { chain } = this.chain()
    const pr = body.paymentRequest
    const mismatches = [
      pr.potId !== request.potId && "potId",
      !isAddressEqual(pr.payee, request.payee) && "payee",
      pr.amount !== request.amount && "amount",
      pr.itemHash.toLowerCase() !== request.itemHash.toLowerCase() &&
        "itemHash",
    ].filter((m): m is string => m !== false)
    if (mismatches.length > 0) {
      throw new ApiError(
        422,
        "MISMATCH",
        `paymentRequest differs from the request: ${mismatches.join(", ")}`,
      )
    }
    const nowSeconds = BigInt(this.now().getTime()) / 1000n
    if (pr.expiry < nowSeconds) {
      throw new ApiError(422, "BAD_REQUEST", "paymentRequest has expired")
    }

    this.inFlight.add(id)
    try {
      const owner = await this.requirePot(chain, request.potId)
      const domain = paymentRequestDomain(chain.chainId, chain.vault)
      let signer: Address | null
      try {
        signer = await recoverPaymentRequestSigner(
          domain,
          pr,
          body.senderSignature,
        )
      } catch {
        // Not a 65-byte ECDSA signature: only an ERC-1271 sender can use it.
        signer = null
      }
      const signedByOwner = signer !== null && isAddressEqual(signer, owner)
      if (!signedByOwner && !(await chain.hasCode(owner))) {
        throw new ApiError(
          401,
          "BAD_SIGNATURE",
          "not signed by the pot's sender",
        )
      }

      let txHash: Hex
      try {
        txHash = await chain.submitExecute(pr, body.senderSignature)
      } catch (err) {
        const reason =
          err instanceof SimulationError ? err.reason : describeError(err)
        this.opts.store.updateRequest(id, { error: reason })
        this.opts.logger.warn(
          { id, reason },
          "execute rejected before broadcast",
        )
        throw new ApiError(
          err instanceof SimulationError ? 422 : 502,
          err instanceof SimulationError ? "SIMULATION_FAILED" : "CHAIN_ERROR",
          reason,
        )
      }
      this.opts.store.updateRequest(id, {
        status: "approved",
        txHash,
        clearError: true,
      })
      this.opts.logger.info(
        { id, txHash, sig: shortHex(body.senderSignature) },
        "execute sent",
      )

      const settled = this.settle(id, txHash, chain)
      const outcome = await Promise.race([
        settled,
        new Promise<"timeout">((resolve) =>
          setTimeout(() => {
            resolve("timeout")
          }, this.receiptTimeoutMs).unref(),
        ),
      ])
      if (outcome === "failed") {
        throw new ApiError(
          502,
          "EXECUTION_FAILED",
          `execute reverted on-chain (tx ${txHash})`,
        )
      }
      return { txHash }
    } finally {
      this.inFlight.delete(id)
    }
  }

  private async settle(
    id: string,
    txHash: Hex,
    chain: Chain,
  ): Promise<"executed" | "failed" | "unknown"> {
    try {
      const status = await chain.waitForReceipt(txHash, 5 * 60_000)
      if (status === "success") {
        this.opts.store.updateRequest(id, { status: "executed" })
        this.opts.logger.info({ id, txHash }, "payment executed")
        return "executed"
      }
      this.opts.store.updateRequest(id, {
        status: "failed",
        error: "execute reverted on-chain",
      })
      this.opts.logger.error({ id, txHash }, "execute reverted on-chain")
      return "failed"
    } catch (err) {
      const reason = describeError(err)
      this.opts.store.updateRequest(id, { error: `receipt: ${reason}` })
      this.opts.logger.error({ id, txHash, reason }, "no receipt for execute")
      return "unknown"
    }
  }

  /** The pot's sender declines a pending request (signs "Ipin reject <id>"). */
  async reject(id: string, senderSignature: Hex): Promise<{ ok: true }> {
    const request = this.getRequest(id)
    if (request.status !== "pending") {
      throw new ApiError(409, "INVALID_STATE", `request is ${request.status}`)
    }
    if (this.inFlight.has(id)) {
      throw new ApiError(409, "BUSY", "approval in progress")
    }
    const { chain } = this.chain()
    const owner = await this.requirePot(chain, request.potId)
    const signer = await recoverOrNull(rejectMessage(id), senderSignature)
    if (signer === null || !isAddressEqual(signer, owner)) {
      throw new ApiError(
        403,
        "NOT_POT_OWNER",
        "only the pot's sender can reject",
      )
    }
    this.opts.store.updateRequest(id, { status: "rejected" })
    this.opts.logger.info({ id }, "request rejected")
    return { ok: true }
  }
}

/** Human summary of the relayer's BTC balance for startup logs. */
export function describeBalance(wei: bigint): string {
  return `${formatEther(wei)} BTC`
}
