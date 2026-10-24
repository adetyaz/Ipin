/**
 * Expiry of a sender's PaymentRequest approval (R3).
 *
 * The contract accepts any expiry (docs/security-review.md L-02), so the app
 * caps it: a signed approval is usable for at most 7 days. By default it is
 * valid for one hour, enough for the relayer to submit it, short enough that
 * a forgotten signature dies on its own.
 */
export const DEFAULT_APPROVAL_TTL = 60n * 60n
export const MAX_APPROVAL_TTL = 7n * 24n * 60n * 60n

export function approvalExpiry(
  now: bigint,
  ttl: bigint = DEFAULT_APPROVAL_TTL,
): bigint {
  if (ttl <= 0n) throw new Error("Approval lifetime must be positive.")
  return now + (ttl > MAX_APPROVAL_TTL ? MAX_APPROVAL_TTL : ttl)
}
