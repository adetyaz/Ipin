import { describe, expect, it } from "vitest"

import {
  AmountFormatError,
  formatMusd,
  MAX_UINT256,
  MUSD_UNIT,
  parseBaseUnits,
  parseMusd,
  uint256String,
} from "../src"

function randomBigint(bytes: number): bigint {
  const buf = new Uint8Array(bytes)
  globalThis.crypto.getRandomValues(buf)
  let n = 0n
  for (const b of buf) n = (n << 8n) | BigInt(b)
  return n
}

describe("R1 parseMusd", () => {
  it.each([
    ["0", 0n],
    ["0.0", 0n],
    ["1", MUSD_UNIT],
    ["1.5", 1_500_000_000_000_000_000n],
    ["0.25", 250_000_000_000_000_000n],
    ["0.000000000000000001", 1n],
    ["12.340000000000000000", 12_340_000_000_000_000_000n],
    [
      "999999999999.999999999999999999",
      999_999_999_999_999_999_999_999_999_999n,
    ],
    ["9", 9n * MUSD_UNIT],
  ])("test_R1_amountsAreBaseUnits: %s", (input, expected) => {
    expect(parseMusd(input)).toBe(expected)
  })

  it.each([
    "",
    " 1",
    "1 ",
    "-1",
    "+1",
    "1e18",
    "1.",
    ".5",
    "01",
    "1,5",
    "0x10",
    "NaN",
    "Infinity",
    "1.0000000000000000001",
  ])("test_R1_rejectsAmbiguousInput: %j", (input) => {
    expect(() => parseMusd(input)).toThrow(AmountFormatError)
  })

  it("test_R1_neverRoundsExtraDecimals", () => {
    expect(() => parseMusd("0.0000000000000000015")).toThrow(/decimals/)
  })

  it("test_R1_rejectsAboveUint256", () => {
    const tooBig = (MAX_UINT256 / MUSD_UNIT + 1n).toString()
    expect(() => parseMusd(tooBig)).toThrow(/uint256/)
  })
})

describe("R1 formatMusd", () => {
  it.each([
    [0n, "0"],
    [1n, "0.000000000000000001"],
    [MUSD_UNIT, "1"],
    [1_500_000_000_000_000_000n, "1.5"],
    [250_000_000_000_000_000n, "0.25"],
    [-250_000_000_000_000_000n, "-0.25"],
    [10n ** 30n, "1000000000000"],
  ])("formats %s as %s", (amount, expected) => {
    expect(formatMusd(amount)).toBe(expected)
  })

  it("truncates toward zero with maxDecimals and pads with minDecimals", () => {
    expect(formatMusd(1_999_000_000_000_000_000n, { maxDecimals: 2 })).toBe(
      "1.99",
    )
    expect(formatMusd(5n * MUSD_UNIT, { minDecimals: 2 })).toBe("5.00")
    expect(formatMusd(1n, { maxDecimals: 2, minDecimals: 2 })).toBe("0.00")
    expect(formatMusd(-1n, { maxDecimals: 2 })).toBe("0")
  })

  it("testFuzz_R1_noPrecisionLossOnRoundTrip", () => {
    const samples = [0n, 1n, MUSD_UNIT - 1n, MUSD_UNIT, MAX_UINT256]
    for (let i = 0; i < 500; i++) samples.push(randomBigint(1 + (i % 32)))
    for (const amount of samples) {
      expect(parseMusd(formatMusd(amount))).toBe(amount)
      expect(parseBaseUnits(amount.toString())).toBe(amount)
    }
  })
})

describe("R1 wire base units", () => {
  it("parses decimal strings of base units only", () => {
    expect(parseBaseUnits("1500000000000000000")).toBe(
      1_500_000_000_000_000_000n,
    )
    expect(() => parseBaseUnits("1.5")).toThrow(AmountFormatError)
    expect(() => parseBaseUnits("-1")).toThrow(AmountFormatError)
    expect(() => parseBaseUnits("007")).toThrow(AmountFormatError)
    expect(() => parseBaseUnits((MAX_UINT256 + 1n).toString())).toThrow(
      /uint256/,
    )
  })

  it("zod uint256String rejects numbers and floats", () => {
    expect(uint256String.parse("42")).toBe(42n)
    expect(uint256String.safeParse(42).success).toBe(false)
    expect(uint256String.safeParse("4.2").success).toBe(false)
    expect(uint256String.safeParse((MAX_UINT256 + 1n).toString()).success).toBe(
      false,
    )
  })
})
