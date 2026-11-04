import { describe, expect, it } from "vitest"

import { potNameError } from "#/chain/vault"
import { parseUsdInput } from "#/money/format"

import { templateById, TEMPLATES } from "./templates"

describe("purpose templates (docs/wave2.md 1)", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s fills a form the create-pots flow accepts",
    (_, t) => {
      expect(t.pots.length).toBeGreaterThan(0)
      expect(t.pots.length).toBeLessThanOrEqual(10) // MAX_SPLIT_POTS
      const names = t.pots.map((p) => p.name)
      expect(new Set(names).size).toBe(names.length)
      for (const p of t.pots) {
        expect(potNameError(p.name)).toBeNull()
        const cap = parseUsdInput(p.cap)
        expect(cap.ok && cap.value > 0n).toBe(true)
      }
      expect(t.pieces).toHaveLength(t.pots.length)
      expect(t.pieces[t.restIndex]).toBe("")
      if (t.addMoney) {
        const total = parseUsdInput(t.total)
        expect(total.ok && total.value > 0n).toBe(true)
        let fixed = 0n
        for (const [i, s] of t.pieces.entries()) {
          if (i === t.restIndex) continue
          const v = parseUsdInput(s)
          expect(v.ok).toBe(true)
          if (v.ok) fixed += v.value
        }
        if (total.ok) expect(fixed).toBeLessThanOrEqual(total.value)
      }
    },
  )

  it("the agent float fits the agent pot's limit (R7)", () => {
    // 0.50 a week is at most 5 payments in any 30-day period: 2.50.
    const agent = templateById("agent")
    const cap = parseUsdInput(agent?.pots[0]?.cap ?? "")
    expect(cap.ok && cap.value).toBe(250n * 10n ** 16n)
  })
})
