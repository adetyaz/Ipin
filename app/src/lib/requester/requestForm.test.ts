import type { Address } from "viem"
import { describe, expect, it } from "vitest"

import { type RequestFormInput, validateRequestForm } from "./requestForm"

const vendorY = "0x1111111111111111111111111111111111111111" as Address
const other = "0x2222222222222222222222222222222222222222" as Address
const me = "0x3333333333333333333333333333333333333333" as Address

const cement: RequestFormInput = {
  item: "Cement bag 50kg",
  quantity: "5",
  unitPrice: "1.00",
  vendor: "Vendor Y",
  payee: vendorY,
  note: "",
}

describe("validateRequestForm", () => {
  it("accepts the cement request and computes the total in bigint", () => {
    const r = validateRequestForm(cement, [vendorY, other], me)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.quantity).toBe(5n)
    expect(r.value.unitPrice).toBe(10n ** 18n)
    expect(r.value.total).toBe(5n * 10n ** 18n)
    expect(r.value.note).toBeUndefined()
  })

  it("total is exact for awkward prices", () => {
    const r = validateRequestForm(
      { ...cement, quantity: "3", unitPrice: "0.333333333333333333" },
      [vendorY],
    )
    expect(r.ok && r.value.total).toBe(999999999999999999n)
  })

  it("rejects empty and malformed fields with plain messages", () => {
    const r = validateRequestForm(
      {
        item: " ",
        quantity: "1.5",
        unitPrice: "abc",
        vendor: "",
        payee: "",
        note: "",
      },
      [vendorY],
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errors).sort()).toEqual(
      ["item", "payee", "quantity", "unitPrice", "vendor"].sort(),
    )
    expect(r.total).toBeNull()
  })

  it("rejects zero quantity and zero price", () => {
    const r = validateRequestForm(
      { ...cement, quantity: "0", unitPrice: "0" },
      [vendorY],
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.quantity).toBeDefined()
    expect(r.errors.unitPrice).toBeDefined()
  })

  it("only allows the pot's approved payees (I5)", () => {
    const r = validateRequestForm({ ...cement, payee: other }, [vendorY])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.payee).toMatch(/approved/)
  })

  it("never lets the requester pay themselves", () => {
    const r = validateRequestForm({ ...cement, payee: me }, [vendorY, me], me)
    expect(r.ok).toBe(false)
  })

  it("keeps a live total while other fields are still wrong", () => {
    const r = validateRequestForm({ ...cement, vendor: "" }, [vendorY])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.total).toBe(5n * 10n ** 18n)
  })
})
