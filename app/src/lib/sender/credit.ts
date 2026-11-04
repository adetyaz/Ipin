import { BORROW_SAFETY_RATIO } from "@ipin/shared"

/**
 * R13: before the sender signs a loan, show what it does to their Mezo trove
 * and refuse one that would leave it thin. Mezo itself only refuses below
 * 110% (MCR); the app keeps a wider margin, 150% (docs/wave2.md 4a,
 * proposed). bigint only, 18 decimals.
 */
export interface CreditLine {
  /** BTC collateral, 18 decimals. */
  coll: bigint
  /** Total debt including interest, MUSD 18 decimals. */
  debt: bigint
  /** BTC price in MUSD, 18 decimals (Mezo PriceFeed). */
  price: bigint
  /** Mezo's per-trove borrowing cap. */
  maxBorrowingCapacity: bigint
  /** Mezo's borrowing fee rate, 18 decimals (0.1% = 1e15). */
  borrowingRate: bigint
}

export interface LoanCheck {
  ok: boolean
  reason?: "ratio" | "capacity"
  ratioNow: bigint | null
  ratioAfter: bigint | null
  newDebt: bigint
}

const E18 = 10n ** 18n

/** Collateral ratio, 18 decimals; null when there is no debt. */
export function collateralRatio(
  coll: bigint,
  debt: bigint,
  price: bigint,
): bigint | null {
  return debt === 0n ? null : (coll * price) / debt
}

export function checkLoan(line: CreditLine, loan: bigint): LoanCheck {
  const fee = (loan * line.borrowingRate) / E18
  const newDebt = line.debt + loan + fee
  const ratioNow = collateralRatio(line.coll, line.debt, line.price)
  const ratioAfter = collateralRatio(line.coll, newDebt, line.price)
  const base = { ratioNow, ratioAfter, newDebt }
  if (newDebt > line.maxBorrowingCapacity) {
    return { ok: false, reason: "capacity", ...base }
  }
  if (ratioAfter !== null && ratioAfter < BORROW_SAFETY_RATIO) {
    return { ok: false, reason: "ratio", ...base }
  }
  return { ok: true, ...base }
}

/** "150%" (whole percent, rounded down). */
export function formatRatio(ratio: bigint | null): string {
  return ratio === null ? "no debt" : `${(ratio * 100n) / E18}%`
}
