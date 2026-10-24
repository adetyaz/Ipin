import { describe, expect, it } from "vitest"

import { itemHash, parseMusd } from "../src"

describe("itemHash", () => {
  // Vector pinned by contracts/test/PaymentRequest.t.sol
  // test_PaymentRequest_itemHashMatchesVector (docs/api.md section 2).
  it("matches the Foundry vector", () => {
    expect(itemHash("Cement bag 50kg", 200n, parseMusd("9"), "Vendor Y")).toBe(
      "0x0ed8f4ca6b571e726131a47e8f2ed5ef66614bd6ddde8109e3539970fd86bedc",
    )
  })

  it("changes when any field changes", () => {
    const base = itemHash("Cement bag 50kg", 200n, parseMusd("9"), "Vendor Y")
    expect(
      itemHash("Cement bag 50kg ", 200n, parseMusd("9"), "Vendor Y"),
    ).not.toBe(base)
    expect(
      itemHash("Cement bag 50kg", 201n, parseMusd("9"), "Vendor Y"),
    ).not.toBe(base)
    expect(
      itemHash("Cement bag 50kg", 200n, parseMusd("9") + 1n, "Vendor Y"),
    ).not.toBe(base)
    expect(
      itemHash("Cement bag 50kg", 200n, parseMusd("9"), "Vendor Z"),
    ).not.toBe(base)
  })
})
