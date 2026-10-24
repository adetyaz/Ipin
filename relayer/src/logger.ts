// Pino JSON logs to stdout and <LOG_DIR>/relayer.log so humans and agents can
// read the same stream. Never log keys or full signatures (T5).
import { join } from "node:path"
import pino, { type Logger } from "pino"

export type { Logger }

export function createLogger(opts: { level: string; dir?: string }): Logger {
  const streams: pino.StreamEntry[] = [{ stream: process.stdout }]
  if (opts.dir !== undefined) {
    streams.push({
      stream: pino.destination({
        dest: join(opts.dir, "relayer.log"),
        mkdir: true,
        sync: false,
      }),
    })
  }
  return pino(
    {
      level: opts.level,
      base: { service: "ipin-relayer" },
      redact: ["privateKey", "*.privateKey", "signature", "*.signature"],
    },
    pino.multistream(streams),
  )
}

/** First and last bytes of a signature, for logs. */
export function shortHex(hex: string): string {
  return hex.length <= 14 ? hex : `${hex.slice(0, 8)}…${hex.slice(-4)}`
}
