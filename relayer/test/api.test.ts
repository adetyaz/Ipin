import type { Hex } from "viem"
import { describe, expect, it } from "vitest"

import {
  inviteClaimMessage,
  itemHash,
  type PaymentRequest,
  rejectMessage,
  requestSchema,
  toPaymentRequestJson,
} from "@ipin/shared"

import {
  FakeChain,
  makeApp,
  payee,
  requester,
  sender,
  signApproval,
  signedRequestBody,
  stranger,
} from "./helpers"

const errorCode = (json: unknown) =>
  (json as { error: { code: string } }).error.code

async function createPending(chain = new FakeChain()) {
  const ctx = makeApp(chain)
  const res = await ctx.call("POST", "/requests", await signedRequestBody())
  expect(res.status).toBe(201)
  const id = (res.json as { id: string }).id
  return { ...ctx, chain, id }
}

function paymentRequestFor(overrides: Partial<PaymentRequest> = {}) {
  return {
    potId: 1n,
    payee,
    amount: 200n * 9n * 10n ** 18n,
    itemHash: itemHash("Cement bag 50kg", 200n, 9n * 10n ** 18n, "Vendor Y"),
    nonce: 42n,
    expiry: 10_000_000n,
    ...overrides,
  }
}

async function approveBody(pr: PaymentRequest, signature?: Hex) {
  return {
    paymentRequest: toPaymentRequestJson(pr),
    senderSignature: signature ?? (await signApproval(pr)),
  }
}

