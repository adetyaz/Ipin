import { z } from "zod"

/** MUSD has 18 decimals; every amount is bigint base units (R1). */
export const MUSD_DECIMALS = 18
export const MUSD_UNIT = 10n ** 18n
export const MAX_UINT256 = 2n ** 256n - 1n

const DECIMAL_RE = /^(0|[1-9]\d*)(\.\d+)?$/
const BASE_UNITS_RE = /^(0|[1-9]\d*)$/

export class AmountFormatError extends Error {
  override name = "AmountFormatError"
}

/**
 * Parse a human MUSD amount ("12.5") into base units. Never rounds: more than
 * 18 decimals, signs, exponents, spaces or empty input throw (R1).
 */
export function parseMusd(input: string): bigint {
  const match = DECIMAL_RE.exec(input)
  if (!match) {
    throw new AmountFormatError(`not a decimal MUSD amount: "${input}"`)
  }
  const whole = match[1] ?? "0"
  const frac = (match[2] ?? ".").slice(1)
  if (frac.length > MUSD_DECIMALS) {
    throw new AmountFormatError(
      `more than ${MUSD_DECIMALS} decimals: "${input}"`,
    )
  }
  const value =
    BigInt(whole) * MUSD_UNIT + BigInt(frac.padEnd(MUSD_DECIMALS, "0"))
  if (value > MAX_UINT256) throw new AmountFormatError("exceeds uint256")
  return value
}

export interface FormatMusdOptions {
  /** Keep at most this many decimals, truncating toward zero (never rounds up). */
  maxDecimals?: number
  /** Pad to at least this many decimals ("5" -> "5.00"). */
  minDecimals?: number
}

/** Format base units as a decimal MUSD string. Exact unless `maxDecimals` truncates. */
export function formatMusd(
  amount: bigint,
  opts: FormatMusdOptions = {},
): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const whole = abs / MUSD_UNIT
  let frac = (abs % MUSD_UNIT).toString().padStart(MUSD_DECIMALS, "0")
  if (opts.maxDecimals !== undefined) frac = frac.slice(0, opts.maxDecimals)
  frac = frac.replace(/0+$/, "")
  if (opts.minDecimals !== undefined) frac = frac.padEnd(opts.minDecimals, "0")
  const body = frac.length > 0 ? `${whole}.${frac}` : whole.toString()
  const isZero = !/[1-9]/.test(body)
  return negative && !isZero ? `-${body}` : body
}

/** Parse a decimal string of base units ("1500000000000000000") as used on the wire. */
export function parseBaseUnits(input: string): bigint {
  if (!BASE_UNITS_RE.test(input)) {
    throw new AmountFormatError(`not base units: "${input}"`)
  }
  const value = BigInt(input)
  if (value > MAX_UINT256) throw new AmountFormatError("exceeds uint256")
  return value
}

/** Zod: decimal string of uint256 base units -> bigint. */
export const uint256String = z
  .string()
  .regex(BASE_UNITS_RE, "expected a decimal string of base units")
  .refine(
    (s) => BASE_UNITS_RE.test(s) && BigInt(s) <= MAX_UINT256,
    "exceeds uint256",
  )
  .transform((s) => BigInt(s))
