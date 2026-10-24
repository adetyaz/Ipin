// Holds the deployment and the chain gateway. Before the first deploy the
// relayer runs in "not deployed" mode and keeps looking for the deployment
// file, so `pnpm --filter relayer start` works before and after a deploy.
import type { Address } from "viem"

import { type Deployments, NotDeployedError } from "@ipin/shared"

import type { Chain } from "./chain"
import type { Logger } from "./logger"

export interface Runtime {
  readonly relayerAddress: Address
  readonly chainId: number
  /** Deployment + chain, or null while not deployed. Re-checks the file when null. */
  current(): { deployments: Deployments; chain: Chain } | null
  /** Why `current()` is null (missing file or invalid file). */
  reason(): string | undefined
}

export function createRuntime(opts: {
  relayerAddress: Address
  chainId: number
  load: () => Deployments
  makeChain: (d: Deployments) => Chain
  logger: Logger
}): Runtime {
  let state: { deployments: Deployments; chain: Chain } | null = null
  let lastReason: string | undefined
  let lastLogged: string | undefined

  const tryLoad = (): void => {
    try {
      const deployments = opts.load()
      if (deployments.chainId !== opts.chainId) {
        throw new Error(
          `deployment chainId ${deployments.chainId} != relayer chain ${opts.chainId}`,
        )
      }
      state = { deployments, chain: opts.makeChain(deployments) }
      lastReason = undefined
      opts.logger.info(
        {
          vault: deployments.vault,
          deployBlock: deployments.deployBlock.toString(),
        },
        "deployment loaded",
      )
      if (deployments.relayer !== opts.relayerAddress) {
        opts.logger.warn(
          {
            deploymentRelayer: deployments.relayer,
            relayerKey: opts.relayerAddress,
          },
          "RELAYER_PRIVATE_KEY is not the deployment's relayer: payments still settle, but fees accrue to the deployment's relayer address",
        )
      }
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err)
      if (lastReason !== lastLogged) {
        lastLogged = lastReason
        if (err instanceof NotDeployedError) {
          opts.logger.warn(lastReason)
        } else {
          opts.logger.error({ err }, "deployment file unusable")
        }
      }
    }
  }

  return {
    relayerAddress: opts.relayerAddress,
    chainId: opts.chainId,
    current() {
      if (state === null) tryLoad()
      return state
    },
    reason: () => lastReason,
  }
}
