// Entry point: `pnpm --filter relayer start`.
import { existsSync } from "node:fs"
import { join } from "node:path"
import { serve } from "@hono/node-server"
import { privateKeyToAccount } from "viem/accounts"

import { mezoTestnet } from "@ipin/shared"
import { loadDeployments } from "@ipin/shared/node"

import { createApp } from "./app"
import { createHttpChain, describeError } from "./chain"
import { type Env, parseEnv, RELAYER_DIR } from "./env"
import { createLogger, type Logger } from "./logger"
import { createRuntime } from "./runtime"
import { startScheduler } from "./scheduler"
import { describeBalance, RelayerService } from "./service"
import { Store } from "./store"

/** Below this the relayer may not afford gas for long (0.0001 BTC). */
const LOW_BALANCE_WEI = 10n ** 14n

function loadEnvFile(): void {
  const path = join(RELAYER_DIR, ".env")
  if (existsSync(path)) process.loadEnvFile(path)
}

async function reportStartup(
  env: Env,
  logger: Logger,
  service: RelayerService,
) {
  const health = await service.health()
  logger.info(
    { relayer: health.relayer, chainId: health.chainId, rpc: env.RPC_URL },
    `relayer ${health.relayer} on chain ${health.chainId}`,
  )
  if (!health.deployed) {
    logger.warn(
      `NOT DEPLOYED: ${health.error ?? "deployment file missing."} Serving /health; checking again every ${env.SCHEDULER_INTERVAL_MS / 1000}s.`,
    )
    return
  }
  if (health.relayerBalance === undefined) {
    logger.error(`DEPLOYED, but the RPC is unreachable: ${health.error ?? ""}`)
    return
  }
  if (!health.ok) logger.error(`DEPLOYED, but: ${health.error ?? "unhealthy"}`)
  const balance = BigInt(health.relayerBalance)
  const summary = describeBalance(balance)
  if (balance === 0n) {
    logger.error(
      `DEPLOYED but NOT FUNDED: relayer balance is 0 BTC. Fund ${health.relayer} from https://faucet.test.mezo.org`,
    )
  } else if (balance < LOW_BALANCE_WEI) {
    logger.warn(`DEPLOYED, relayer balance LOW: ${summary}`)
  } else {
    logger.info(`DEPLOYED and FUNDED: relayer balance ${summary}`)
  }
}

function main(): void {
  loadEnvFile()
  let env: Env
  try {
    env = parseEnv(process.env)
  } catch (err) {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  }
  const logger = createLogger({ level: env.LOG_LEVEL, dir: env.LOG_DIR })
  const account = privateKeyToAccount(env.RELAYER_PRIVATE_KEY)

  const runtime = createRuntime({
    relayerAddress: account.address,
    chainId: mezoTestnet.id,
    load: () =>
      loadDeployments(
        env.DEPLOYMENTS_PATH === undefined
          ? {}
          : { path: env.DEPLOYMENTS_PATH },
      ),
    makeChain: (d) =>
      createHttpChain({
        rpcUrl: env.RPC_URL,
        privateKey: env.RELAYER_PRIVATE_KEY,
        chain: mezoTestnet,
        vault: d.vault,
      }),
    logger,
  })
  const store = new Store(join(env.DATA_DIR, "relayer-db.json"))
  const service = new RelayerService({
    store,
    runtime,
    appUrl: env.APP_URL,
    logger,
  })
  const app = createApp({ service, logger, corsOrigin: env.CORS_ORIGIN })

  const server = serve(
    { fetch: app.fetch, port: env.PORT, hostname: env.HOST },
    (info) => {
      logger.info(`listening on http://${env.HOST}:${info.port}`)
    },
  )
  const stopScheduler = startScheduler(
    runtime,
    logger,
    env.SCHEDULER_INTERVAL_MS,
  )
  reportStartup(env, logger, service).catch((err: unknown) => {
    logger.error({ reason: describeError(err) }, "startup report failed")
  })

  const shutdown = (signal: string) => {
    logger.info(`${signal}: shutting down`)
    stopScheduler()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on("SIGINT", () => {
    shutdown("SIGINT")
  })
  process.on("SIGTERM", () => {
    shutdown("SIGTERM")
  })
}

main()