describe("health and config", () => {
  it("reports not deployed without crashing", async () => {
    const { call } = makeApp(null)
    const health = await call("GET", "/health")
    expect(health.status).toBe(200)
    expect(health.json).toMatchObject({
      ok: true,
      chainId: 31611,
      deployed: false,
    })
    const config = await call("GET", "/config")
    expect(config.status).toBe(503)
    expect(errorCode(config.json)).toBe("NOT_DEPLOYED")
    const create = await call("POST", "/requests", await signedRequestBody())
    expect(errorCode(create.json)).toBe("NOT_DEPLOYED")
  })

  it("reports deployed, funded and the fee", async () => {
    const chain = new FakeChain()
    const { call } = makeApp(chain)
    expect((await call("GET", "/health")).json).toMatchObject({
      ok: true,
      deployed: true,
      funded: true,
      relayerBalance: chain.balance.toString(),
    })
    chain.balance = 0n
    expect((await call("GET", "/health")).json).toMatchObject({ funded: false })
    const config = await call("GET", "/config")
    expect(config.json).toMatchObject({
      chainId: 31611,
      feeAmount: "250000000000000000",
      deployBlock: "1",
    })
  })

  it("flags a deployment whose vault has no code", async () => {
    const chain = new FakeChain()
    chain.contracts.clear()
    const { call } = makeApp(chain)
    expect((await call("GET", "/health")).json).toMatchObject({
      ok: false,
      deployed: true,
    })
  })

  it("unknown routes and bad JSON return the error shape", async () => {
    const { app, call } = makeApp(new FakeChain())
    expect(errorCode((await call("GET", "/nope")).json)).toBe("NOT_FOUND")
    const res = await app.request("/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    })
    expect(res.status).toBe(400)
  })
})

describe("POST /requests", () => {
  it("stores a valid signed request as pending with amount and itemHash", async () => {
    const { call, id } = await createPending()
    const res = await call("GET", `/requests/${id}`)
    const r = requestSchema.parse(res.json)
    expect(r.status).toBe("pending")
    expect(r.amount).toBe(1800n * 10n ** 18n)
    expect(r.itemHash).toBe(
      itemHash("Cement bag 50kg", 200n, 9n * 10n ** 18n, "Vendor Y"),
    )
    expect(r.requester).toBe(requester.address)
  })

  it("is idempotent for the same signed body", async () => {
    const { call } = makeApp(new FakeChain())
    const body = await signedRequestBody()
    const a = await call("POST", "/requests", body)
    const b = await call("POST", "/requests", body)
    expect(a.json).toEqual(b.json)
    expect((await call("GET", "/requests")).json).toHaveLength(1)
  })

  it("rejects invalid bodies with 400", async () => {
    const { call } = makeApp(new FakeChain())
    const body = await signedRequestBody()
    for (const patch of [
      { unitPrice: "9.5" },
      { unitPrice: 9 },
      { quantity: "0" },
      { payee: "nope" },
      { extra: true },
    ]) {
      const res = await call("POST", "/requests", { ...body, ...patch })
      expect(res.status, JSON.stringify(patch)).toBe(400)
      expect(errorCode(res.json)).toBe("BAD_REQUEST")
    }
    expect((await call("POST", "/requests", [1])).status).toBe(400)
  })

  it("rejects a signature by someone other than the requester", async () => {
    const { call } = makeApp(new FakeChain())
    const res = await call(
      "POST",
      "/requests",
      await signedRequestBody({}, stranger),
    )
    expect(res.status).toBe(401)
    expect(errorCode(res.json)).toBe("BAD_SIGNATURE")
  })

  it("rejects a body altered after signing", async () => {
    const { call } = makeApp(new FakeChain())
    const body = await signedRequestBody()
    const res = await call("POST", "/requests", { ...body, quantity: "201" })
    expect(errorCode(res.json)).toBe("BAD_SIGNATURE")
  })

  it("rejects a requester not registered on-chain", async () => {
    const chain = new FakeChain()
    chain.requesters.clear()
    const { call } = makeApp(chain)
    const res = await call("POST", "/requests", await signedRequestBody())
    expect(res.status).toBe(403)
    expect(errorCode(res.json)).toBe("NOT_REQUESTER")
  })

  it("rejects paying the requester", async () => {
    const chain = new FakeChain()
    chain.payees.add(`1:${requester.address}`)
    const { call } = makeApp(chain)
    const res = await call(
      "POST",
      "/requests",
      await signedRequestBody({ payee: requester.address }),
    )
    expect(errorCode(res.json)).toBe("PAYEE_IS_REQUESTER")
  })

  it("rejects an unapproved payee and an unknown pot", async () => {
    const chain = new FakeChain()
    chain.payees.clear()
    const { call } = makeApp(chain)
    const res = await call("POST", "/requests", await signedRequestBody())
    expect(errorCode(res.json)).toBe("PAYEE_NOT_APPROVED")
    const missing = await call(
      "POST",
      "/requests",
      await signedRequestBody({ potId: "9" }),
    )
    expect(missing.status).toBe(404)
  })

  it("filters GET /requests by potId and status", async () => {
    const { call } = await createPending()
    expect((await call("GET", "/requests?potId=1")).json).toHaveLength(1)
    expect((await call("GET", "/requests?potId=2")).json).toHaveLength(0)
    expect((await call("GET", "/requests?status=executed")).json).toHaveLength(
      0,
    )
    expect((await call("GET", "/requests?status=bogus")).status).toBe(400)
    expect((await call("GET", "/requests/nope")).status).toBe(404)
  })
})

describe("POST /requests/:id/approve", () => {
  it("test_R8_executesSenderApprovedRequest: pending -> executed", async () => {
    const { call, chain, id } = await createPending()
    const pr = paymentRequestFor()
    const res = await call(
      "POST",
      `/requests/${id}/approve`,
      await approveBody(pr),
    )
    expect(res.status).toBe(200)
    const txHash = (res.json as { txHash: string }).txHash
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(chain.executeCalls).toHaveLength(1)
    expect(chain.executeCalls[0]?.request).toEqual(pr)
    const r = requestSchema.parse((await call("GET", `/requests/${id}`)).json)
    expect(r.status).toBe("executed")
    expect(r.txHash).toBe(txHash)
  })

  it("refuses a second approval (no double submit)", async () => {
    const { call, chain, id } = await createPending()
    const body = await approveBody(paymentRequestFor())
    await call("POST", `/requests/${id}/approve`, body)
    const again = await call("POST", `/requests/${id}/approve`, body)
    expect(again.status).toBe(409)
    expect(errorCode(again.json)).toBe("INVALID_STATE")
    expect(chain.executeCalls).toHaveLength(1)
  })

  it.each([
    ["amount", { amount: 1n }],
    ["payee", { payee: requester.address }],
    ["potId", { potId: 2n }],
    ["itemHash", { itemHash: `0x${"00".repeat(32)}` }],
  ] as [string, Partial<PaymentRequest>][])(
    "rejects a PaymentRequest with a different %s",
    async (_f, patch) => {
      const { call, chain, id } = await createPending()
      const res = await call(
        "POST",
        `/requests/${id}/approve`,
        await approveBody(paymentRequestFor(patch)),
      )
      expect(errorCode(res.json)).toBe("MISMATCH")
      expect(chain.executeCalls).toHaveLength(0)
    },
  )

  it("test_R8_rejectsNonSenderSignature before broadcasting", async () => {
    const { call, chain, id } = await createPending()
    const pr = paymentRequestFor()
    const res = await call(
      "POST",
      `/requests/${id}/approve`,
      await approveBody(pr, await signApproval(pr, requester)),
    )
    expect(res.status).toBe(401)
    expect(errorCode(res.json)).toBe("BAD_SIGNATURE")
    expect(chain.executeCalls).toHaveLength(0)
  })

  it("test_R3_rejectsExpiredRequest before broadcasting", async () => {
    const { call, chain, id } = await createPending()
    const res = await call(
      "POST",
      `/requests/${id}/approve`,
      await approveBody(paymentRequestFor({ expiry: 999n })),
    )
    expect(errorCode(res.json)).toBe("BAD_REQUEST")
    expect(chain.executeCalls).toHaveLength(0)
  })

  it("keeps the request pending with the decoded reason when simulation fails", async () => {
    const chain = new FakeChain()
    chain.simulateError = "CapExceeded(1, 0, 1800, 100)"
    const { call, id } = await createPending(chain)
    const res = await call(
      "POST",
      `/requests/${id}/approve`,
      await approveBody(paymentRequestFor()),
    )
    expect(res.status).toBe(422)
    expect(res.json).toEqual({
      error: {
        code: "SIMULATION_FAILED",
        message: "CapExceeded(1, 0, 1800, 100)",
      },
    })
    const r = requestSchema.parse((await call("GET", `/requests/${id}`)).json)
    expect(r.status).toBe("pending")
    expect(r.error).toBe("CapExceeded(1, 0, 1800, 100)")
  })

  it("marks failed when the transaction reverts on-chain", async () => {
    const chain = new FakeChain()
    chain.receipt = "reverted"
    const { call, id } = await createPending(chain)
    const res = await call(
      "POST",
      `/requests/${id}/approve`,
      await approveBody(paymentRequestFor()),
    )
    expect(res.status).toBe(502)
    expect(errorCode(res.json)).toBe("EXECUTION_FAILED")
    const r = requestSchema.parse((await call("GET", `/requests/${id}`)).json)
    expect(r.status).toBe("failed")
    expect(r.txHash).toBeDefined()
  })

  it("returns the hash and stays approved when the receipt is slow", async () => {
    const chain = new FakeChain()
    chain.receipt = "hang"
    const ctx = makeApp(chain, { receiptTimeoutMs: 10 })
    const created = await ctx.call(
      "POST",
      "/requests",
      await signedRequestBody(),
    )
    const id = (created.json as { id: string }).id
    const res = await ctx.call(
      "POST",
      `/requests/${id}/approve`,
      await approveBody(paymentRequestFor()),
    )
    expect(res.status).toBe(200)
    const r = requestSchema.parse(
      (await ctx.call("GET", `/requests/${id}`)).json,
    )
    expect(r.status).toBe("approved")
  })

  it("defers to the chain for a contract (ERC-1271) sender", async () => {
    const chain = new FakeChain()
    chain.contracts.add(sender.address)
    const { call, id } = await createPending(chain)
    const pr = paymentRequestFor()
    const res = await call(
      "POST",
      `/requests/${id}/approve`,
      await approveBody(pr, `0x${"11".repeat(100)}`),
    )
    expect(res.status).toBe(200)
    expect(chain.executeCalls).toHaveLength(1)
  })
})

describe("POST /requests/:id/reject", () => {
  it("only the pot's sender can reject; then approve is refused", async () => {
    const { call, id } = await createPending()
    const bad = await call("POST", `/requests/${id}/reject`, {
      senderSignature: await stranger.signMessage({
        message: rejectMessage(id),
      }),
    })
    expect(bad.status).toBe(403)
    expect(errorCode(bad.json)).toBe("NOT_POT_OWNER")
    const ok = await call("POST", `/requests/${id}/reject`, {
      senderSignature: await sender.signMessage({ message: rejectMessage(id) }),
    })
    expect(ok.json).toEqual({ ok: true })
    const r = requestSchema.parse((await call("GET", `/requests/${id}`)).json)
    expect(r.status).toBe("rejected")
    const approve = await call(
      "POST",
      `/requests/${id}/approve`,
      await approveBody(paymentRequestFor()),
    )
    expect(errorCode(approve.json)).toBe("INVALID_STATE")
  })

  it("a signature for another request id does not reject this one", async () => {
    const { call, id } = await createPending()
    const res = await call("POST", `/requests/${id}/reject`, {
      senderSignature: await sender.signMessage({
        message: rejectMessage("other"),
      }),
    })
    expect(res.status).toBe(403)
  })
})

describe("invites", () => {
  it("create, read, claim; a second address cannot claim", async () => {
    const { call } = makeApp(new FakeChain())
    const created = await call("POST", "/invites", {
      potId: "1",
      label: "Site manager",
    })
    expect(created.status).toBe(201)
    const { code, url } = created.json as { code: string; url: string }
    expect(url).toBe(`https://app.example/i/${code}`)
    expect((await call("GET", `/invites/${code}`)).json).toEqual({
      potId: "1",
      label: "Site manager",
    })

    const forged = await call("POST", `/invites/${code}/claim`, {
      address: requester.address,
      signature: await stranger.signMessage({
        message: inviteClaimMessage(code),
      }),
    })
    expect(errorCode(forged.json)).toBe("BAD_SIGNATURE")

    const claim = {
      address: requester.address,
      signature: await requester.signMessage({
        message: inviteClaimMessage(code),
      }),
    }
    expect((await call("POST", `/invites/${code}/claim`, claim)).json).toEqual({
      ok: true,
    })
    expect((await call("POST", `/invites/${code}/claim`, claim)).json).toEqual({
      ok: true,
    })
    expect((await call("GET", `/invites/${code}`)).json).toMatchObject({
      claimedBy: requester.address,
    })

    const other = await call("POST", `/invites/${code}/claim`, {
      address: stranger.address,
      signature: await stranger.signMessage({
        message: inviteClaimMessage(code),
      }),
    })
    expect(other.status).toBe(409)
  })

  it("refuses invites for unknown pots and unknown codes", async () => {
    const { call } = makeApp(new FakeChain())
    expect(
      (await call("POST", "/invites", { potId: "7", label: "x" })).status,
    ).toBe(404)
    expect((await call("GET", "/invites/nope")).status).toBe(404)
  })
})

describe("CORS", () => {
  it("allows the app origin only", async () => {
    const { app } = makeApp(null)
    const ok = await app.request("/health", {
      headers: { Origin: "https://app.example" },
    })
    expect(ok.headers.get("access-control-allow-origin")).toBe(
      "https://app.example",
    )
    const bad = await app.request("/health", {
      headers: { Origin: "https://evil.example" },
    })
    expect(bad.headers.get("access-control-allow-origin")).toBeNull()
  })
})
