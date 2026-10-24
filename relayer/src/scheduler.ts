// Every SCHEDULER_INTERVAL_MS: read schedules from the Vault and call
// executeSchedule for each active one whose next period is due (R9). The Vault
// enforces due dates, caps and payees; we simulate first so nothing that would
// revert is broadcast.
import { describeError, SimulationError } from "./chain"
import type { Logger } from "./logger"
import type { Runtime } from "./runtime"

export interface TickResult {
  checked: number
  executed: string[]
  skipped: { id: string; reason: string }[]
}

export async function runSchedulerTick(
  runtime: Runtime,
  logger: Logger,
): Promise<TickResult | null> {
  const current = runtime.current()
  if (current === null) return null
  const { chain } = current
  const result: TickResult = { checked: 0, executed: [], skipped: [] }

  const [count, now] = await Promise.all([
    chain.scheduleCount(),
    chain.latestTimestamp(),
  ])
  for (let id = 1n; id <= count; id++) {
    const schedule = await chain.getSchedule(id)
    result.checked++
    if (!schedule.active || schedule.potId === 0n || schedule.nextDue > now) {
      continue
    }
    try {
      const txHash = await chain.submitExecuteSchedule(id)
      const status = await chain.waitForReceipt(txHash)
      if (status === "success") {
        result.executed.push(id.toString())
        logger.info(
          {
            scheduleId: id.toString(),
            potId: schedule.potId.toString(),
            amount: schedule.amount.toString(),
            txHash,
          },
          "schedule executed",
        )
      } else {
        result.skipped.push({ id: id.toString(), reason: "reverted on-chain" })
        logger.error({ scheduleId: id.toString(), txHash }, "schedule reverted")
      }
    } catch (err) {
      const reason =
        err instanceof SimulationError ? err.reason : describeError(err)
      result.skipped.push({ id: id.toString(), reason })
      logger.warn(
        { scheduleId: id.toString(), reason },
        "schedule not executed",
      )
    }
  }
  return result
}

/** Runs ticks on an interval, never overlapping. Returns a stop function. */
export function startScheduler(
  runtime: Runtime,
  logger: Logger,
  intervalMs: number,
): () => void {
  let running = false
  const tick = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      const result = await runSchedulerTick(runtime, logger)
      if (result !== null && result.checked > 0) {
        logger.debug(result, "scheduler tick")
      }
    } catch (err) {
      logger.error({ reason: describeError(err) }, "scheduler tick failed")
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  return () => {
    clearInterval(timer)
  }
}
