// Relayer state: invites and requests. One JSON file, rewritten atomically
// (write temp + rename) after every change. Small, dependency-free and works the
// same on Windows and Linux hosts. Pass `path: null` for an in-memory store.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { Address, Hex } from "viem"
import { z } from "zod"

import {
  addressSchema,
  type Request,
  type RequestJson,
  requestSchema,
  type RequestStatus,
  signatureSchema,
  toRequestJson,
  uint256String,
} from "@ipin/shared"

export interface Invite {
  code: string
  potId: bigint
  label: string
  createdAt: string
  claimedBy?: Address
}

const inviteSchema = z.object({
  code: z.string(),
  potId: uint256String,
  label: z.string(),
  createdAt: z.string(),
  claimedBy: addressSchema.optional(),
})

const fileSchema = z.object({
  version: z.literal(1),
  invites: z.array(inviteSchema),
  requests: z.array(
    z.object({ request: requestSchema, requesterSignature: signatureSchema }),
  ),
})

interface StoredRequest {
  request: Request
  requesterSignature: Hex
}

export type RequestPatch = Partial<
  Pick<Request, "status" | "txHash" | "error">
> & { clearError?: boolean }

export class Store {
  private readonly invites = new Map<string, Invite>()
  private readonly requests = new Map<string, StoredRequest>()

  constructor(private readonly path: string | null) {
    if (path !== null) this.load(path)
  }

  // --- Invites ---

  addInvite(invite: Invite): void {
    this.invites.set(invite.code, invite)
    this.persist()
  }

  getInvite(code: string): Invite | undefined {
    return this.invites.get(code)
  }

  claimInvite(code: string, address: Address): Invite {
    const invite = this.invites.get(code)
    if (!invite) throw new Error(`invite ${code} not found`)
    const claimed = { ...invite, claimedBy: address }
    this.invites.set(code, claimed)
    this.persist()
    return claimed
  }

  // --- Requests ---

  addRequest(request: Request, requesterSignature: Hex): void {
    this.requests.set(request.id, { request, requesterSignature })
    this.persist()
  }

  getRequest(id: string): Request | undefined {
    return this.requests.get(id)?.request
  }

  findBySignature(signature: Hex): Request | undefined {
    const lower = signature.toLowerCase()
    for (const s of this.requests.values()) {
      if (s.requesterSignature.toLowerCase() === lower) return s.request
    }
    return undefined
  }

  listRequests(filter: { potId?: bigint; status?: RequestStatus }): Request[] {
    return [...this.requests.values()]
      .map((s) => s.request)
      .filter(
        (r) =>
          (filter.potId === undefined || r.potId === filter.potId) &&
          (filter.status === undefined || r.status === filter.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  updateRequest(id: string, patch: RequestPatch): Request {
    const stored = this.requests.get(id)
    if (!stored) throw new Error(`request ${id} not found`)
    const { clearError, ...fields } = patch
    const next: Request = { ...stored.request, ...fields }
    if (clearError === true && fields.error === undefined) delete next.error
    this.requests.set(id, { ...stored, request: next })
    this.persist()
    return next
  }

  // --- Persistence ---

  private load(path: string): void {
    let text: string
    try {
      text = readFileSync(path, "utf8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return
      throw err
    }
    const data = fileSchema.parse(JSON.parse(text))
    for (const inv of data.invites) {
      this.invites.set(inv.code, {
        code: inv.code,
        potId: inv.potId,
        label: inv.label,
        createdAt: inv.createdAt,
        ...(inv.claimedBy === undefined ? {} : { claimedBy: inv.claimedBy }),
      })
    }
    for (const r of data.requests) {
      const { note, txHash, error, ...required } = r.request
      const request: Request = {
        ...required,
        ...(note === undefined ? {} : { note }),
        ...(txHash === undefined ? {} : { txHash }),
        ...(error === undefined ? {} : { error }),
      }
      this.requests.set(request.id, {
        request,
        requesterSignature: r.requesterSignature,
      })
    }
  }

  private persist(): void {
    if (this.path === null) return
    const data: {
      version: 1
      invites: unknown[]
      requests: { request: RequestJson; requesterSignature: Hex }[]
    } = {
      version: 1,
      invites: [...this.invites.values()].map((i) => ({
        ...i,
        potId: i.potId.toString(),
      })),
      requests: [...this.requests.values()].map((s) => ({
        request: toRequestJson(s.request),
        requesterSignature: s.requesterSignature,
      })),
    }
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
    renameWithRetry(tmp, this.path)
  }
}

// Windows can briefly lock a file (antivirus, indexer); retry the rename.
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY")) throw err
      const until = Date.now() + 20 * (attempt + 1)
      while (Date.now() < until) {
        // brief synchronous back-off; persistence must finish before replying
      }
    }
  }
}
