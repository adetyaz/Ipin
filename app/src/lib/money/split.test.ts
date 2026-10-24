import { describe, expect, it } from "vitest"

import { parseUsdInput } from "./format"
import { BPS_TOTAL, computeCredits, planSplit } from "./split"

const m = (s: string) => {
  const r = parseUsdInput(s)
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n)

describe("computeCredits mirrors the contract (R2)", () => {
  it("credits sum to the deposit and the remainder goes to the named pot", () => {
    const { credits, remainder } = computeCredits(10n, [3333n, 3333n, 3334n], 1)
    expect(sum(credits)).toBe(10n)
    expect(remainder).toBe(1n)
    expect(credits[1]).toBe(4n)
  })
  it("holds for many amounts", () => {
    const bps = [7001n, 1999n, 1000n]
    for (let a = 1n; a < 2000n; a += 7n) {
      const { credits, remainder } = computeCredits(a, bps, 2)
      expect(sum(credits)).toBe(a)
      expect(remainder < 3n).toBe(true)
    }
  })
})

describe("planSplit (split editor)", () => {
  it("house story: 10 -> House 7.50, Upkeep gets the rest", () => {
    const plan = planSplit(m("10"), [m("7.50"), 0n], 1)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.rest).toBe(m("2.50"))
    expect(plan.bps).toEqual([7500n, 2500n])
    expect(plan.credits).toEqual([m("7.50"), m("2.50")])
    expect(plan.exact).toBe(true)
  })
  it("weights sum to exactly 10_000 and credits to the deposit", () => {
    const plan = planSplit(m("10"), [m("3.33"), m("3.33"), 0n], 2)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(sum(plan.bps)).toBe(BPS_TOTAL)
    expect(sum(plan.credits)).toBe(m("10"))
    expect(plan.rest).toBe(m("3.34"))
  })
  it("flags pieces that basis points cannot express exactly", () => {
    const plan = planSplit(m("10"), [m("3.333333"), 0n], 1)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.exact).toBe(false)
    expect(sum(plan.credits)).toBe(m("10"))
  })
  it("rejects over-allocation, empty pots and a missing remainder pot", () => {
    expect(planSplit(m("10"), [m("11"), 0n], 1).ok).toBe(false)
    expect(planSplit(m("10"), [m("10"), 0n], 1).ok).toBe(false)
    expect(planSplit(m("10"), [0n, 0n], 1).ok).toBe(false)
    expect(planSplit(m("10"), [m("5"), 0n], 5).ok).toBe(false)
    expect(planSplit(0n, [0n, 0n], 1).ok).toBe(false)
  })
  it("reports how far over the pieces are", () => {
    expect(planSplit(m("10"), [m("12"), 0n], 1).rest).toBe(-m("2"))
  })
})
