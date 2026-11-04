import { type Address, getAddress, isAddress } from "viem"

/**
 * Merchant subscribe links (docs/wave2.md 2.2). A merchant shares
 * `/send/subscribe?to=<payee>&amount=<base units>&every=<days>&name=<merchant>`.
 * The link only describes terms: the sender reads them on screen, picks a pot
 * and signs one transaction that adds the payee and creates the schedule. The
 * merchant never gets an allowance on the sender's wallet; money only leaves
 * the pot, within its cap (R7, R9, I5).
 */
export const DAY = 24n * 60n * 60n
export const MAX_INTERVAL_DAYS = 365n
export const MAX_MERCHANT_NAME = 40

export interface SubscribeTerms {
  payee: Address
  /** MUSD base units (18 decimals). */
  amount: bigint
  /** Seconds between payments. */
  interval: bigint
  intervalDays: bigint
  merchant: string
}

export type ParsedLink =
  { ok: true; terms: SubscribeTerms } | { ok: false; error: string }

const UINT = /^[0-9]{1,78}$/

export function parseSubscribeLink(q: URLSearchParams): ParsedLink {
  const to = q.get("to") ?? ""
  const amount = q.get("amount") ?? ""
  const every = q.get("every") ?? ""
  const merchant = (q.get("name") ?? "").trim()
  if (!isAddress(to, { strict: false })) {
    return { ok: false, error: "The link has no valid payee address." }
  }
  if (
    !UINT.test(amount) ||
    BigInt(amount) === 0n ||
    BigInt(amount) >= 2n ** 256n
  ) {
    return { ok: false, error: "The link's amount isn't valid." }
  }
  if (!UINT.test(every)) {
    return { ok: false, error: "The link's interval isn't valid." }
  }
  const days = BigInt(every)
  if (days < 1n || days > MAX_INTERVAL_DAYS) {
    return { ok: false, error: "Payments must be 1 to 365 days apart." }
  }
  if (merchant === "" || merchant.length > MAX_MERCHANT_NAME) {
    return {
      ok: false,
      error: "The link needs a merchant name (40 characters at most).",
    }
  }
  return {
    ok: true,
    terms: {
      payee: getAddress(to),
      amount: BigInt(amount),
      interval: days * DAY,
      intervalDays: days,
      merchant,
    },
  }
}

export function buildSubscribeLink(
  origin: string,
  t: { payee: string; amount: bigint; intervalDays: bigint; merchant: string },
): string {
  const q = new URLSearchParams({
    to: t.payee,
    amount: t.amount.toString(),
    every: t.intervalDays.toString(),
    name: t.merchant.trim(),
  })
  return `${origin}/send/subscribe?${q.toString()}`
}

/** How much the pot is short of the next payment plus the relayer fee. */
export function shortfall(
  balance: bigint,
  amount: bigint,
  fee: bigint,
): bigint {
  const need = amount + fee
  return balance >= need ? 0n : need - balance
}

/** "every day", "every week", "every 30 days". */
export function formatEvery(intervalSeconds: bigint): string {
  const days = intervalSeconds / DAY
  if (intervalSeconds % DAY !== 0n) return "on a custom schedule"
  if (days === 1n) return "every day"
  if (days === 7n) return "every week"
  return `every ${days.toString()} days`
}
