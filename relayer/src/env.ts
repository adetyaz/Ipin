// The one place configuration enters the relayer (T4, T5). Validated at startup.
import { fileURLToPath } from "node:url"
import { z } from "zod"

import { MEZO_TESTNET_RPC_URL } from "@ipin/shared"

const relayerDir = fileURLToPath(new URL("..", import.meta.url))

const envSchema = z.object({
  RPC_URL: z.url().default(MEZO_TESTNET_RPC_URL),
  RELAYER_PRIVATE_KEY: z
    .string()
    .trim()
    .transform((s) => (s.startsWith("0x") ? s : `0x${s}`))
    .pipe(
      z
        .string()
        .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte hex private key"),
    )
    .transform((s) => s as `0x${string}`),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default("0.0.0.0"),
  APP_URL: z.url().default("http://localhost:5173"),
  /** Comma-separated origins, or "*". Defaults to APP_URL. */
  CORS_ORIGIN: z.string().optional(),
  DATA_DIR: z.string().default(`${relayerDir}data`),
  LOG_DIR: z.string().default(`${relayerDir}logs`),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  /** Defaults to <repo>/deployments/mezo-testnet.json. */
  DEPLOYMENTS_PATH: z.string().optional(),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
})

export type Env = Omit<z.output<typeof envSchema>, "CORS_ORIGIN"> & {
  CORS_ORIGIN: string[] | "*"
}

export class EnvError extends Error {
  override name = "EnvError"
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  )
  const result = envSchema.safeParse(cleaned)
  if (!result.success) {
    throw new EnvError(
      `Invalid relayer environment (see relayer/.env.example):\n${z.prettifyError(result.error)}`,
    )
  }
  const { CORS_ORIGIN, ...rest } = result.data
  const raw = CORS_ORIGIN ?? rest.APP_URL
  const origins =
    raw.trim() === "*"
      ? "*"
      : raw
          .split(",")
          .map((s) => s.trim().replace(/\/$/, ""))
          .filter((s) => s.length > 0)
  return {
    ...rest,
    APP_URL: rest.APP_URL.replace(/\/$/, ""),
    CORS_ORIGIN: origins,
  }
}

export const RELAYER_DIR = relayerDir
