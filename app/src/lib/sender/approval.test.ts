import { describe, expect, it } from "vitest"

import {
  approvalExpiry,
  DEFAULT_APPROVAL_TTL,
  MAX_APPROVAL_TTL,
} from "./approval"

describe("approvalExpiry (L-02: expiry capped off-chain)", () => {
  const now = 1_800_000_000n

  it("defaults to one hour", () => {
    expect(approvalExpiry(now)).toBe(now + DEFAULT_APPROVAL_TTL)
    expect(DEFAULT_APPROVAL_TTL).toBe(3600n)
  })

  it("never goes beyond 7 days", () => {
    expect(MAX_APPROVAL_TTL).toBe(604_800n)
    expect(approvalExpiry(now, 30n * 86_400n)).toBe(now + MAX_APPROVAL_TTL)
    expect(approvalExpiry(now, 2n ** 255n)).toBe(now + MAX_APPROVAL_TTL)
    expect(approvalExpiry(now, MAX_APPROVAL_TTL)).toBe(now + MAX_APPROVAL_TTL)
  })

  it("rejects a non-positive lifetime", () => {
    expect(() => approvalExpiry(now, 0n)).toThrow()
  })
})
