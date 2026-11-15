import { describe, expect, it } from "vitest"

import {
  buildSubscribeLink,
  DAY,
  parseSubscribeLink,
  shortfall,
} from "./subscribe"

const gym = "0x2222222222222222222222222222222222222222"
const E18 = 10n ** 18n

describe("merchant subscribe link (docs/wave2.md 2.2)", () => {
  it("round-trips the terms exactly, amount in base units (no floats)", () => {
    const url = buildSubscribeLink("https://ipin-ten.vercel.app", {
      payee: gym,
      amount: (999n * E18) / 100n,
      intervalDays: 30n,
      merchant: "Lagos Gym",
    })
    expect(url).toBe(
      `https://ipin-ten.vercel.app/send/subscribe?to=${gym}&amount=9990000000000000000&every=30&name=Lagos+Gym`,
    )
    const r = parseSubscribeLink(new URL(url).searchParams)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.terms.amount).toBe((999n * E18) / 100n)
    expect(r.terms.interval).toBe(30n * DAY)
    expect(r.terms.merchant).toBe("Lagos Gym")
  })

  it("test_I5_rejectsLinkWithoutValidPayee", () => {
    const bad = parseSubscribeLink(
      new URLSearchParams("to=0x123&amount=1&every=30&name=X"),
    )
    expect(bad.ok).toBe(false)
  })

  it("rejects zero, decimal or huge amounts and silly intervals", () => {
    for (const q of [
      `to=${gym}&amount=0&every=30&name=X`,
      `to=${gym}&amount=1.5&every=30&name=X`,
      `to=${gym}&amount=-1&every=30&name=X`,
      `to=${gym}&amount=1&every=0&name=X`,
      `to=${gym}&amount=1&every=400&name=X`,
      `to=${gym}&amount=1&every=7.5&name=X`,
      `to=${gym}&amount=1&every=30&name=`,
    ]) {
      expect(parseSubscribeLink(new URLSearchParams(q)).ok, q).toBe(false)
    }
  })

  it("caps the merchant name so it can't push the terms off screen", () => {
    const r = parseSubscribeLink(
      new URLSearchParams(`to=${gym}&amount=1&every=30&name=${"A".repeat(80)}`),
    )
    expect(r.ok).toBe(false)
  })
})

describe("shortfall (docs/wave2.md 2.4)", () => {
  it("test_R9_warnsWhenPotCannotCoverNextPayment", () => {
    expect(shortfall(5n * E18, 4n * E18, E18 / 4n)).toBe(0n)
    expect(shortfall(5n * E18, 5n * E18, E18 / 4n)).toBe(E18 / 4n)
    expect(shortfall(0n, 5n * E18, E18 / 4n)).toBe(5n * E18 + E18 / 4n)
  })
})
