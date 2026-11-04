import { describe, expect, it } from "vitest"

import { checkLoan, type CreditLine, formatRatio } from "./credit"

const E18 = 10n ** 18n
// Roughly the demo trove: 0.034 BTC at $79,312, ~2,002 MUSD debt.
const line: CreditLine = {
  coll: 34n * 10n ** 15n,
  debt: 2_002n * E18,
  price: 79_312n * E18,
  maxBorrowingCapacity: 2_400n * E18,
  borrowingRate: E18 / 1000n,
}

describe("checkLoan (R13: the app guards the sender's trove)", () => {
  it("test_R13_showsRatioBeforeAndAfter", () => {
    const healthy = { ...line, coll: 10n ** 17n } // 0.1 BTC
    const r = checkLoan(healthy, (125n * E18) / 100n)
    expect(r.ok).toBe(true)
    // 0.1 * 79312 / 2002 = 3.9616...
    expect(formatRatio(r.ratioNow)).toBe("396%")
    expect((r.ratioAfter ?? 0n) < (r.ratioNow ?? 0n)).toBe(true)
    // debt grows by the loan plus Mezo's borrowing fee
    expect(r.newDebt).toBe(
      line.debt + (125n * E18) / 100n + (125n * E18) / 100n / 1000n,
    )
  })

  it("test_R13_blocksLoanUnderSafetyRatio", () => {
    // The demo trove already sits at ~134%, under the 150% margin.
    const thin = checkLoan(line, (125n * E18) / 100n)
    expect(thin.ok).toBe(false)
    expect(thin.reason).toBe("ratio")
    expect(formatRatio(thin.ratioNow)).toBe("134%")
    const healthy = {
      ...line,
      coll: 10n ** 17n,
      maxBorrowingCapacity: 10n ** 30n,
    } // ~396%
    expect(checkLoan(healthy, 50n * E18).ok).toBe(true)
    const r = checkLoan(healthy, 4_000n * E18)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("ratio")
  })

  it("test_R13_blocksLoanOverBorrowingCapacity", () => {
    const rich = { ...line, coll: 10n ** 18n }
    const r = checkLoan(rich, 500n * E18)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe("capacity")
  })

  it("formats ratios without floats", () => {
    expect(formatRatio((15n * E18) / 10n)).toBe("150%")
    expect(formatRatio(null)).toBe("no debt")
  })
})
