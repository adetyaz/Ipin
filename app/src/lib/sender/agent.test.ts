import { describe, expect, it } from "vitest"

import { floatFitsCap, floatPerPeriod, TOPUPS_PER_PERIOD } from "./agent"

const cents = (n: bigint) => n * 10n ** 16n

describe("agent float (docs/wave2.md 3, step A)", () => {
  it("up to 5 weekly top-ups can land in one 30-day limit period", () => {
    expect(TOPUPS_PER_PERIOD).toBe(5n)
    expect(floatPerPeriod(cents(50n))).toBe(cents(250n))
  })

  it("test_R7_warnsWhenFloatWouldHitPotLimit", () => {
    expect(floatFitsCap(cents(50n), cents(250n))).toBe(true)
    expect(floatFitsCap(cents(51n), cents(250n))).toBe(false)
  })
})
