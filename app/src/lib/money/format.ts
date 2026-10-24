import { formatUnits, parseUnits } from "viem"

/** MUSD has 18 decimals (R1). Amounts are always bigint base units. */
export const MUSD_DECIMALS = 18
const UNIT = 10n ** 18n

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Display a MUSD amount as dollars, e.g. `7500000000000000000n` -> "$7.50".
 * Display only (R1): the string is never parsed back into arithmetic.
 * Sub-cent dust is shown, not hidden, so a split remainder stays visible.
 */
export function formatUsd(
  amount: bigint,
  opts: { sign?: boolean; symbol?: boolean } = {},
): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const [int = "0", frac = ""] = formatUnits(abs, MUSD_DECIMALS).split(".")
  const cents = frac.length > 2 ? frac.replace(/0+$/, "") : frac.padEnd(2, "0")
  const symbol = opts.symbol === false ? "" : "$"
  const prefix = negative ? "−" : opts.sign && abs > 0n ? "+" : ""
  return `${prefix}${symbol}${groupThousands(int)}.${cents.padEnd(2, "0")}`
}

/** Whole dollars and the cents part, for the big-number display. */
export function splitUsd(amount: bigint): { dollars: string; cents: string } {
  const s = formatUsd(amount < 0n ? -amount : amount, { symbol: false })
  const [dollars = "0", cents = "00"] = s.split(".")
  return { dollars, cents }
}

/**
 * Approximate naira for a MUSD amount, given a whole-number rate of naira per
 * dollar. Integer maths only; rounds down to whole naira.
 */
export function formatNgn(amount: bigint, nairaPerUsd: bigint): string {
  const naira = (amount * nairaPerUsd) / UNIT
  return `₦${groupThousands(naira.toString())}`
}

export type ParseResult =
  { ok: true; value: bigint } | { ok: false; error: string }

/**
 * Parse what a person typed into a dollar field. Accepts "7.5", "$7.50",
 * "1,000". Rejects negatives, more than 18 decimals, and anything else.
 */
export function parseUsdInput(raw: string): ParseResult {
  const s = raw.trim().replace(/^\$/, "").replace(/,/g, "")
  if (s === "") return { ok: false, error: "Enter an amount." }
  if (!/^\d*\.?\d*$/.test(s) || s === ".") {
    return { ok: false, error: "Use numbers only, like 7.50." }
  }
  const frac = s.split(".")[1] ?? ""
  if (frac.length > MUSD_DECIMALS) {
    return { ok: false, error: "That has more decimal places than MUSD." }
  }
  return { ok: true, value: parseUnits(s, MUSD_DECIMALS) }
}

/** Plain-number input for an editable field, e.g. 7.5 MUSD -> "7.50". */
export function toInputString(amount: bigint): string {
  return formatUsd(amount, { symbol: false }).replace(/,/g, "")
}
