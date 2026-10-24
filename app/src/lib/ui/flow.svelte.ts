import type { Hex } from "viem"

import { txErrorMessage } from "#/chain/vault"

export type StepStatus = "waiting" | "active" | "done" | "error" | "skipped"

export interface Step {
  /** What happens, in plain words: "Create the House pot". */
  label: string
  status: StepStatus
  /** Shown while active, e.g. "Confirm in MetaMask". */
  hint?: string
  hash?: Hex
  error?: string
}

export interface StepDef {
  label: string
  hint?: string
  /** Return a tx hash to link it, null when the step was not needed. */
  run: () => Promise<Hex | null | void>
}

/**
 * A short sequence of wallet steps (sign, send, wait) with a plain-English
 * state for each, so nobody stares at a spinner wondering what is happening.
 */
export class Flow {
  steps = $state<Step[]>([])
  running = $state(false)
  done = $state(false)
  error = $state<string | null>(null)

  async run(defs: StepDef[]): Promise<boolean> {
    this.steps = defs.map((d) => ({
      label: d.label,
      status: "waiting" as const,
      ...(d.hint ? { hint: d.hint } : {}),
    }))
    this.running = true
    this.done = false
    this.error = null
    for (const [i, def] of defs.entries()) {
      const step = this.steps[i]
      if (!step) continue
      step.status = "active"
      try {
        const hash = await def.run()
        step.status = hash === null ? "skipped" : "done"
        if (hash) step.hash = hash
      } catch (err) {
        const message = txErrorMessage(err)
        step.status = "error"
        step.error = message
        this.error = message
        this.running = false
        return false
      }
    }
    this.running = false
    this.done = true
    return true
  }

  reset() {
    this.steps = []
    this.running = false
    this.done = false
    this.error = null
  }
}
