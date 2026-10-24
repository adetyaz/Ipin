import { describe, expect, it } from "vitest"

import {
  formatNgn,
  formatUsd,
  parseUsdInput,
  splitUsd,
  toInputString,
} from "./format"

const musd = (s: string) => {
  const r = parseUsdInput(s)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe("formatUsd (R1 display)", () => {
  it("shows dollars and cents", () => {
    expect(formatUsd(7_500000000000000000n)).toBe("$7.50")
    expect(formatUsd(0n)).toBe("$0.00")
    expect(formatUsd(1_000_000n * 10n ** 18n)).toBe("$1,000,000.00")
  })
  it("keeps sub-cent dust visible instead of rounding it away", () => {
    expect(formatUsd(1n)).toBe("$0.000000000000000001")
    expect(formatUsd(musd("2.505"))).toBe("$2.505")
  })
  it("signs and negatives", () => {
    expect(formatUsd(musd("5"), { sign: true })).toBe("+$5.00")
    expect(formatUsd(-musd("5"))).toBe("−$5.00")
    expect(formatUsd(musd("5"), { symbol: false })).toBe("5.00")
  })
  it("splits for the big number", () => {
    expect(splitUsd(musd("1234.5"))).toEqual({ dollars: "1,234", cents: "50" })
  })
  it("naira uses integer maths", () => {
    expect(formatNgn(musd("7.50"), 1600n)).toBe("₦12,000")
    expect(formatNgn(1n, 1600n)).toBe("₦0")
  })
})

describe("parseUsdInput", () => {
  it("parses exact base units", () => {
    expect(musd("7.5")).toBe(7_500000000000000000n)
    expect(musd("$1,000")).toBe(1000n * 10n ** 18n)
    expect(musd(".25")).toBe(250000000000000000n)
    expect(musd("0.000000000000000001")).toBe(1n)
  })
  it("rejects bad input with plain words", () => {
    for (const bad of ["", "-1", "abc", "1.2.3", ".", "1e5"]) {
      expect(parseUsdInput(bad).ok).toBe(false)
    }
    expect(parseUsdInput("1.0000000000000000001").ok).toBe(false)
  })
  it("round-trips through the input string", () => {
    for (const s of ["7.50", "0.01", "10.00", "2.505"]) {
      expect(toInputString(musd(s))).toBe(s)
    }
  })
})
