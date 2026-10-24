/**
 * Split maths, mirroring Pots._creditDeposit exactly (R2):
 *   piece_i   = amount * bps_i / 10_000   (rounds down)
 *   remainder = amount - sum(piece_i)     -> added to the named remainder pot
 * so the credits always sum to the deposit.
 */
export const BPS_TOTAL = 10_000n

export function computeCredits(
  amount: bigint,
  bps: readonly bigint[],
  remainderIndex: number,
): { credits: bigint[]; remainder: bigint } {
  const pieces = bps.map((w) => (amount * w) / BPS_TOTAL)
  const credited = pieces.reduce((a, b) => a + b, 0n)
  const remainder = amount - credited
  const credits = pieces.map((p, i) =>
    i === remainderIndex ? p + remainder : p,
  )
  return { credits, remainder }
}

export type SplitPlan =
  | {
      ok: true
      /** The remainder pot's piece: the deposit minus every other piece. */
      rest: bigint
      /** Weights for createSplit; they sum to exactly 10_000. */
      bps: bigint[]
      /** What each pot will actually be credited on-chain. */
      credits: bigint[]
      /** True when every credit equals the piece the sender typed. */
      exact: boolean
    }
  | { ok: false; error: string; rest: bigint }

/**
 * Turn the sender's pieces into a split. The remainder pot's piece is not
 * typed: it is whatever is left, so the pieces always sum to the deposit.
 *
 * @param total Deposit amount, base units.
 * @param pieces Typed piece per pot (the remainder pot's entry is ignored).
 * @param remainderIndex Index of the named remainder pot.
 */
export function planSplit(
  total: bigint,
  pieces: readonly bigint[],
  remainderIndex: number,
): SplitPlan {
  if (remainderIndex < 0 || remainderIndex >= pieces.length) {
    return { ok: false, error: "Choose which pot gets the rest.", rest: 0n }
  }
  const others = pieces.reduce(
    (sum, p, i) => (i === remainderIndex ? sum : sum + p),
    0n,
  )
  const rest = total - others
  if (total <= 0n) {
    return { ok: false, error: "Enter an amount to deposit.", rest }
  }
  if (rest < 0n) {
    return {
      ok: false,
      error: "The pieces add up to more than the deposit.",
      rest,
    }
  }
  const full = pieces.map((p, i) => (i === remainderIndex ? rest : p))
  if (full.some((p) => p <= 0n)) {
    return { ok: false, error: "Every pot needs more than $0.00.", rest }
  }
  const bps = full.map((p, i) =>
    i === remainderIndex ? 0n : (p * BPS_TOTAL) / total,
  )
  const used = bps.reduce((a, b) => a + b, 0n)
  bps[remainderIndex] = BPS_TOTAL - used
  if (bps.some((w) => w <= 0n)) {
    return {
      ok: false,
      error:
        "One piece is too small to split. Make it at least 0.01% of the deposit.",
      rest,
    }
  }
  const { credits } = computeCredits(total, bps, remainderIndex)
  const exact = credits.every((c, i) => c === full[i])
  return { ok: true, rest, bps, credits, exact }
}
