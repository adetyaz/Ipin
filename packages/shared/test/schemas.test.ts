import { describe, expect, it } from "vitest"

import {
  approveBodySchema,
  createInviteBodySchema,
  createRequestBodySchema,
  listRequestsQuerySchema,
  type Request,
  requestSchema,
  toPaymentRequestJson,
  toRequestJson,
} from "../src"

const sig = `0x${"ab".repeat(65)}`
const payee = "0x000000000000000000000000000000000000beef"
const requester = "0x00000000000000000000000000000000000000aa"

const validBody = {
  potId: "1",
  payee,
  item: "Cement bag 50kg",
  quantity: "200",
  unitPrice: "9000000000000000000",
  vendor: "Vendor Y",
  requester,
  signature: sig,
}

describe("createRequestBodySchema", () => {
  it("parses a valid body into bigints and checksummed addresses", () => {
    const parsed = createRequestBodySchema.parse(validBody)
    expect(parsed.potId).toBe(1n)
    expect(parsed.quantity).toBe(200n)
    expect(parsed.unitPrice).toBe(9n * 10n ** 18n)
    expect(parsed.payee).toBe("0x000000000000000000000000000000000000bEEF")
  })

  it("accepts potId and quantity as JSON integers", () => {
    const parsed = createRequestBodySchema.parse({
      ...validBody,
      potId: 1,
      quantity: 2,
    })
    expect(parsed.potId).toBe(1n)
    expect(parsed.quantity).toBe(2n)
  })

  it.each([
    ["unitPrice as number", { unitPrice: 9 }],
    ["unitPrice as float string", { unitPrice: "9.5" }],
    ["zero quantity", { quantity: "0" }],
    ["fractional quantity", { quantity: 1.5 }],
    ["zero unitPrice", { unitPrice: "0" }],
    ["potId 0", { potId: "0" }],
    ["bad payee", { payee: "0x1234" }],
    ["empty item", { item: "" }],
    ["short signature", { signature: "0xabcd" }],
    ["unknown field", { extra: 1 }],
  ])("rejects %s", (_name, patch) => {
    expect(
      createRequestBodySchema.safeParse({ ...validBody, ...patch }).success,
    ).toBe(false)
  })
})

describe("other bodies", () => {
  it("invite body", () => {
    expect(
      createInviteBodySchema.parse({ potId: "3", label: "Site manager" }),
    ).toEqual({ potId: 3n, label: "Site manager" })
    expect(
      createInviteBodySchema.safeParse({ potId: "3", label: "" }).success,
    ).toBe(false)
  })

  it("approve body round-trips a PaymentRequest", () => {
    const pr = {
      potId: 1n,
      payee: "0x000000000000000000000000000000000000bEEF" as const,
      amount: 5n,
      itemHash: `0x${"11".repeat(32)}` as const,
      nonce: 2n ** 255n,
      expiry: 1_800_000_000n,
    }
    const parsed = approveBodySchema.parse({
      paymentRequest: toPaymentRequestJson(pr),
      senderSignature: sig,
    })
    expect(parsed.paymentRequest).toEqual(pr)
  })

  it("list query", () => {
    expect(listRequestsQuerySchema.parse({ status: "pending" })).toEqual({
      status: "pending",
    })
    expect(listRequestsQuerySchema.safeParse({ status: "done" }).success).toBe(
      false,
    )
  })
})

describe("Request wire format", () => {
  it("round-trips through toRequestJson / requestSchema", () => {
    const r: Request = {
      id: "abc",
      potId: 1n,
      payee: "0x000000000000000000000000000000000000bEEF",
      item: "x",
      quantity: 2n,
      unitPrice: 3n,
      amount: 6n,
      vendor: "v",
      requester: "0x00000000000000000000000000000000000000AA",
      itemHash: `0x${"11".repeat(32)}`,
      status: "pending",
      createdAt: new Date(0).toISOString(),
    }
    const json = toRequestJson(r)
    expect(json.amount).toBe("6")
    expect("note" in json).toBe(false)
    expect(requestSchema.parse(JSON.parse(JSON.stringify(json)))).toEqual(r)
  })
})
