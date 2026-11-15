import { DAY } from "./subscribe"

/**
 * x402 agent budgets, step A (docs/wave2.md 3): a schedule tops up the
 * agent's own wallet from the pot. The agent pays services with a standard
 * x402 client from that float, so the most it can ever spend is the float;
 * it never touches the pot.
 */
export const WEEK = 7n * DAY
/** Pot limits are per 30 days (ADR-003). */
const PERIOD = 30n * DAY

/** Most weekly top-ups that can land in one 30-day limit period. */
export const TOPUPS_PER_PERIOD = (PERIOD + WEEK - 1n) / WEEK // 5

/** The most the float can draw from the pot in one limit period. */
export function floatPerPeriod(perWeek: bigint): bigint {
  return perWeek * TOPUPS_PER_PERIOD
}

/** True when every weekly top-up fits the pot's monthly limit (R7). */
export function floatFitsCap(perWeek: bigint, cap: bigint): boolean {
  return floatPerPeriod(perWeek) <= cap
}
