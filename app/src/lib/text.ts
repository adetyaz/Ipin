/** Short form of an address for display: 0x1234…abcd. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Unix seconds (bigint, from chain) to a JS Date. Timestamps, not amounts. */
export function dateFromSeconds(seconds: bigint): Date {
  return new Date(parseInt(seconds.toString(), 10) * 1000)
}

const dayFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})
const timeFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
})

export function formatDay(seconds: bigint): string {
  return dayFmt.format(dateFromSeconds(seconds))
}

export function formatWhen(input: bigint | string): string {
  const d = typeof input === "bigint" ? dateFromSeconds(input) : new Date(input)
  return timeFmt.format(d)
}

/** Seconds since the epoch, now, as bigint. */
export function nowSeconds(): bigint {
  return BigInt(Date.now()) / 1000n
}
